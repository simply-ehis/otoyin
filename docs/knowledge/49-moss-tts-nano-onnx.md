# MOSS-TTS-Nano ONNX Backend

PURPOSE: How the MOSS-TTS-Nano engine runs torch-free via ONNX Runtime in otoyin — zero-shot voice cloning from reference audio, 20 languages, 48 kHz stereo downmixed to the project 24 kHz mono standard.
OWNS: backend/backends/_moss_tts_nano_onnx.py, backend/backends/moss_tts_nano_onnx_backend.py, backend/backends/__init__.py (TTS_ENGINES + factory branch)
READ-WHEN: You touch MOSS-TTS-Nano generation, add/edit the vendored ONNX engine, or change engine selection in __init__.py.
KEY-FILES: _moss_tts_nano_onnx.py (faithful port of ort_cpu_runtime.py + onnx_tts_runtime.py: sessions, AR loop, codec decode, SentencePiece), moss_tts_nano_onnx_backend.py (async wrapper, 48k->24k downmix/resample), base.py (is_model_cached, model_load_progress)
INVARIANTS: The vendored engine is a verbatim port of OpenMOSS/MOSS-TTS-Nano's ONNX path — no invented tensor names. `is_onnx_available()` is gated on BOTH `onnxruntime` AND `sentencepiece`; without `sentencepiece` it returns False and the factory raises (there is no torch fallback for this engine). Output is natively 48 kHz stereo; the backend wrapper downmixes to mono and resamples to 24 kHz before returning. Reference audio is encoded to prompt codes via `codec_encode` (torch-free: soundfile + librosa replace torchaudio).
GOTCHAS: Weights are multi-GB HF LFS assets (MOSS-TTS-Nano-100M-ONNX + MOSS-Audio-Tokenizer-Nano-ONNX) — verification is structural (imports + availability + factory wiring), not audio output. Text normalization uses a light built-in cleanup, NOT WeTextProcessing (heavy native dep, intentionally omitted). The ONNX graph set: prefill, decode_step, local_decoder, {local_greedy_frame|local_fixed_sampled_frame|local_cached_step}, codec_encode, codec_decode, codec_decode_step. Apache-2.0 licensed.
UPDATED: 2026-07-18

## Pipeline (one voice-clone chunk)
1. `encode_reference_audio` -> `codec_encode` (waveform+lengths) -> `prompt_audio_codes` (RVQ rows).
2. `encode_text` -> SentencePiece token ids.
3. `build_voice_clone_request_rows` -> prefix text + audio prefix + suffix text.
4. `prefill` -> `global_hidden` + KV past (`present_*` -> `past_*`).
5. AR loop: `local_fixed_sampled_frame` (default) / `local_greedy_frame` / `local_decoder` -> frame tokens (n_vq channels) -> `decode` step -> next `global_hidden`.
6. `generate_audio_frames` -> `codec_decode` -> 48 kHz stereo waveform.

## Factory contract
`get_tts_backend_for_engine("moss_tts_nano")` returns `MossTTSNanoOnnxBackend` only when `is_onnx_available()` AND `_is_model_cached()` pass; otherwise it raises a clear `ValueError` (no torch backend exists). This matches the project's "ONNX-first, torch fallback" pattern except there is no torch path for this engine.

## Agent Callable
- **MCP Tools:** `21labs.speak` (uses moss_tts_nano engine)
- **REST Endpoints:** `POST /generate` (with `engine: "moss_tts_nano"`)
- **Key Backend Files:** `backend/backends/moss_tts_nano_onnx_backend.py`
- **Key Frontend Files:** `app/src/components/Generation/EngineModelSelector.tsx`
