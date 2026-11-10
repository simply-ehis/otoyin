# Provenance (neutral, no action)

No third-party copied code was confirmed this pass. Suspects to revisit (GUESS, unverified):
- `backend/backends/_moss_tts_nano_onnx.py`, `_pocket_tts_onnx.py` — large ONNX wrappers; verify license headers. (GUESS)
- `app` deps `spessasynth_core`, `@waveform-playlist/*` — third-party libs used as dependencies (not vendored source). (TRACED via package.json)
- `backend/utils/hidden_subprocess.py` — name suggests vendored workaround; inspect. (GUESS)

No files were judged, removed or changed. Owner to review.