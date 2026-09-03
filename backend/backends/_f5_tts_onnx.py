"""
Vendored upstream F5-TTS ONNX inference engine.

Source: https://github.com/DakeQQ/F5-TTS-ONNX (Export_ONNX/F5_TTS/
F5-TTS-ONNX-Inference.py), Apache-2.0. Ported faithfully: the ONNX tensor
wiring (preprocess 8 outputs -> transformer NFE-step Euler loop -> decoder)
is kept verbatim. Only the I/O shims changed: torch/pydub/argparse replaced
with numpy + soundfile so this runs torch-free inside 21labs.

Pipeline (per upstream):
  F5_Preprocess.onnx  (ref_audio i16, text_ids int32, max_duration int64)
      -> noise, rope_cos_q, rope_sin_q, rope_cos_k, rope_sin_k,
         cat_mel_text, cat_mel_text_drop, ref_signal_len
  F5_Transformer.onnx (NFE_STEP Euler denoising steps)
      -> noise, time_step
  F5_Decode.onnx      (noise, ref_signal_len) -> waveform

Requires: onnxruntime, numpy, jieba, pypinyin, soundfile. vocab.txt from
SWivid/F5-TTS (F5TTS_v1_Base) must be cached alongside the .onnx files.
"""

import logging
import re

import numpy as np
import onnxruntime as ort

logger = logging.getLogger(__name__)

MODEL_SAMPLE_RATE = 24000
HOP_LENGTH = 256
RANDOM_SEED = 9527
NFE_STEP = 32
FUSE_NFE = 1
SPEED = 1.0

ZH_PAUSE_PUNC = r"。，、；：？！"


def _load_vocab(vocab_path: str) -> dict[str, int]:
    vocab_char_map: dict[str, int] = {}
    with open(vocab_path, encoding="utf-8") as f:
        for i, char in enumerate(f):
            vocab_char_map[char[:-1]] = i
    return vocab_char_map


def convert_char_to_pinyin(text_list, polyphone=True):
    """Chinese/English text -> pinyin token list (from official F5-TTS code)."""
    import jieba
    from pypinyin import Style, lazy_pinyin

    if jieba.dt.initialized is False:
        jieba.default_logger.setLevel(50)  # CRITICAL
        jieba.initialize()

    final_text_list = []
    custom_trans = str.maketrans({";": ",", "“": '"', "”": '"', "‘": "'", "’": "'"})

    def is_chinese(c):
        return "\u3100" <= c <= "\u9fff"

    for text in text_list:
        char_list = []
        text = text.translate(custom_trans)
        for seg in jieba.cut(text):
            seg_byte_len = len(bytes(seg, "UTF-8"))
            if seg_byte_len == len(seg):  # pure alphabets and symbols
                if char_list and seg_byte_len > 1 and char_list[-1] not in " :'\"":
                    char_list.append(" ")
                char_list.extend(seg)
            elif polyphone and seg_byte_len == 3 * len(seg):  # pure east asian chars
                seg_ = lazy_pinyin(seg, style=Style.TONE3, tone_sandhi=True)
                for i, c in enumerate(seg):
                    if is_chinese(c):
                        char_list.append(" ")
                    char_list.append(seg_[i])
            else:  # mixed characters, alphabets and symbols
                for c in seg:
                    if ord(c) < 256:
                        char_list.extend(c)
                    elif is_chinese(c):
                        char_list.append(" ")
                        char_list.extend(lazy_pinyin(c, style=Style.TONE3, tone_sandhi=True))
                    else:
                        char_list.append(c)
        final_text_list.append(char_list)
    return final_text_list


def list_str_to_idx(text, vocab_char_map, padding_value=-1):
    """Char/pinyin list -> int32 padded token matrix (numpy, upstream uses torch)."""
    get_idx = vocab_char_map.get
    list_idx = [np.array([get_idx(c, 0) for c in t], dtype=np.int32) for t in text]
    max_len = max(arr.shape[0] for arr in list_idx)
    padded = np.full((len(list_idx), max_len), padding_value, dtype=np.int32)
    for i, arr in enumerate(list_idx):
        padded[i, : arr.shape[0]] = arr
    return padded


class F5TTSOnnx:
    """Faithful F5-TTS ONNX inference (vendored upstream)."""

    def __init__(self, preprocess_path, transformer_path, decoder_path, vocab_path):
        self.vocab_char_map = _load_vocab(vocab_path)
        self.sample_rate = MODEL_SAMPLE_RATE

        from ._onnx_precision import make_session_options, resolve_providers

        session_opts = make_session_options()
        session_opts.log_severity_level = 4
        session_opts.log_verbosity_level = 4
        session_opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        session_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        session_opts.add_session_config_entry("session.set_denormal_as_zero", "1")

        providers = resolve_providers()

        self.ort_session_A = ort.InferenceSession(preprocess_path, sess_options=session_opts, providers=providers)
        meta = self.ort_session_A.get_modelmeta().custom_metadata_map
        self.nfe_step = int(meta["default_nfe_steps"]) if "default_nfe_steps" in meta else NFE_STEP

        self.ort_session_B = ort.InferenceSession(transformer_path, sess_options=session_opts, providers=providers)
        self.ort_session_C = ort.InferenceSession(decoder_path, sess_options=session_opts, providers=providers)
        meta_c = self.ort_session_C.get_modelmeta().custom_metadata_map
        self.hop_length = int(meta_c["hop_length"]) if "hop_length" in meta_c else HOP_LENGTH

        a = self.ort_session_A.get_inputs()
        self.in_name_A = [x.name for x in a]
        o = self.ort_session_A.get_outputs()
        self.out_name_A = [x.name for x in o]

        b = self.ort_session_B.get_inputs()
        self.in_name_B = [x.name for x in b]
        ob = self.ort_session_B.get_outputs()
        self.out_name_B = [x.name for x in ob]

        c = self.ort_session_C.get_inputs()
        self.in_name_C = [x.name for x in c]
        oc = self.ort_session_C.get_outputs()
        self.out_name_C = [x.name for x in oc]

    def _load_ref_audio(self, audio_path: str) -> tuple[np.ndarray, int]:
        import soundfile as sf

        audio, sr = sf.read(audio_path, dtype="int16", always_2d=False)
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        if sr != self.sample_rate:
            import scipy.signal

            gcd = np.gcd(int(sr), self.sample_rate)
            audio = scipy.signal.resample_poly(audio, self.sample_rate // gcd, sr // gcd)
        refaudio = np.asarray(audio, dtype=np.int16).reshape(1, 1, -1)
        return refaudio, len(audio)

    def generate(self, text, ref_audio_path, ref_text) -> np.ndarray:
        ort.set_seed(RANDOM_SEED)

        refaudio, audio_len = self._load_ref_audio(ref_audio_path)

        ref_text_len = len(ref_text.encode("utf-8")) + 3 * len(re.findall(ZH_PAUSE_PUNC, ref_text))
        gen_text_len = len(text.encode("utf-8")) + 3 * len(re.findall(ZH_PAUSE_PUNC, text))
        ref_audio_len = audio_len // self.hop_length + 1
        max_duration = np.array(
            [ref_audio_len + int(ref_audio_len / ref_text_len * gen_text_len / SPEED)],
            dtype=np.int64,
        )

        gen_pinyin = convert_char_to_pinyin([ref_text + text])
        text_ids = list_str_to_idx(gen_pinyin, self.vocab_char_map)

        noise, rope_cos_q, rope_sin_q, rope_cos_k, rope_sin_k, cat_mel_text, cat_mel_text_drop, ref_signal_len = (
            self.ort_session_A.run(
                self.out_name_A,
                {
                    self.in_name_A[0]: refaudio,
                    self.in_name_A[1]: text_ids,
                    self.in_name_A[2]: max_duration,
                },
            )
        )

        time_step = np.array([0], dtype=np.int32)
        for _ in range(0, self.nfe_step - 1, FUSE_NFE):
            noise, time_step = self.ort_session_B.run(
                self.out_name_B,
                {
                    self.in_name_B[0]: noise,
                    self.in_name_B[1]: rope_cos_q,
                    self.in_name_B[2]: rope_sin_q,
                    self.in_name_B[3]: rope_cos_k,
                    self.in_name_B[4]: rope_sin_k,
                    self.in_name_B[5]: cat_mel_text,
                    self.in_name_B[6]: cat_mel_text_drop,
                    self.in_name_B[7]: time_step,
                },
            )

        generated = self.ort_session_C.run(
            self.out_name_C,
            {
                self.in_name_C[0]: noise,
                self.in_name_C[1]: ref_signal_len,
            },
        )[0]
        return generated.reshape(-1).astype(np.float32)
