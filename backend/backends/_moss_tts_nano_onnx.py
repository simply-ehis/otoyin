"""
MOSS-TTS-Nano ONNX inference engine — faithful port of OpenMOSS/MOSS-TTS-Nano.

Ported verbatim from the upstream ONNX Runtime path:
  - ``ort_cpu_runtime.py``  (ONNX sessions, AR generation loop, codec decode)
  - ``onnx_tts_runtime.py`` (text encoding, ref-audio encode, chunking)

The only substitutions are torch-free equivalents of the reference-audio
loader (``soundfile`` + ``librosa`` instead of ``torchaudio``) and an optional
text normalizer (``WeTextProcessing`` is a heavy native dep; we keep a light
built-in cleanup instead of importing it). All tensor names, dtypes, sampling
logic and the codec streaming session are reproduced exactly.

Pipeline (one voice-clone chunk):
    ref_audio --(codec_encode)--> prompt_audio_codes
    text --(SentencePiece)--> token_ids
    request_rows = prefix + audio_prefix + suffix
    prefill -> global_hidden + KV past
    loop: local_*_frame -> frame tokens -> decode step -> next global_hidden
    generated_frames --(codec_decode)--> 48kHz stereo waveform
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    import onnxruntime as ort

import numpy as np

SAMPLE_MODE_GREEDY = "greedy"
SAMPLE_MODE_FIXED = "fixed"
SAMPLE_MODE_FULL = "full"
EXECUTION_PROVIDER_CPU = "cpu"
EXECUTION_PROVIDER_CUDA = "cuda"

MANIFEST_CANDIDATE_RELATIVE_PATHS = (
    "browser_poc_manifest.json",
    "MOSS-TTS-Nano-100M-ONNX/browser_poc_manifest.json",
    "MOSS-TTS-Nano-ONNX-CPU/browser_poc_manifest.json",
)
MODEL_DIR_ALIAS_MAP = {
    "MOSS-TTS-Nano-ONNX-CPU": "MOSS-TTS-Nano-100M-ONNX",
    "MOSS-Audio-Tokenizer-Nano-ONNX-CPU": "MOSS-Audio-Tokenizer-Nano-ONNX",
}


# --------------------------------------------------------------------------
# sampling helpers (verbatim from ort_cpu_runtime.py)
# --------------------------------------------------------------------------


def _argmax(values: np.ndarray) -> int:
    return int(np.argmax(values))


def _normalize_execution_provider(raw: str | None) -> str:
    normalized = str(raw or EXECUTION_PROVIDER_CPU).strip().lower()
    if normalized in {EXECUTION_PROVIDER_CPU, "cpuexecutionprovider"}:
        return EXECUTION_PROVIDER_CPU
    if normalized in {EXECUTION_PROVIDER_CUDA, "gpu", "cudaexecutionprovider"}:
        return EXECUTION_PROVIDER_CUDA
    raise ValueError("execution_provider must be one of: cpu, cuda")


def _resolve_ort_providers(execution_provider: str) -> list[Any]:
    from ._onnx_precision import resolve_providers

    normalized = _normalize_execution_provider(execution_provider)
    if normalized == EXECUTION_PROVIDER_CPU:
        return ["CPUExecutionProvider"]
    # For CUDA requests, use shared resolver which falls back gracefully
    return resolve_providers()


def _flatten3d_int32(nested: list[list[list[int]]]) -> tuple[np.ndarray, list[int]]:
    dim0, dim1, dim2 = len(nested), len(nested[0]), len(nested[0][0])
    data = np.zeros((dim0 * dim1 * dim2,), dtype=np.int32)
    offset = 0
    for i in range(dim0):
        for j in range(dim1):
            for k in range(dim2):
                data[offset] = int(nested[i][j][k])
                offset += 1
    return data, [dim0, dim1, dim2]


def _flatten2d_int32(nested: list[list[int]]) -> tuple[np.ndarray, list[int]]:
    dim0, dim1 = len(nested), len(nested[0])
    data = np.zeros((dim0 * dim1,), dtype=np.int32)
    offset = 0
    for i in range(dim0):
        for j in range(dim1):
            data[offset] = int(nested[i][j])
            offset += 1
    return data, [dim0, dim1]


def _extract_last_hidden(hidden: np.ndarray) -> np.ndarray:
    if hidden.ndim == 2:
        return hidden.astype(np.float32, copy=False)
    if hidden.ndim != 3 or hidden.shape[0] != 1:
        raise ValueError(f"Unexpected global_hidden shape: {hidden.shape}")
    return hidden[:, -1, :].astype(np.float32, copy=False)


def _apply_repetition_penalty(values, prev_ids, penalty) -> np.ndarray:
    if not prev_ids or penalty == 1.0:
        return values
    result = values.copy()
    for tid in set(int(x) for x in prev_ids):
        if 0 <= tid < result.shape[0]:
            result[tid] = result[tid] * penalty if result[tid] < 0 else result[tid] / penalty
    return result


def _argmax_with_repetition_penalty(values, prev_set, penalty) -> int:
    best_index, best_value = 0, float("-inf")
    apply = bool(prev_set) and penalty != 1.0
    for index, value in enumerate(values):
        score = float(value)
        if apply and index in prev_set:
            score = score * penalty if score < 0 else score / penalty
        if score > best_value:
            best_value, best_index = score, index
    return int(best_index)


def _softmax(values: np.ndarray) -> np.ndarray:
    max_value = float(np.max(values))
    shifted = np.asarray(values - max_value, dtype=np.float64)
    exps = np.exp(shifted)
    return exps / np.sum(exps, dtype=np.float64)


def _sample_from_scores(values, *, do_sample, temperature, top_k, top_p, rng) -> int:
    if not do_sample:
        return _argmax(values)
    if not (temperature > 0):
        raise ValueError("temperature must be positive when do_sample=True")
    scores = np.asarray(values, dtype=np.float32).copy() / float(temperature)
    if top_k > 0 and top_k < scores.shape[0]:
        threshold = float(np.sort(scores)[::-1][top_k - 1])
        scores[scores < threshold] = float("-inf")
    if top_p > 0 and top_p < 1:
        indexed = list(enumerate(scores.tolist()))
        indexed.sort(key=lambda it: it[1], reverse=True)
        sorted_scores = np.asarray([it[1] for it in indexed], dtype=np.float32)
        sorted_probs = _softmax(sorted_scores)
        remove_mask = [False] * len(indexed)
        cumulative = 0.0
        for index, probability in enumerate(sorted_probs):
            cumulative += float(probability)
            if cumulative > float(top_p):
                remove_mask[index] = True
        for index in range(len(remove_mask) - 1, 0, -1):
            remove_mask[index] = remove_mask[index - 1]
        if remove_mask:
            remove_mask[0] = False
        for index, should_remove in enumerate(remove_mask):
            if should_remove:
                scores[indexed[index][0]] = float("-inf")
    probabilities = _softmax(scores)
    random_value = float(rng.random())
    for index, probability in enumerate(probabilities):
        random_value -= float(probability)
        if random_value <= 0:
            return int(index)
    return _argmax(scores)


def _normalize_sample_mode(raw, raw_do_sample=True) -> str:
    normalized = str(raw or "").strip()
    if normalized in {SAMPLE_MODE_GREEDY, SAMPLE_MODE_FIXED, SAMPLE_MODE_FULL}:
        return normalized
    if normalized == "mixed3":
        return SAMPLE_MODE_FIXED if raw_do_sample else SAMPLE_MODE_GREEDY
    return SAMPLE_MODE_GREEDY if not raw_do_sample else SAMPLE_MODE_FIXED


# --------------------------------------------------------------------------
# codec streaming decode session (verbatim)
# --------------------------------------------------------------------------


class CodecStreamingDecodeSession:
    def __init__(self, codec_meta: dict[str, Any], session: ort.InferenceSession):
        self.codec_meta = codec_meta
        self.session = session
        self.transformer_specs = list(codec_meta.get("streaming_decode", {}).get("transformer_offsets", []))
        self.attention_specs = list(codec_meta.get("streaming_decode", {}).get("attention_caches", []))
        self.state_feeds: dict[str, np.ndarray] = {}
        self.reset()

    def reset(self) -> None:
        self.state_feeds = {}
        for spec in self.transformer_specs:
            self.state_feeds[str(spec["input_name"])] = np.zeros(tuple(spec["shape"]), dtype=np.int32)
        for spec in self.attention_specs:
            self.state_feeds[str(spec["offset_input_name"])] = np.zeros(tuple(spec["offset_shape"]), dtype=np.int32)
            self.state_feeds[str(spec["cached_keys_input_name"])] = np.zeros(
                tuple(spec["cache_shape"]), dtype=np.float32
            )
            self.state_feeds[str(spec["cached_values_input_name"])] = np.zeros(
                tuple(spec["cache_shape"]), dtype=np.float32
            )
            positions = np.full(tuple(spec["positions_shape"]), -1, dtype=np.int32)
            self.state_feeds[str(spec["cached_positions_input_name"])] = positions

    def run_frames(self, frame_rows):
        if not frame_rows:
            return None
        n_vq = int(self.codec_meta["codec_config"]["num_quantizers"])
        frame_count = len(frame_rows)
        audio_codes = np.zeros((1, frame_count, n_vq), dtype=np.int32)
        for fi, row in enumerate(frame_rows):
            for ci in range(n_vq):
                audio_codes[0, fi, ci] = int(row[ci] if ci < len(row) else 0)
        feeds = {
            "audio_codes": audio_codes,
            "audio_code_lengths": np.asarray([frame_count], dtype=np.int32),
        }
        feeds.update(self.state_feeds)
        outputs = self.session.run(None, feeds)
        named = dict(zip([o.name for o in self.session.get_outputs()], outputs, strict=True))
        for spec in self.transformer_specs:
            self.state_feeds[str(spec["input_name"])] = named[str(spec["output_name"])]
        for spec in self.attention_specs:
            self.state_feeds[str(spec["offset_input_name"])] = named[str(spec["offset_output_name"])]
            self.state_feeds[str(spec["cached_keys_input_name"])] = named[str(spec["cached_keys_output_name"])]
            self.state_feeds[str(spec["cached_values_input_name"])] = named[str(spec["cached_values_output_name"])]
            self.state_feeds[str(spec["cached_positions_input_name"])] = named[
                str(spec["cached_positions_output_name"])
            ]
        return named["audio"], int(named["audio_lengths"].reshape(-1)[0])


# --------------------------------------------------------------------------
# text normalization (light, torch/WeTextProcessing-free)
# --------------------------------------------------------------------------


def prepare_tts_request_texts(text, prompt_text="", voice="", *, enable_normalize_tts_text=True):
    normalized = str(text or "").strip()
    if enable_normalize_tts_text:
        normalized = normalized.replace("\r", " ").replace("\n", " ")
        while "  " in normalized:
            normalized = normalized.replace("  ", " ")
        if normalized and normalized[-1].isalnum():
            normalized += "."
    return {
        "text": normalized,
        "normalization_method": "light" if enable_normalize_tts_text else "none",
        "text_normalization_language": None,
    }


# --------------------------------------------------------------------------
# runtime (faithful port of OrtCpuRuntime + OnnxTtsRuntime core)
# --------------------------------------------------------------------------


class MossTTSNanoOnnx:
    def __init__(self, model_dir, *, thread_count=4, execution_provider=EXECUTION_PROVIDER_CPU, seed=1234):
        import sentencepiece as spm

        self.model_dir = Path(model_dir).expanduser().resolve()
        self.thread_count = max(1, int(thread_count))
        self.execution_provider = _normalize_execution_provider(execution_provider)
        self.ort_providers = _resolve_ort_providers(self.execution_provider)
        self.manifest_path = self._resolve_manifest_path(self.model_dir)
        self.manifest_dir = self.manifest_path.parent
        self.manifest = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        self.tts_meta_path = self.resolve_manifest_relative_path(self.manifest["model_files"]["tts_meta"])
        self.codec_meta_path = self.resolve_manifest_relative_path(self.manifest["model_files"]["codec_meta"])
        self.tts_meta = json.loads(self.tts_meta_path.read_text(encoding="utf-8"))
        self.codec_meta = json.loads(self.codec_meta_path.read_text(encoding="utf-8"))
        self.rng = np.random.default_rng(int(seed))
        self.sessions = self._create_sessions()
        self.codec_streaming_session = CodecStreamingDecodeSession(
            codec_meta=self.codec_meta, session=self.sessions["codec_decode_step"]
        )
        tokenizer_path = self.resolve_manifest_relative_path(
            str(self.manifest["model_files"].get("tokenizer_model", "tokenizer.model"))
        )
        self.sp_model = spm.SentencePieceProcessor(model_file=str(tokenizer_path))

    # -- manifest/session plumbing --------------------------------------

    def _resolve_manifest_path(self, model_dir: Path) -> Path:
        tried = []
        for rel in MANIFEST_CANDIDATE_RELATIVE_PATHS:
            candidate = (model_dir / rel).resolve()
            tried.append(candidate)
            if candidate.is_file():
                return candidate
        raise FileNotFoundError(f"browser_poc_manifest.json not found. tried: {tried}")

    def resolve_manifest_relative_path(self, relative_path) -> Path:
        relative = Path(relative_path)
        resolved = (self.manifest_dir / relative).resolve()
        if resolved.exists():
            return resolved
        rel_text = str(relative).replace("\\", "/")
        for legacy, canonical in MODEL_DIR_ALIAS_MAP.items():
            if f"/{legacy}/" not in f"/{rel_text}/":
                continue
            rewritten = (self.manifest_dir / Path(rel_text.replace(legacy, canonical))).resolve()
            if rewritten.exists():
                return rewritten
        return resolved

    def _session(self, path_value: Path) -> ort.InferenceSession:
        import onnxruntime as ort

        options = ort.SessionOptions()
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        options.intra_op_num_threads = self.thread_count
        options.inter_op_num_threads = 1
        return ort.InferenceSession(str(path_value), sess_options=options, providers=self.ort_providers)

    def _create_sessions(self) -> dict[str, ort.InferenceSession]:
        from ._onnx_precision import resolve_session_path_meta

        tts_dir = self.tts_meta_path.parent
        codec_dir = self.codec_meta_path.parent
        meta = self.tts_meta

        def _resolve(directory: str, filename: str) -> ort.InferenceSession:
            path, _precision = resolve_session_path_meta(directory, filename)
            return self._session(path)

        sessions = {
            "prefill": _resolve(str(tts_dir), meta["files"]["prefill"]),
            "decode": _resolve(str(tts_dir), meta["files"]["decode_step"]),
            "local_decoder": _resolve(str(tts_dir), meta["files"]["local_decoder"]),
            "codec_encode": _resolve(str(codec_dir), self.codec_meta["files"]["encode"]),
            "codec_decode": _resolve(str(codec_dir), self.codec_meta["files"]["decode_full"]),
            "codec_decode_step": _resolve(str(codec_dir), self.codec_meta["files"]["decode_step"]),
        }
        for key in ("local_greedy_frame", "local_fixed_sampled_frame", "local_cached_step"):
            if meta["files"].get(key):
                sessions[key] = _resolve(str(tts_dir), meta["files"][key])
        return sessions

    # -- voices / text ------------------------------------------------

    def list_builtin_voices(self) -> list[dict[str, Any]]:
        return list(self.manifest["builtin_voices"])

    def encode_text(self, text: str) -> list[int]:
        return [int(t) for t in self.sp_model.encode(str(text or ""), out_type=int)]

    # -- reference audio (torch-free: soundfile + librosa) ------------

    def encode_reference_audio(self, reference_audio_path) -> list[list[int]]:
        import librosa
        import soundfile as sf

        waveform, sample_rate = sf.read(str(reference_audio_path), dtype="float32", always_2d=True)
        waveform = np.asarray(waveform, dtype=np.float32).T  # (channels, samples)
        target_sr = int(self.codec_meta["codec_config"]["sample_rate"])
        target_ch = int(self.codec_meta["codec_config"]["channels"])
        if sample_rate != target_sr:
            waveform = librosa.resample(waveform, orig_sr=sample_rate, target_sr=target_sr, axis=1)
        cur_ch = int(waveform.shape[0])
        if cur_ch == target_ch:
            pass
        elif cur_ch == 1 and target_ch > 1:
            waveform = np.repeat(waveform, target_ch, axis=0)
        elif cur_ch > 1 and target_ch == 1:
            waveform = waveform.mean(axis=0, keepdims=True)
        else:
            raise ValueError(f"Unsupported ref audio channels: {cur_ch} -> {target_ch}")
        waveform = waveform.astype(np.float32)
        length = int(waveform.shape[-1])
        outputs = self.sessions["codec_encode"].run(
            None,
            {"waveform": waveform, "input_lengths": np.asarray([length], dtype=np.int32)},
        )
        named = dict(zip([o.name for o in self.sessions["codec_encode"].get_outputs()], outputs, strict=True))
        codes = np.asarray(named["audio_codes"], dtype=np.int32)
        lengths = np.asarray(named["audio_code_lengths"], dtype=np.int32)
        code_len = int(lengths.reshape(-1)[0])
        n_vq = int(self.codec_meta["codec_config"]["num_quantizers"])
        return [[int(codes[0, fi, qi]) for qi in range(n_vq)] for fi in range(code_len)]

    def resolve_prompt_audio_codes(self, *, voice=None, prompt_audio_path=None) -> list[list[int]]:
        if prompt_audio_path:
            return self.encode_reference_audio(prompt_audio_path)
        resolved = str(voice or self.list_builtin_voices()[0]["voice"])
        row = next((v for v in self.list_builtin_voices() if v["voice"] == resolved), None)
        if row is None:
            raise ValueError(f"Built-in voice not found: {resolved}")
        return list(row["prompt_audio_codes"])

    # -- request row builders (verbatim) ------------------------------

    def build_text_rows(self, token_ids):
        rows = []
        width = int(self.manifest["tts_config"]["n_vq"]) + 1
        pad = int(self.manifest["tts_config"]["audio_pad_token_id"])
        for tid in token_ids:
            row = [pad] * width
            row[0] = int(tid)
            rows.append(row)
        return rows

    def build_audio_prefix_rows(self, prompt_audio_codes, slot_token_id=None):
        rows = []
        width = int(self.manifest["tts_config"]["n_vq"]) + 1
        pad = int(self.manifest["tts_config"]["audio_pad_token_id"])
        slot = int(self.manifest["tts_config"]["audio_user_slot_token_id"] if slot_token_id is None else slot_token_id)
        for code_row in prompt_audio_codes:
            row = [pad] * width
            row[0] = slot
            for idx in range(min(len(code_row), int(self.manifest["tts_config"]["n_vq"]))):
                row[idx + 1] = int(code_row[idx])
            rows.append(row)
        return rows

    def build_voice_clone_request_rows(self, prompt_audio_codes, text_token_ids):
        cfg = self.manifest["tts_config"]
        prefix = [
            *self.manifest["prompt_templates"]["user_prompt_prefix_token_ids"],
            int(cfg["audio_start_token_id"]),
        ]
        suffix = [
            int(cfg["audio_end_token_id"]),
            *self.manifest["prompt_templates"]["user_prompt_after_reference_token_ids"],
            *text_token_ids,
            *self.manifest["prompt_templates"]["assistant_prompt_prefix_token_ids"],
            int(cfg["audio_start_token_id"]),
        ]
        rows = [
            *self.build_text_rows(prefix),
            *self.build_audio_prefix_rows(prompt_audio_codes),
            *self.build_text_rows(suffix),
        ]
        return {"inputIds": rows, "attentionMask": [[1 for _ in rows]]}

    # -- local frame runners (verbatim) ------------------------------

    def run_local_decoder(self, global_hidden, text_token_id, frame_prefix):
        n_vq = int(self.manifest["tts_config"]["n_vq"])
        pad = int(self.manifest["tts_config"]["audio_pad_token_id"])
        prefix = np.full((1, n_vq - 1), pad, dtype=np.int32)
        for idx in range(min(len(frame_prefix), n_vq - 1)):
            prefix[0, idx] = int(frame_prefix[idx])
        out = self.sessions["local_decoder"].run(
            None,
            {
                "global_hidden": global_hidden.astype(np.float32, copy=False),
                "text_token_id": np.asarray([int(text_token_id)], dtype=np.int32),
                "audio_prefix_token_ids": prefix,
            },
        )
        named = dict(zip([o.name for o in self.sessions["local_decoder"].get_outputs()], out, strict=True))
        return named["text_logits"].reshape(-1), named["audio_logits"]

    def run_local_greedy_frame(self, global_hidden, previous_token_sets_by_channel, repetition_penalty):
        n_vq = int(self.manifest["tts_config"]["n_vq"])
        size = int(self.tts_meta["model_config"]["audio_codebook_sizes"][0])
        mask = np.zeros((1, n_vq, size), dtype=np.int32)
        for ci, tids in enumerate(previous_token_sets_by_channel):
            for tid in tids:
                if 0 <= tid < size:
                    mask[0, ci, tid] = 1
        out = self.sessions["local_greedy_frame"].run(
            None,
            {
                "global_hidden": global_hidden.astype(np.float32, copy=False),
                "repetition_seen_mask": mask,
                "repetition_penalty": np.asarray([float(repetition_penalty)], dtype=np.float32),
            },
        )
        named = dict(zip([o.name for o in self.sessions["local_greedy_frame"].get_outputs()], out, strict=True))
        cont = bool(int(np.asarray(named["should_continue"]).reshape(-1)[0]))
        frame = np.asarray(named["frame_token_ids"]).reshape(-1).astype(np.int32).tolist()
        return cont, [int(x) for x in frame]

    def run_local_fixed_sampled_frame(self, global_hidden, previous_token_sets_by_channel, rng=None):
        if rng is None:
            rng = self.rng
        n_vq = int(self.manifest["tts_config"]["n_vq"])
        size = int(self.tts_meta["model_config"]["audio_codebook_sizes"][0])
        mask = np.zeros((1, n_vq, size), dtype=np.int32)
        for ci, tids in enumerate(previous_token_sets_by_channel):
            for tid in tids:
                if 0 <= tid < size:
                    mask[0, ci, tid] = 1
        a_u = np.asarray([[min(0.99999994, max(0.0, float(rng.random()))) for _ in range(n_vq)]], dtype=np.float32)
        out = self.sessions["local_fixed_sampled_frame"].run(
            None,
            {
                "global_hidden": global_hidden.astype(np.float32, copy=False),
                "repetition_seen_mask": mask,
                "assistant_random_u": np.asarray([min(0.99999994, max(0.0, float(rng.random())))], dtype=np.float32),
                "audio_random_u": a_u,
            },
        )
        named = dict(zip([o.name for o in self.sessions["local_fixed_sampled_frame"].get_outputs()], out, strict=True))
        frame = np.asarray(named["frame_token_ids"]).reshape(-1).astype(np.int32).tolist()
        cont = bool(int(np.asarray(named["should_continue"]).reshape(-1)[0]))
        return cont, [int(x) for x in frame]

    def slice_audio_channel_logits(self, audio_logits, channel_index):
        per = int(audio_logits.shape[-1])
        flat = audio_logits.reshape(-1)
        return flat[channel_index * per : channel_index * per + per]

    # -- codec decode (verbatim) -------------------------------------

    def decode_full_audio(self, generated_frames):
        if not generated_frames:
            return [], 0
        codes, dims = _flatten3d_int32([generated_frames])
        out = self.sessions["codec_decode"].run(
            None,
            {
                "audio_codes": codes.reshape(dims),
                "audio_code_lengths": np.asarray([len(generated_frames)], dtype=np.int32),
            },
        )
        named = dict(zip([o.name for o in self.sessions["codec_decode"].get_outputs()], out, strict=True))
        length = int(named["audio_lengths"].reshape(-1)[0])
        audio = named["audio"]
        ch = int(audio.shape[1])
        return [audio[0, ci, :length].astype(np.float32) for ci in range(ch)], length

    # -- AR generation loop (verbatim, non-streaming) ----------------

    def generate_audio_frames(self, request_rows, on_frame=None, rng=None):
        if rng is None:
            rng = self.rng
        gd = self.manifest["generation_defaults"]
        width = int(self.manifest["tts_config"]["n_vq"]) + 1
        prefill_ids, pdims = _flatten3d_int32([request_rows["inputIds"]])
        prefill_mask, pmasks = _flatten2d_int32(request_rows["attentionMask"])
        out = self.sessions["prefill"].run(
            None,
            {"input_ids": prefill_ids.reshape(pdims), "attention_mask": prefill_mask.reshape(pmasks)},
        )
        named = dict(zip([o.name for o in self.sessions["prefill"].get_outputs()], out, strict=True))
        global_hidden = _extract_last_hidden(named["global_hidden"])
        past_valid = sum(int(x) for x in request_rows["attentionMask"][0])
        past_by_name = {
            on.replace("present_", "past_"): named[on] for on in self.tts_meta["onnx"]["prefill_output_names"][1:]
        }
        frames: list[list[int]] = []
        prev_by_ch = [[] for _ in range(int(self.manifest["tts_config"]["n_vq"]))]
        prev_set_by_ch = [set() for _ in range(int(self.manifest["tts_config"]["n_vq"]))]

        for _ in range(int(gd["max_new_frames"])):
            frame: list[int] = []
            if "local_greedy_frame" in self.sessions and not bool(gd["do_sample"]):
                cont, frame = self.run_local_greedy_frame(
                    global_hidden, prev_set_by_ch, float(gd["audio_repetition_penalty"])
                )
                if not cont:
                    break
                for ci, tok in enumerate(frame):
                    prev_by_ch[ci].append(tok)
                    prev_set_by_ch[ci].add(tok)
            elif "local_fixed_sampled_frame" in self.sessions and gd["sample_mode"] == SAMPLE_MODE_FIXED:
                cont, frame = self.run_local_fixed_sampled_frame(global_hidden, prev_set_by_ch, rng=rng)
                if not cont:
                    break
                for ci, tok in enumerate(frame):
                    prev_by_ch[ci].append(tok)
                    prev_set_by_ch[ci].add(tok)
            else:
                text_logits, _ = self.run_local_decoder(global_hidden, 0, [])
                next_text = _sample_assistant_text_token(text_logits, self.manifest, gd, rng)
                if next_text != int(self.manifest["tts_config"]["audio_assistant_slot_token_id"]):
                    break
                for ci in range(int(self.manifest["tts_config"]["n_vq"])):
                    _, audio_logits = self.run_local_decoder(global_hidden, next_text, frame)
                    ch_logits = self.slice_audio_channel_logits(audio_logits, ci).astype(np.float32, copy=False)
                    tok = _sample_audio_token(ch_logits, prev_by_ch[ci], prev_set_by_ch[ci], gd, rng)
                    frame.append(tok)
                    prev_by_ch[ci].append(tok)
                    prev_set_by_ch[ci].add(tok)
            frames.append(frame)
            next_row = np.full((1, 1, width), int(self.manifest["tts_config"]["audio_pad_token_id"]), dtype=np.int32)
            next_row[0, 0, 0] = int(self.manifest["tts_config"]["audio_assistant_slot_token_id"])
            for idx, tok in enumerate(frame):
                next_row[0, 0, idx + 1] = int(tok)
            feeds = {"input_ids": next_row, "past_valid_lengths": np.asarray([past_valid], dtype=np.int32)}
            for iname in self.tts_meta["onnx"]["decode_input_names"][2:]:
                feeds[iname] = past_by_name[iname]
            dout = self.sessions["decode"].run(None, feeds)
            dnamed = dict(zip([o.name for o in self.sessions["decode"].get_outputs()], dout, strict=True))
            global_hidden = _extract_last_hidden(dnamed["global_hidden"])
            past_valid += 1
            past_by_name = {
                on.replace("present_", "past_"): dnamed[on] for on in self.tts_meta["onnx"]["decode_output_names"][1:]
            }
            if on_frame is not None:
                on_frame(frames, 0, frame)
        return frames

    # -- synthesize ------------------------------------------------

    def synthesize(self, *, text, voice=None, prompt_audio_path=None, seed=None, enable_normalize_tts_text=True):
        rng = np.random.default_rng(int(seed)) if seed is not None else self.rng
        prepared = prepare_tts_request_texts(text=text, enable_normalize_tts_text=enable_normalize_tts_text)
        prompt_codes = self.resolve_prompt_audio_codes(voice=voice, prompt_audio_path=prompt_audio_path)
        text_ids = self.encode_text(str(prepared["text"]))
        request_rows = self.build_voice_clone_request_rows(prompt_codes, text_ids)
        frames = self.generate_audio_frames(request_rows, rng=rng)
        channels, _ = self.decode_full_audio(frames)
        sr = int(self.codec_meta["codec_config"]["sample_rate"])
        if channels:
            waveform = np.stack(channels, axis=1) if len(channels) > 1 else channels[0].reshape(-1, 1)
        else:
            waveform = np.zeros((0, 1), dtype=np.float32)
        return waveform.astype(np.float32), sr


def _sample_assistant_text_token(text_logits, manifest, gd, rng) -> int:
    candidate_ids = np.asarray(
        [
            int(manifest["tts_config"]["audio_assistant_slot_token_id"]),
            int(manifest["tts_config"]["audio_end_token_id"]),
        ],
        dtype=np.int32,
    )
    scores = text_logits[candidate_ids]
    return int(
        candidate_ids[
            _sample_from_scores(
                scores,
                do_sample=bool(gd["do_sample"]),
                temperature=float(gd["text_temperature"]),
                top_k=min(int(gd["text_top_k"]), int(scores.shape[0])),
                top_p=float(gd["text_top_p"]),
                rng=rng,
            )
        ]
    )


def _sample_audio_token(audio_logits, prev_ids, prev_set, gd, rng) -> int:
    penalty = float(gd["audio_repetition_penalty"])
    if not bool(gd["do_sample"]):
        return _argmax_with_repetition_penalty(audio_logits, prev_set, penalty)
    penalized = _apply_repetition_penalty(audio_logits, prev_ids, penalty)
    return _sample_from_scores(
        penalized,
        do_sample=True,
        temperature=float(gd["audio_temperature"]),
        top_k=int(gd["audio_top_k"]),
        top_p=float(gd["audio_top_p"]),
        rng=rng,
    )
