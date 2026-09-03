"""
StyleTTS2 ONNX inference — faithful port of DDATT/StyleTTS2-onnx-cpp.

This is a verbatim Python re-implementation of the upstream C++ runtime
(``src/styletts2.cpp`` + ``src/phonemize.cpp``), not a re-derivation. The
tensor names, dtypes and the BERT-text transposition all mirror the original.

Pipeline (per the upstream ``synthesize`` method):
    text --(eSpeak IPA phonemes)--> tokens
    tokens + attention_mask --(plbert_simp)--> bert_dur
    bert_dur --(bert_encoder)--> d_en  [transposed]
    tokens + d_en + ref(predictor) + s(style) + speed --(final_simp)--> wav

Style / predictor embeddings are loaded from ``ref_s.bin`` / ``ref_p.bin``
(the upstream contract — they are precomputed from reference audio via
``Assets/get_reference_audio.py``). The ONNX runtime cannot produce them from
arbitrary audio without the full StyleTTS2 torch model.
"""

import os
import threading

import numpy as np

_MAX_WAV_VALUE = 32767.0

# C++ PhonemizerEngine::_symbol_to_id (char16 -> id). Replicated exactly,
# including the gaps at ids 174 and 176 (present in the upstream map).
_SYMBOL_TO_ID: dict[int, int] = {
    0x5F: 0,
    0x3B: 1,
    0x3A: 2,
    0x2C: 3,
    0x2E: 4,
    0x21: 5,
    0x3F: 6,
    0xA1: 7,
    0xBF: 8,
    0x2014: 9,
    0x2026: 10,
    0xAB: 12,
    0xBB: 13,
    0x22: 15,
    0x20: 16,
    0x41: 17,
    0x42: 18,
    0x43: 19,
    0x44: 20,
    0x45: 21,
    0x46: 22,
    0x47: 23,
    0x48: 24,
    0x49: 25,
    0x4A: 26,
    0x4B: 27,
    0x4C: 28,
    0x4D: 29,
    0x4E: 30,
    0x4F: 31,
    0x50: 32,
    0x51: 33,
    0x52: 34,
    0x53: 35,
    0x54: 36,
    0x55: 37,
    0x56: 38,
    0x57: 39,
    0x58: 40,
    0x59: 41,
    0x5A: 42,
    0x61: 43,
    0x62: 44,
    0x63: 45,
    0x64: 46,
    0x65: 47,
    0x66: 48,
    0x67: 49,
    0x68: 50,
    0x69: 51,
    0x6A: 52,
    0x6B: 53,
    0x6C: 54,
    0x6D: 55,
    0x6E: 56,
    0x6F: 57,
    0x70: 58,
    0x71: 59,
    0x72: 60,
    0x73: 61,
    0x74: 62,
    0x75: 63,
    0x76: 64,
    0x77: 65,
    0x78: 66,
    0x79: 67,
    0x7A: 68,
    0x251: 69,
    0x250: 70,
    0x252: 71,
    0xE6: 72,
    0x253: 73,
    0x299: 74,
    0x3B2: 75,
    0x254: 76,
    0x255: 77,
    0xE7: 78,
    0x257: 79,
    0x256: 80,
    0xF0: 81,
    0x2A4: 82,
    0x259: 83,
    0x258: 84,
    0x25A: 85,
    0x25B: 86,
    0x25C: 87,
    0x25D: 88,
    0x25E: 89,
    0x25F: 90,
    0x284: 91,
    0x261: 92,
    0x260: 93,
    0x262: 94,
    0x29B: 95,
    0x266: 96,
    0x267: 97,
    0x127: 98,
    0x265: 99,
    0x29C: 100,
    0x268: 101,
    0x26A: 102,
    0x29D: 103,
    0x26D: 104,
    0x26C: 105,
    0x26B: 106,
    0x26E: 107,
    0x29F: 108,
    0x271: 109,
    0x26F: 110,
    0x270: 111,
    0x14B: 112,
    0x273: 113,
    0x272: 114,
    0x274: 115,
    0xF8: 116,
    0x275: 117,
    0x278: 118,
    0x3B8: 119,
    0x153: 120,
    0x276: 121,
    0x298: 122,
    0x279: 123,
    0x27A: 124,
    0x27E: 125,
    0x27B: 126,
    0x280: 127,
    0x281: 128,
    0x27D: 129,
    0x282: 130,
    0x283: 131,
    0x288: 132,
    0x2A7: 133,
    0x289: 134,
    0x28A: 135,
    0x28B: 136,
    0x2C71: 137,
    0x28C: 138,
    0x263: 139,
    0x264: 140,
    0x28D: 141,
    0x3C7: 142,
    0x28E: 143,
    0x28F: 144,
    0x291: 145,
    0x290: 146,
    0x292: 147,
    0x294: 148,
    0x2A1: 149,
    0x295: 150,
    0x2A2: 151,
    0x1C0: 152,
    0x1C1: 153,
    0x1C2: 154,
    0x1C3: 155,
    0x2C8: 156,
    0x2CC: 157,
    0x2D0: 158,
    0x2D1: 159,
    0x2BC: 160,
    0x2B4: 161,
    0x2B0: 162,
    0x2B1: 163,
    0x2B2: 164,
    0x2B7: 165,
    0x2E0: 166,
    0x2E4: 167,
    0x2DE: 168,
    0x2193: 169,
    0x2191: 170,
    0x2192: 171,
    0x2197: 172,
    0x2198: 173,
    0x329: 175,
    0x1D7B: 177,
}


# Lazy — only resolved when espeakng_loader is actually installed.
def _get_espeak_library() -> str:
    import espeakng_loader

    return espeakng_loader.get_library_path()


def _get_espeak_data_path() -> str:
    import espeakng_loader

    return espeakng_loader.get_data_path()


def _ensure_espeak_env() -> None:
    """Make the bundled espeak-ng visible to phonemizer (portable, offline)."""
    if "PHONEMIZER_ESPEAK_LIBRARY" not in os.environ:
        os.environ["PHONEMIZER_ESPEAK_LIBRARY"] = _get_espeak_library()
    if "ESPEAK_DATA_PATH" not in os.environ:
        os.environ["ESPEAK_DATA_PATH"] = _get_espeak_data_path()


def text_to_sequence(text: str) -> list[int]:
    """Port of PhonemizerEngine::text_to_sequence.

    Phonemizes with eSpeak (IPA), then maps each IPA codepoint to its id,
    dropping any symbol absent from the StyleTTS2 vocabulary. Mirrors the
    C++ loop that prepends the leading 0 token in ``synthesize``.
    """
    _ensure_espeak_env()
    from phonemizer.backend import EspeakBackend

    backend = EspeakBackend("en-us")
    phonemes = backend.phonemize([text], strip=True)[0]
    sequence = [0]
    for ch in phonemes:
        code = ord(ch)
        if code in _SYMBOL_TO_ID:
            sequence.append(_SYMBOL_TO_ID[code])
    return sequence


def _generate_masks(lengths: list[int]) -> np.ndarray:
    """Port of GenerateMasks: attention_mask = 1 for real tokens, 0 for pad.

    ``lengths`` holds per-sequence real lengths (here a single length).
    Returns int32 array shaped (batch, max_len), True-token == 1.
    """
    if not lengths:
        return np.zeros((0, 0), dtype=np.int32)
    batch = len(lengths)
    max_len = max(lengths)
    mask = np.zeros((batch, max_len), dtype=np.int32)
    for i, length in enumerate(lengths):
        mask[i, :length] = 1
    return mask


class StyleTTS2Onnx:
    """Faithful Python port of the upstream ``StyleTTS2`` C++ class."""

    def __init__(self, model_dir: str, use_cuda: bool = False):
        _ensure_espeak_env()
        import onnxruntime as ort

        from ._onnx_precision import resolve_providers, resolve_session_path

        so = ort.SessionOptions()
        so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
        so.disable_cpu_mem_arena = True
        so.disable_mem_pattern = True

        providers = resolve_providers()

        self._sessions = {
            "plbert": ort.InferenceSession(resolve_session_path(model_dir, "plbert_simp")[0], so, providers=providers),
            "bert": ort.InferenceSession(resolve_session_path(model_dir, "bert_encoder")[0], so, providers=providers),
            "final": ort.InferenceSession(resolve_session_path(model_dir, "final_simp")[0], so, providers=providers),
        }
        self._style: np.ndarray | None = None
        self._predictor: np.ndarray | None = None
        self._lock = threading.Lock()

    def load_style(self, style_file: str, predictor_file: str) -> None:
        """Load precomputed style + predictor embeddings (ref_s.bin/ref_p.bin)."""
        self._style = np.fromfile(style_file, dtype=np.float32)
        self._predictor = np.fromfile(predictor_file, dtype=np.float32)
        if self._style.size == 0 or self._predictor.size == 0:
            raise RuntimeError("Failed to load StyleTTS2 style/predictor embeddings")

    def load_style_embeddings(self, style: np.ndarray, predictor: np.ndarray) -> None:
        """Load style/predictor embeddings directly (e.g. from the torch model)."""
        self._style = np.asarray(style, dtype=np.float32).ravel()
        self._predictor = np.asarray(predictor, dtype=np.float32).ravel()

    def synthesize(self, text: str, speed: float = 1.0) -> np.ndarray:
        """Port of StyleTTS2::synthesize. Returns float32 int16-range audio."""
        if self._style is None or self._predictor is None:
            raise RuntimeError("StyleTTS2 embeddings not loaded; call load_style()")

        with self._lock:
            tokens = text_to_sequence(text)
            tokens_arr = np.array(tokens, dtype=np.int64).reshape(1, -1)
            length = np.array([len(tokens)], dtype=np.int64)
            attn = _generate_masks(length.tolist())

            bert_dur = (
                self._sessions["plbert"]
                .run(
                    ["bert_dur"],
                    {"input_ids": tokens_arr, "attention_mask": attn},
                )[0]
                .astype(np.float32)
            )

            d_en = self._sessions["bert"].run(["d_en"], {"input": bert_dur})[0].astype(np.float32)

            d_en = np.transpose(d_en, (0, 2, 1))

            ref = self._predictor.reshape(1, 128)
            style = self._style.reshape(1, 128)
            speed_vec = np.array([speed], dtype=np.float32)

            wav = (
                self._sessions["final"]
                .run(
                    ["output_wav"],
                    {
                        "tokens": tokens_arr,
                        "d_en": d_en,
                        "ref": ref,
                        "s": style,
                        "speed": speed_vec,
                    },
                )[0]
                .astype(np.float32)
            )

            audio = np.clip(wav * _MAX_WAV_VALUE, -32768.0, 32767.0)
            return audio.astype(np.int16)
