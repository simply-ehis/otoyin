# Model-download gating audit (prompt 07, Part A) — CORRECTED

Question: can any code path silently download model weights outside the
marketplace/Models-tab install flow? Method: enumerated every
`hf_hub_download` / `snapshot_download` / `from_pretrained` call site in
`backend/backends/`, classified each as ctor / load-path / explicit-download,
and traced every factory + route entry point for a gate in front of it.

An earlier draft of this audit flagged music/LLM/VC factories as holes.
Re-verification showed that was wrong — the factories only run cheap
constructors; the loads self-gate (details below). The record is corrected
here so nobody "fixes" it into a regression.

## Verdict: no live silent-download paths

Defense holds at three independent layers; every layer was verified, not
assumed:

1. **Cheap constructors (verified 15 backend files).** No `__init__`
   performs network I/O: kokoro, fish_speech, chattts, f5 (both), zonos,
   parler, qwen3_tts, neutts, orpheus, styletts2 (+onnx), bark (no custom
   init), kitten, moss, parakeet, qwen3_asr, whisper_cpp. So enumerating
   engines (`/tts/engines`, factory caches) can never trigger a download.
2. **Cache-checked loads.** Every load path verified checks presence first
   and raises (`ModelNotCachedError` / `FileNotFoundError` + Models-tab
   hint / `local_files_only=True`) instead of downloading: kokoro, fish,
   zonos, parler, faster-whisper, neutts, gguf-llm, stable-audio,
   acestep, heartmula, sa3, openvoice. Bare `hf_hub_download` calls sit
   exclusively inside explicit `_download_model*` / install methods.
3. **Manifest entitlement at routes + chokepoints.** TTS generation
   (`ensure_model_cached_or_raise` + `load_engine_model` manifest gate),
   transcription UI, streaming STT (non-cloud), `/models/load`, RVC
   voice-pack presence. The Models-tab install flow records manifest rows
   (with engine); startup `reconcile_downloads()` backfills bundled/cached
   models so legitimate installs are never blocked.
4. **Bundled set** (`scripts/download_required_models.py`) is the one
   intentional exception: explicit build/setup-time bundle.

## Residuals (not holes, tracked)

- `seed_vc` weight behavior lives inside the third-party wrapper behind a
  venv gate — not verified here; flag for 21 (small-model harness).
- `utils/hf_offline_patch.py` is dead in production (no non-test
  importer). It is REDUNDANT, not a missing backstop — decide: wire it as
  a fail-loud backstop or delete it so dead security-adjacent code stops
  misleading future audits.
- `transcript_edit.py` is safe (faster-whisper self-gates) but would give
  a friendlier error with the one-line manifest pre-check from
  `transcription.py:30`. Optional polish.
- If `OTOYIN_CATALOG_URL` serves a remote catalog, IT must drop the three
  removed NC products too — local removal does not propagate upstream.

## Tracked follow-ups

- 07 Part B (remote catalog) already landed; this audit covers Part A only.
- Re-run this grep after any new backend lands: `hf_hub_download`,
  `snapshot_download`, `from_pretrained` under `backend/backends/` —
  then classify ctor vs load vs explicit-download as above.
- Do NOT add manifest guards to engine factories (verified 2026-09-05):
  tests, capability listings, and tools call factories directly, and
  every backend already refuses uncached loads — factory gating would
  break those callers while adding nothing. Entitlement stays at routes
  + the TTS chokepoint. This paragraph exists so nobody re-adds factory
  guards in a future pass.
