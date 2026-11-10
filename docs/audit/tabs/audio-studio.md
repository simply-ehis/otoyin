# Audio Studio

Route: `/audio-studio` → `app/src/features/audioStudio/AudioStudio.tsx` (+ `usePlaybackEngine.ts`, `AudioStudioStore.ts`). In nav: yes (Studio group). Moved from components/AudioStudio (AGENTS.md).

## Job
A user comes here for a DAW-like experience: waveform editing, mixer, effects, instruments, automation, mastering.

## Complete-flow checklist
1. Input: import audio, drag/drop. PRESENT.
2. Configure: tracks, clips, fades. PRESENT.
3. Model readiness: n/a (DSP) + optional models. PARTIAL.
4. Run: playback, render. PRESENT.
5. Preview: waveform, A/B. PRESENT.
6. Outputs: export. `services/daw_export.py`. PARTIAL.
7. Save/history: project/session. PARTIAL.
8. Link out: to all tabs. PARTIAL.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: undo/redo required (invariant); keyboard shortcuts. UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Audio edit | yes (`services/audio_edit.py`) | yes |
| Mixer | yes (`services/mixer.py`, `routes/mixer.py`, `mixer_sessions.py`) | yes |
| Effects chain | yes | yes |
| DAW export | yes (`daw_export.py`) | PARTIAL |
| Non-destructive edits | yes? | UNVERIFIED |

## Bugs/risks
- MAJOR: large component; potential UI freeze during heavy work. GUESS.
- MINOR: undo/redo verification needed. GUESS.

## Gaps & right UX
- Verify undo/redo + cancel long renders. PROPOSAL.
Confidence: GUESS.