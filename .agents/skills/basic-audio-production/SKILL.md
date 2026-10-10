---
name: basic-audio-production
description: Simple base recipe for ordinary TTS production — preset voice by default; clone/design only when the engine supports them; separate speaker renders; exact story sequencing, SFX timing, and 0.3 music level; no cleanup/enhancement for pure AI TTS.
---

# Basic Audio Production

This is the base recipe, not an engine-specific guide. If an engine page or old generation note contradicts it, follow the backend and capability metadata.

## Scope
This recipe works for every TTS engine through preset voices. Clone and design are conditional branches, not defaults:

- Clone only when the selected engine/model reports `clone_voice=true` or belongs to `CLONING_ENGINES`.
- Design only when the selected engine reports voice-design support, currently `parler_tts_gguf` or `neutts_2e`.
- Otherwise use preset voices.

Do not force clone/design on an unsupported engine.

## Pipeline tools
| stage | tool | purpose |
|---|---|---|
| discover engine | `21labs.list_models` | confirm available engines/models |
| discover voices | `21labs.list_profiles`, `21labs.list_preset_voices`, `21labs.list_reference_voices` | preset/reference selection |
| make voice | `21labs.create_profile`, `21labs.use_reference_voice`, `21labs.clone_voice` | preset, reference, clone, or design profile |
| render speech | `21labs.speak` | render one cue and return `generation_id` |
| check render | `GET /generate/{id}/status` | poll until completed and retain `audio_path` |
| extract supplied dialogue | `21labs.diarize` | only when given finished multi-speaker audio |
| cut | `21labs.splice`, `21labs.delete_region` | remove unwanted regions before sequencing |
| sequence | `21labs.create_story`, `POST /stories/{id}/items`, story trim/move/fade/gain/split/reorder | exact cue timing and nondestructive edits |
| SFX/music | `21labs.generate_sfx` | cue-specific SFX or optional music bed |
| verify | `21labs.analyze_loudness` | check delivery loudness |
| deliver | `GET /export/presets`, `POST /export/apply-preset`, `21labs.export_story_audio` | platform encode or story WAV |

## 1. Cast the voice
1. Call `21labs.list_models`.
2. Call `21labs.list_preset_voices` for the selected engine.
3. Use the first compatible preset unless the user supplies a reference or design request.
4. Create the profile only when needed:

```text
21labs.create_profile(
  name="<voice name>",
  voice_type="preset",
  language="en",
  preset_engine="<engine>",
  preset_voice_id="<preset_voice_id>"
)
```

Clone only with reference audio and a clone-capable engine:

```text
21labs.clone_voice(
  name="<voice name>",
  sample_path="<absolute reference path>",
  reference_text="<exact spoken words>",
  language="en",
  default_engine="<clone-capable engine>"
)
```

Design only with a design-capable engine:

```text
21labs.create_profile(
  name="<voice name>",
  voice_type="designed",
  language="en",
  design_prompt="<concise voice description>",
  default_engine="parler_tts_gguf"
)
```

## 2. Write cues
Use plain text for one speaker. For dialogue, make this table:

```text
cue  speaker  profile  text
1    Aria     <id>     "Welcome back."
2    Bram     <id>     "Thanks. Shall we begin?"
```

If supplied with finished two-speaker audio, use `21labs.diarize` to recover cues. Otherwise do not transcribe generated lines.

Render each cue separately:

```text
21labs.speak(
  text="<one cue>",
  profile="<profile name or id>",
  engine="<engine>",
  language="en"
)
```

Wait for completion and save every `audio_path`.

## 3. Sequence chunks
Create and fill a story in cue order:

```text
21labs.create_story(name="<production name>")
POST /stories/{id}/items
{
  "generation_id": "<dialogue generation>",
  "start_time_ms": <cue time>,
  "track": 0
}
```

Remove only unwanted material with `21labs.splice` or `21labs.delete_region`. Prefer story trim/move/fade/gain/split/reorder for sequencing.

For pure AI dialogue, do not use cleanup, denoise, de-essing, normalization, enhancement, or corrective mastering. `run_recipe` may be used with `effects: []` for simple chronological stitching only when there is no custom SFX timing or 0.3 music requirement.

Place each SFX at its script cue:

```text
POST /stories/{id}/items
{
  "generation_id": "<sfx generation>",
  "start_time_ms": <exact cue ms>,
  "track": 1
}
```

For optional music, use track 2 and set volume to 30% of the original linear level:

```text
PUT /stories/{story_id}/items/{music_item_id}/volume
{
  "volume": 0.3
}
```

## 4. Deliver
Check loudness, then export:

```text
21labs.analyze_loudness(audio_path="<story export path>")
GET /export/presets
POST /export/apply-preset
{
  "preset_name": "<preset>",
  "audio_path": "<story export path>"
}
```

Use `21labs.export_story_audio` when a mixed story WAV is sufficient.

## Done when
- Every speaker uses a resolved preset, supported clone, or supported designed voice.
- Every cue has completed audio.
- Cues, SFX times, and music volume are explicit.
- No cleanup/enhancement tools were used on pure AI dialogue.
- Final loudness matches the selected preset.
