# Generate (Text-to-Speech)

Route: `/` → `app/src/features/generate/GeneratePage.tsx`. In nav: yes (Create group).

## Job
A user comes here to turn text into speech with a chosen voice/engine and download it. Steps: type text → pick engine/model + voice profile → set speed/style (if supported) → generate → preview → download/save to history.

## Complete-flow checklist
1. Input: Textarea + paste; long text chunking handled in backend `services/chunked_tts.py` (TRACED via skills). PARTIAL (no file import of long docs? UNVERIFIED).
2. Configure: engine selector + voice profile picker + speed/style. Defaults present. PARTIAL (style only where engine supports instruct; Qwen CustomVoice).
3. Model readiness: model picker present (TRACED TAB_AUDIT). Installed state shown via marketplace. PARTIAL (no one-click install inline? GUESS).
4. Run: primary Generate button, progress via `GenerationProgressList`, cancel? UNVERIFIED.
5. Preview: audio player + waveform. PRESENT (AudioPlayer).
6. Outputs: download, save to history, favorite. PRESENT.
7. Save/history: `HistoryList`, generations table. PRESENT.
8. Link out: Send to Effects/Edit/Dubbing? GUESS partial.
9. Errors/recovery: toast on failure; UNVERIFIED retry.
10. States: empty/loading/running/done/error. PARTIAL (verify).
11. Feel: keyboard shortcuts? UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| TTS engines | yes (`backends/*`, `services/generation.py`) | yes |
| Voice profiles | yes (`services/profiles.py`, `/profiles`) | yes |
| Long-text chunking | yes (`utils/chunked_tts.py`) | yes (engine-level) |
| History | yes (`services/history.py`, `/generations`) | yes |
| Cancel job | partial (`tasks.py`) | UNVERIFIED |

## Bugs/risks
- MAJOR: Kokoro long-text hang risk noted in skill `tts-kokoro` (needs chunking+timeout). Verify chunking applied. GUESS.
- MINOR: style controls only on engines supporting instruct; UI must disable otherwise. UNVERIFIED.

## Gaps & right UX
- Add "Send to..." (Effects, Dubbing, Edit) after generation. PROPOSAL.
- Inline model install prompt when model missing. PROPOSAL.
Confidence: TRACED (route/nav/model picker), GUESS (cancel/retry/details).