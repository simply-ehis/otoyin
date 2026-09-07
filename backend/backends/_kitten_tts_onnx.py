"""
KittenTTS ONNX engine — vendored, torch-free.

Faithful local port of KittenML/kitten-tts (v0.8) inference. The 0.8 line is
ONNX-only (StyleTTS-2 based) and runs entirely on ONNX Runtime — no PyTorch,
no GPU required. Three checkpoints ship from the same family:

  - kitten-tts-mini-0.8   80M  (highest quality)
  - kitten-tts-micro-0.8  40M  (balanced)
  - kitten-tts-nano-0.8   15M  (smallest / fastest)

All three share the same inference contract: a ByT5-style phoneme token
sequence fed to the ONNX session alongside a per-voice style embedding and a
speed scalar. We drive the session directly (no ``kittentts`` wheel) so the
engine integrates with the rest of the project's ONNX backends.

Phonemization uses ``espeak`` via the ``phonemizer`` library when it is
installed (matches upstream quality). When it is absent we fall back to a
direct text-cleaning path — the model still produces intelligible speech,
just with less precise prosody. This keeps the engine runnable on a stock
onnxruntime install without dragging in espeak.

Voices (friendly -> internal style id), per the model ``config.json``:
  Bella -> expr-voice-2-f, Jasper -> expr-voice-2-m,
  Luna  -> expr-voice-3-f, Bruno  -> expr-voice-3-m,
  Rosie -> expr-voice-4-f, Hugo   -> expr-voice-4-m,
  Kiki  -> expr-voice-5-f, Leo    -> expr-voice-5-m  (default)
"""

from __future__ import annotations

import json
import logging
import re

import numpy as np

logger = logging.getLogger(__name__)

SAMPLE_RATE = 24000

# Repo id -> (onnx filename, friendly voice aliases). All three checkpoints
# live under the KittenML org.
KITTEN_REPOS = {
    "mini": "KittenML/kitten-tts-mini-0.8",
    "micro": "KittenML/kitten-tts-micro-0.8",
    "nano": "KittenML/kitten-tts-nano-0.8",
}

DEFAULT_VOICE = "Leo"

# TextCleaner symbol table from the upstream KittenTTS implementation. Maps a
# phoneme/grapheme character to its token id.
_PAD = "$"
_PUNCTUATION = ';:,.!?¡¿—…"«»"" '
_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
_LETTERS_IPA = (
    "ɑɐɒæɓʙβɔɕçɗɖðʤəɘɚɛɜɝɞɟʄɡɠɢʛɦɧħɥʜɨɪʝɭɬɫɮʟɱɯɰŋɳɲɴøɵɸθœɶʘɹɺɾɻʀʁɽʂʃʈʧʉʊʋⱱʌɣɤʍχʎʏʑʐʒʔʡʕʢǀǁǂǃˈˌːˑʼʴʰʱʲʷˠˤ˞↓↑→↗↘'̩'ᵻ"
)
_SYMBOLS = [*_PAD, *_PUNCTUATION, *_LETTERS, *_LETTERS_IPA]
_CHAR_INDEX = {ch: i for i, ch in enumerate(_SYMBOLS)}


def _text_cleaner(text: str) -> list[int]:
    """Map a (phonemized) string to a list of token ids, dropping unknowns."""
    return [_CHAR_INDEX[ch] for ch in text if ch in _CHAR_INDEX]


def _basic_english_tokenize(text: str) -> list[str]:
    """Split on whitespace and punctuation, mirroring upstream tokenization."""
    return re.findall(r"\w+|[^\w\s]", text)


def _phonemize(text: str) -> str:
    """Phonemize text via espeak when available, else return text unchanged."""
    try:
        from phonemizer.backend import EspeakBackend
    except Exception:
        logger.debug("phonemizer/espeak unavailable; using raw text (less precise prosody)", exc_info=True)
        return text
    try:
        backend = EspeakBackend(language="en-us", preserve_punctuation=True, with_stress=True)
        return backend.phonemize([text])[0]
    except Exception as exc:
        logger.warning("espeak phonemization failed (%s); using raw text", exc)
        return text


def _build_input_ids(text: str) -> np.ndarray:
    """Phonemize -> tokenize -> wrap with start/end (0) tokens."""
    phonemes = _phonemize(text)
    tokens = _basic_english_tokenize(phonemes)
    cleaned = _text_cleaner(" ".join(tokens))
    cleaned.insert(0, 0)
    cleaned.append(0)
    return np.array([cleaned], dtype=np.int64)


class KittenTTSOnnx:
    """ONNX Runtime inference wrapper for the KittenTTS v0.8 family."""

    def __init__(self, model_dir: str, size: str = "mini", providers: list[str] | None = None):
        from huggingface_hub import hf_hub_download
        from onnxruntime import InferenceSession

        repo = KITTEN_REPOS[size]
        config_path = hf_hub_download(repo_id=repo, filename="config.json")
        with open(config_path, encoding="utf-8") as fh:
            config = json.load(fh)

        model_file = config["model_file"]
        voices_file = config["voices"]
        model_path = hf_hub_download(repo_id=repo, filename=model_file)
        voices_path = hf_hub_download(repo_id=repo, filename=voices_file)

        self._voices = np.load(voices_path)
        self._voice_aliases = config.get("voice_aliases", {})
        self._speed_priors = config.get("speed_priors", {})
        self._available = list(self._voices.keys())
        self._all_voice_names = list(self._voice_aliases.keys()) or self._available

        providers = providers or []
        self._session = InferenceSession(model_path, providers=providers)
        logger.info("KittenTTS (%s) ONNX session loaded from %s", size, model_path)

    # -- public surface ----------------------------------------------------

    @property
    def available_voices(self) -> list[str]:
        return self._all_voice_names

    def generate(self, text: str, voice: str = DEFAULT_VOICE, speed: float = 1.0) -> np.ndarray:
        if voice in self._voice_aliases:
            voice = self._voice_aliases[voice]
        if voice not in self._available:
            raise ValueError(f"Voice '{voice}' unavailable for this checkpoint. Choose from: {self._available}")

        effective_speed = speed * float(self._speed_priors.get(voice, 1.0))

        input_ids = _build_input_ids(text)
        ref_id = min(len(text), self._voices[voice].shape[0] - 1)
        style = self._voices[voice][ref_id : ref_id + 1].astype(np.float32)
        speed_arr = np.array([effective_speed], dtype=np.float32)

        outputs = self._session.run(
            None,
            {"input_ids": input_ids, "style": style, "speed": speed_arr},
        )
        audio = np.asarray(outputs[0], dtype=np.float32).squeeze()
        # Upstream trims a fixed trailing tail; keep it for safety margin.
        if audio.shape[0] > 5000:
            audio = audio[:-5000]
        return audio
