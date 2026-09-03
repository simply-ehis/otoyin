PURPOSE: Router/index for otoyin's instrument-rendering capabilities — directs an agent to the right instrument skill for a given request.

OWNS: `.agents/skills/instruments/SKILL.md` (router), which delegates to `procedural-instruments`, `virtual-instruments-gm`, `drum-machine`.

READ-WHEN: An AI is asked to render any instrument hit, drum hit, noise, GM note, or drum loop, or to choose between SoundFont-free and SoundFont-backed synthesis.

KEY-FILES: `39-gm-instruments.md`, `.agents/skills/procedural-instruments/SKILL.md`, `.agents/skills/virtual-instruments-gm/SKILL.md`, `.agents/skills/drum-machine/SKILL.md`.

INVARIANTS:
- Procedural instruments need NO SoundFont and never 501; GM/drum-machine need a SoundFont in `data/soundfonts/` (else 501).
- All instrument endpoints return 48000 Hz (procedural = mono, GM/drum-machine = stereo).
- Offline/on-device only — no cloud synthesis.

GOTCHAS:
- Use procedural for quick deterministic hits/noise beds; use GM for realistic melodic instruments; use drum-machine for patterned loops.
- GM `program` is 0-based (0 = piano).

## Routing table
| Request | Skill |
|---|---|
| piano/synth/drum-pad/noise hit, no SoundFont | [procedural-instruments](../.agents/skills/procedural-instruments/SKILL.md) |
| "play piano note", strings, trumpet, bell (realistic) | [virtual-instruments-gm](../.agents/skills/virtual-instruments-gm/SKILL.md) |
| drum beat / 16-step loop | [drum-machine](../.agents/skills/drum-machine/SKILL.md) |

UPDATED: 2026-07-17
