# Instruments

Route: `/instruments` → `app/src/features/instruments/InstrumentLibrary.tsx` (also `InstrumentBrowser`, `InstrumentPreview`, `DrumMachinePanel`, `BeatMapPanel`). In nav: yes (Studio group).

## Job
A user comes here to browse and play GM instruments, drum machines, and procedural instruments, and add them to a project.

## Complete-flow checklist
1. Input: select instrument/pad. PRESENT.
2. Configure: note, velocity, params. PARTIAL.
3. Model readiness: SoundFont (GM) required for GM instruments. PARTIAL (model not installed state? GUESS).
4. Run: play note/pad. PRESENT (skills: play_piano_note etc.).
5. Preview: audio preview. PRESENT (`InstrumentPreview`).
6. Outputs: render to clip? `services/gm_instrument.py`, `dsp_synth.py`. PARTIAL.
7. Save/history: instrument packs (`services/soundfont_packs.py`, `routes/instrument_packs.py`). PARTIAL.
8. Link out: to Audio Studio/Mixer. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: keyboard play? UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| GM instruments | yes (`services/gm_instrument.py`, `routes/instruments.py`) | yes |
| Drum machine | yes (`services/drum_machine.py`) | yes (`DrumMachinePanel`) |
| Procedural instruments | yes (`dsp_synth.py`) | yes |
| SoundFont packs | yes (`routes/instrument_packs.py`) | PARTIAL |

## Bugs/risks
- MINOR: SoundFont not installed state unclear. GUESS.

## Gaps & right UX
- Add "Send to Audio Studio track". PROPOSAL.
Confidence: GUESS/TRACED (skills).