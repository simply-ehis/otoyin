"""Generic audio.cpp one-shot backend.

Every TTS / genre audiocpp one-shot family uses this shared runner — same
subprocess shape as every audiocpp migration, just without one file per
model. Parameters come from a :class:`OneShotSpec` dataclass row; the class
is stateful enough to be a registry singleton per spec.
"""

from __future__ import annotations

import asyncio
import logging

import numpy as np

from .audio_cpp import find_audiocpp, run_one_shot

logger = logging.getLogger(__name__)


class OneShotSpec:
    """Per-model parameters for the one-shot audio.cpp runner."""

    def __init__(
        self,
        model_file: str,
        family: str,
        *,
        repo: str = "audio-cpp/audio.cpp-gguf",
        task: str = "tts",
        voice_kind: str = "none",  # "none" | "voice_id" | "request_option_voice_id" | "reference" | "gen"
        sample_rate: int = 24000,
        language_hint: str = "en",
        supports_cloning: bool = False,
        extra_args: tuple[str, str] | None = None,
        # When the family implements audio.cpp's `.mem_saver=true` session
        # option, pass the family prefix (usually same as family). The global
        # "Low memory mode" generation setting turns it on per call.
        mem_saver_family: str | None = None,
    ):
        self.model_file = model_file
        self.family = family
        self.repo = repo
        self.task = task
        self.voice_kind = voice_kind
        self.sample_rate = sample_rate
        self.language_hint = language_hint
        self.supports_cloning = supports_cloning
        self.extra_args = extra_args or ()
        self.mem_saver_family = mem_saver_family


class OneShotAudiocpp:
    """Parameterized one-shot backend instance (registry singleton per spec)."""

    def __init__(self, spec: OneShotSpec):
        self.spec = spec
        self.hf_repo = spec.repo
        self.sample_rate = spec.sample_rate
        self.load_error: str | None = None

    def is_loaded(self) -> bool:
        return False

    # -- cache / path resolution -------------------------------------------

    def _is_model_cached(self, *_args, **_kwargs) -> bool:
        from ..services.model_files import is_model_installed

        return is_model_installed(self.spec.repo, self.spec.model_file)

    def _local_file(self, filename: str | None = None) -> str:
        from ..services.model_files import resolve_model_file

        return str(resolve_model_file(self.spec.repo, filename or self.spec.model_file))

    def _get_model_path(self, model_size: str) -> str:
        return self._local_file()

    # -- lifecycle ----------------------------------------------------------

    async def load_model(self, model_size: str = "default") -> None:
        if find_audiocpp() is None:
            self.load_error = (
                "audiocpp_cli binary not found. Bundle audiocpp_cli next to the sidecars or set TWENTYLABS_AUDIOCPP."
            )
            raise RuntimeError(self.load_error)
        if not self._is_model_cached():
            raise RuntimeError("Model is not downloaded. Use the Model Downloads page to download it first.")
        self.load_error = None

    def unload_model(self) -> None:
        """Nothing resident to unload — subprocesses exit after each call."""

    # -- generation ---------------------------------------------------------

    async def generate(
        self,
        text: str,
        voice_prompt: dict | None = None,
        language: str = "en",
        seed: int | None = None,
        instruct: str | None = None,
        temperature: float | None = None,
    ) -> tuple[np.ndarray, int]:
        if find_audiocpp() is None:
            raise RuntimeError(
                "audiocpp_cli binary not found. Bundle audiocpp_cli next to the sidecars or set TWENTYLABS_AUDIOCPP."
            )
        if not self._is_model_cached():
            raise RuntimeError("Model is not downloaded. Use the Model Downloads page to download it first.")

        voice_prompt = voice_prompt or {}
        speaker = voice_prompt.get("voice_id") or voice_prompt.get("preset_voice_id")
        ref = voice_prompt.get("audio_path") if self.spec.voice_kind == "reference" else None
        ref_text = voice_prompt.get("reference_text") if self.spec.voice_kind == "reference" else None

        # Reference given -> cloning route. Every clone-capable family supports
        # --task clon (usually an alias of the same path; for some it is the only
        # documented route). Task cloning guard never fires for non-clones (no ref).
        task = "clon" if (ref and self.spec.voice_kind == "reference") else self.spec.task

        # MagpieTTS (and any family whose baked voices are session-level) reads
        # voice selection from --request-option voice_id=<name>, not --voice-id.
        voice_id = str(speaker) if (speaker and self.spec.voice_kind == "voice_id") else None
        extra = list(self.spec.extra_args)
        if speaker and self.spec.voice_kind == "request_option_voice_id":
            extra += ["--request-option", f"voice_id={speaker}"]

        args = build_args(
            model=self._local_file(),
            text=text,
            family=self.spec.family,
            task=task,
            voice_id=voice_id,
            reference_wav=ref,
            reference_text=ref_text,
            seed=seed,
            extra=extra,
        )
        from ..services.espeak_assets import ESPEAK_FAMILIES

        return await asyncio.to_thread(
            run_one_shot,
            args,
            sample_rate=self.sample_rate,
            prefix=self.spec.family,
            timeout_s=600.0,
            mem_saver_family=self.spec.mem_saver_family,
            espeak_family=self.spec.family if self.spec.family in ESPEAK_FAMILIES else None,
        )

    async def convert(self, source: str, reference: str, seed: int | None = None):
        raise NotImplementedError


# ── Specs for the 13 new 2026-11 additions ─────────────────────────────

PHONON = OneShotSpec(
    model_file="phonon-31m-en-q8_0.gguf",
    family="gradium_phonon",
    repo="gradium/phonon-31m-en-audiocpp",
    sample_rate=24000,
    language_hint="en",
    voice_kind="none",
    supports_cloning=False,
)
inflect_v2_spec = OneShotSpec(
    model_file="Inflect-Micro-v2-GGUF/inflect-micro-v2-orig.gguf",
    family="inflect_v2",
    sample_rate=24000,
    language_hint="en",
    voice_kind="none",
    supports_cloning=False,
)
supertonic_spec = OneShotSpec(
    model_file="Supertonic-3-GGUF/supertonic-3-q8_0.gguf",
    family="supertonic",
    sample_rate=24000,
    language_hint="en",
    voice_kind="voice_id",
    supports_cloning=False,
)
piper_spec = OneShotSpec(
    model_file="Piper-TTS-GGUF/piper-en-us-lessac-medium-orig.gguf",
    family="piper_tts",
    sample_rate=22050,
    language_hint="en",
    voice_kind="none",
    supports_cloning=False,
)
chatterbox_turbo_spec = OneShotSpec(
    model_file="Chatterbox-Turbo-GGUF/chatterbox-turbo-q8_0.gguf",
    family="chatterbox_turbo",
    sample_rate=24000,
    language_hint="en",
    voice_kind="none",
    supports_cloning=False,
)
audio8_spec = OneShotSpec(
    model_file="audio8-tts-realistic-0.6b-q8_0.gguf",
    family="audio8_tts",
    repo="audio-cpp/Audio8-TTS-Realistic-0.6b-GGUF",
    sample_rate=44100,
    language_hint="en",
    voice_kind="reference",
    supports_cloning=True,
    mem_saver_family="audio8_tts",
)
cosyvoice3_spec = OneShotSpec(
    model_file="CosyVoice3-GGUF/cosyvoice3-q8_0.gguf",
    family="cosyvoice3",
    sample_rate=24000,
    language_hint="zh",
    voice_kind="reference",
    supports_cloning=True,
    mem_saver_family="cosyvoice3",
)
magpie_spec = OneShotSpec(
    model_file="MagpieTTS-Multilingual-357M-GGUF/magpie-tts-multilingual-357m-q8_0.gguf",
    family="magpie_tts",
    sample_rate=24000,
    language_hint="en",
    voice_kind="request_option_voice_id",
    supports_cloning=False,
)
moss_soundeffect_spec = OneShotSpec(
    model_file="MOSS-SoundEffect-v2-GGUF/moss-soundeffect-v2-q8_0.gguf",
    family="moss_soundeffect",
    task="gen",
    sample_rate=48000,
    language_hint="en",
    voice_kind="none",
)
omnivoice_spec = OneShotSpec(
    model_file="OmniVoice-GGUF/omnivoice-q8_0.gguf",
    family="omnivoice",
    sample_rate=24000,
    language_hint="en",
    voice_kind="reference",
    supports_cloning=True,
    mem_saver_family="omnivoice",
)
yue2_spec = OneShotSpec(
    model_file="yue2-3b-q8_0.gguf",
    family="yue2",
    task="gen",
    repo="audio-cpp/Yue2-3B-GGUF",
    sample_rate=44100,
    language_hint="en",
    voice_kind="none",
    mem_saver_family="yue2",
)
zonos3_spec = OneShotSpec(
    model_file="gguf/backbone-ptq.gguf",
    family="zonos3",
    repo="Zyphra/ZONOS3-Mini",
    sample_rate=44100,
    language_hint="en",
    voice_kind="reference",
    supports_cloning=True,
)
drama3_spec = OneShotSpec(
    model_file="drama-3-backbone-8bit-experts-Q4_K_S.gguf",
    family="fish_drama3",
    repo="Jmica/Drama-3-GGUF",
    sample_rate=44100,
    language_hint="en",
    voice_kind="reference",
    supports_cloning=True,
)
sa3_music_spec = OneShotSpec(
    model_file="Stable-Audio-3-Small-Music-GGUF/stable-audio-3-small-music-q8_0.gguf",
    family="stable_audio",
    task="gen",
    sample_rate=44100,
    language_hint="en",
    voice_kind="none",
    mem_saver_family="stable_audio",
)

phonon_backend = OneShotAudiocpp(PHONON)
inflect_v2_backend = OneShotAudiocpp(inflect_v2_spec)
supertonic_backend = OneShotAudiocpp(supertonic_spec)
piper_tts_backend = OneShotAudiocpp(piper_spec)
chatterbox_turbo_backend = OneShotAudiocpp(chatterbox_turbo_spec)
audio8_tts_backend = OneShotAudiocpp(audio8_spec)
cosyvoice3_backend = OneShotAudiocpp(cosyvoice3_spec)
magpie_tts_backend = OneShotAudiocpp(magpie_spec)
moss_soundeffect_backend = OneShotAudiocpp(moss_soundeffect_spec)
omnivoice_backend = OneShotAudiocpp(omnivoice_spec)
yue2_backend = OneShotAudiocpp(yue2_spec)
zonos3_backend = OneShotAudiocpp(zonos3_spec)
drama3_backend = OneShotAudiocpp(drama3_spec)
sa3_music_backend = OneShotAudiocpp(sa3_music_spec)


def build_args(
    *,
    model: str,
    text: str,
    family: str,
    task: str = "tts",
    voice_id: str | None = None,
    reference_wav: str | None = None,
    reference_text: str | None = None,
    seed: int | None = None,
    extra: list[str] | None = None,
) -> list[str]:
    """Arg list for audiocpp_cli one-shots (pure, unit-testable)."""
    args = [
        "--task",
        task,
        "--family",
        family,
        "--model",
        model,
        "--text",
        text,
    ]
    if voice_id:
        args += ["--voice-id", voice_id]
    if reference_wav:
        args += ["--voice-ref", reference_wav]
    if reference_text:
        args += ["--reference-text", reference_text]
    if seed is not None:
        args += ["--seed", str(seed)]
    if extra:
        args += extra
    return args
