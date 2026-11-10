# Studio (Piano/Drums/Synth/SFX)

Route: `/studio` → `app/src/features/workspace/StudioView.tsx`. In nav: yes (Studio group).

## Job
A user comes here to play piano, drum pads, synth and SFX, and record/arrange ideas.

## Complete-flow checklist
1. Input: MIDI/keyboard? UNVERIFIED.
2. Configure: instrument, params. PARTIAL.
3. Model readiness: SoundFont for GM. PARTIAL.
4. Run: play/record. PARTIAL.
5. Preview: audio. PARTIAL.
6. Outputs: render to clip. PARTIAL.
7. Save/history: UNVERIFIED.
8. Link out: to Audio Studio/Mixer. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: keyboard shortcuts. UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| GM instruments | yes | yes |
| Drum machine | yes | yes (`DrumMachinePanel`) |
| Procedural synth | yes (`dsp_synth.py`) | yes |

## Bugs/risks
- MINOR: SoundFont install state. GUESS.

## Gaps & right UX
- Add render-to-track + send-to. PROPOSAL.
Confidence: GUESS.