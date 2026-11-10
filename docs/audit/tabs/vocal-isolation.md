# Vocal Isolation (Stem Separation)

Route: `/vocal-isolation` → `app/src/features/workspace/VocalIsolationView.tsx` (+ `app/src/features/stems/*`). `/stem-separation` redirects here. In nav: yes (Processing group).

## Job
A user comes here to split audio into vocals/drums/bass/other (and karaoke/acapella) with per-stem playback and export.

## Complete-flow checklist
1. Input: drop audio, show name/length/waveform. PARTIAL.
2. Configure: preset (vocals+inst, 4 stems, karaoke, acapella), model. PARTIAL (model picker missing common gap).
3. Model readiness: Demucs. PARTIAL.
4. Run: progress + cancel. PARTIAL.
5. Preview: per-stem waveform, solo/mute, volume, isolated preview, mixed A/B. PARTIAL (verify).
6. Outputs: export one/selected/all (zip), format. PARTIAL.
7. Save/history: UNVERIFIED.
8. Link out: to Effects/Noise Reduction/Edit/Spatial. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Demucs ONNX | yes (`stem_separation_onnx.py`, `onnx_demucs_backend.py`) | yes |
| Demucs (torch) | yes (`stem_separation.py`) | PARTIAL |
| Stems UI | client | yes (`features/stems/*`) |

## Bugs/risks
- MAJOR: model picker missing (common gap). GUESS.
- MINOR: orphan `features/stems/*` possibly unused (verify). GUESS.

## Gaps & right UX
- Add model picker + full stem UX per worked example. PROPOSAL.
Confidence: GUESS.