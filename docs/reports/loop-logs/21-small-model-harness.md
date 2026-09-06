# Loop log — 21-small-model-harness

## 2026-09-05 — PLAN
Re-read Context: 4 bundled models as one-off services; fragmentation with wide blast radius (VAD gates STT, DeepFilter cleans output, stems feed dubbing/audiobooks).

## 2026-09-05 — unit-by-unit SELF-VERIFY
| Unit | Check | Result |
|---|---|---|
| Duplication resolved | BOTH `deepfilter_cleanup.py` + `deepfilter_onnx.py` present; BOTH `stem_separation.py` + `stem_separation_onnx.py` present. No selection-rule doc found; no consolidation commit found | FAIL → REAL GAP (ambiguity exactly as audited; untouched) |
| Lifecycle decision | `model_lifecycle.py` has zero deepfilter/demucs/vad/lavasr references (still true). Load-time/failure-rate measurements NOT run | NOT STARTED |
| Coverage parity | Only `test_vad.py`; no deepfilter/stem/lavasr test files | FAIL → REAL GAP (1/4 at parity) |
| Error normalization | Missing-file/corrupt-cache failure-shape test per model NOT run | NOT STARTED |

## AUDIT checkpoint
4-suite joint re-run after any change: no changes yet. PASS (vacuous).

## Exit checklist — all open.
→ FILE NOT STARTED. Clean handoff bundle for whoever takes it: decide ONNX-vs-PyTorch (or document both-reachable with a proving test), measure, test, normalize. Pairs with 06 (lifecycle) + 14 (testing) per 00-START-HERE.
