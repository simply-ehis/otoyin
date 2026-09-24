---
name: mcp-tool-reference
description: Consolidated catalog of every 21labs.* MCP tool (namespace at /mcp) — parameters, response shape, error codes, and a real example call for each major tool. Load when wiring or debugging any MCP tool call.
---
# MCP Tool Reference

## Purpose
Complete surface of `21labs.*` MCP tools (FastMCP, mounted at `/mcp`, port 17493 / `twentylabs_PORT`).
All tools are thin wrappers that call the REST API in-process and return base64 WAV or JSON. Signatures
below are read from the `backend/mcp_server/tools/` package (203 live tools).
Audio returns as `{ audio_base64, sample_rate, duration, bytes }`
unless noted. (TR holds 204 entries; one is overridden by a manual registrar
with the same name. `backend/tests/test_mcp_registration_invariant.py` locks
the decorated↔TR match; `test_mcp_tool_count.py` floors the live count.)

## When to use
- Calling or debugging any `21labs.*` tool.
- Need exact parameter names / defaults / error codes.

## Global error codes
| code | meaning | action |
|------|---------|--------|
| 400 | model not downloaded / bad args | download model or fix args |
| 404 | audio not ready / job not found | poll `/generate/{id}/status`; re-check id |
| 501 | SoundFont missing (GM instruments) | install SoundFont in `data/soundfonts` |
| ValueError raised (tool) | engine pkg missing / invalid args | install pkg or fix input (not a 500) |
| 200 MB limit | transcribe input too large | split/compress source |

## Core — speak / transcribe / list
| tool | key params | response | notes |
|------|-----------|----------|-------|
| 21labs.speak | text, profile?, engine?, personality?, language? | `{ generation_id, status, profile, poll_url }` | poll `/generate/{id}/status` (404 until ready) |
| 21labs.transcribe | audio_base64 XOR audio_path (loopback abs only), language?, model? | `{ text, duration, language, model }` | model ∈ base/small/medium/large/turbo |
| 21labs.list_profiles | — | `{ profiles:[{id,name,voice_type,language,has_personality}] }` | |
| 21labs.list_captures | limit=20(1–200), offset=0 | `{ captures, total }` | |
| 21labs.capture_words | capture_id | Scribe-shaped `{ text, words[] }` JSON | words include timing, speaker_id, spacing, audio events |
| 21labs.capture_chapters | capture_id | `{ chapters: [{ index, title, start, end }] }` | auto-chapters from words + detected events |
| 21labs.list_models | — | `{ tts_engines, music_engines, llm_engines, stt }` | discovery of valid `engine=` |

Example:
```
21labs.speak(text="Hello", profile="Morgan", engine="zonos")
21labs.transcribe(audio_base64="<b64>", model="base")
```

## Music / SFX
| tool | params | response |
|------|--------|----------|
| generate_music | engine=acestep_gguf/heartmula, prompt, duration_seconds=30, genre?, mood?, tempo?, seed? | audio_base64 | manifest-gated, 400 if model not downloaded |
| generate_sfx | prompt, duration_seconds=5, seed? | audio_base64 (Stable Audio) | |

## Audio processing
| tool | params | response | code |
|------|--------|----------|------|
| master_audio | audio_path, target_lufs=-14.0, true_peak_db=-1.0, width=0.0 | base64 WAV | 400 if missing |
| normalize_audio | audio_path, target_db=-14.0, max_peak_db=-3.0 | base64 WAV | |
| noise_reduce | audio_path, vad_threshold=0.5 | base64 WAV | |
| compress_audio | audio_path, threshold_db=-20, ratio=4, attack_ms=10, release_ms=100, makeup_gain_db=0 | base64 WAV | |
| duck_audio | audio_path, track_configs=[], threshold_db=-30, ratio=4, duck_gain_db=-12, attack_ms=5, release_ms=50 | base64 WAV | |
| silence_removal | audio_path, threshold_db=-40, min_length_ms=100, max_silence_ms=5000 | base64 WAV | |
| separate_audio | audio_path, stem="vocals", model_name="htdemucs" | base64 WAV | err if Demucs missing |
| spectrogram | audio_path, fft_size=2048, hop_length=512, window="hann" | JSON | |
| analyze_loudness | audio_path | `{ integrated_lufs, true_peak_db, rms, crest, loudness_range, duration }` JSON | |
| bounce | tracks:list[dict], sample_rate=44100, master_volume=1.0 | mixed base64 WAV + track_count | |
| bounce_preview | tracks, sample_rate=44100, master_volume=1.0 | base64 WAV | |

Example:
```
21labs.master_audio(audio_path="/data/generations/x.wav", target_lufs=-16.0, true_peak_db=-1.0)
```

## Conversation / dialogue
| tool | params | response |
|------|--------|----------|
| list_conversation_presets | — | JSON |
| conversation_auto_duck | lines:list[dict] | ducking gain envelope JSON |
| conversation_auto_level | lines:list[dict] | level-matched JSON |

## Batch (see [batch-queue](./batch-queue/SKILL.md))
| tool | params | response |
|------|--------|----------|
| list_batch_jobs | — | `{ jobs:[...] }` |
| get_batch_job | job_id | one job JSON |
| create_batch_job | name, func_name, func_args={} | `{ id, name, status, func_name }` |
| cancel_batch_job | job_id | `{ message, id }` |

## Instruments (offline; GM needs SoundFont → 501 if absent)
| tool | params | response |
|------|--------|----------|
| play_gm_instrument | program (0–127, 0=piano), note=60, duration=1.0, velocity=0.8 | base64 WAV |
| play_drum_machine | pattern:list, step_duration=0.125, bars=1, velocity=0.8 | base64 WAV |
| play_piano_note | note, duration=1.0, velocity=0.8 | base64 WAV |
| play_synth_note | note, duration=1.0, waveform="sawtooth", velocity=0.8 | base64 WAV |
| play_drum_pad | drum_type="kick", duration=0.5, velocity=0.8 | base64 WAV |
| generate_noise | noise_type="white", duration=1.0, amplitude=0.5 | base64 WAV |

Example:
```
21labs.play_gm_instrument(program=0, note=60, duration=1.0, velocity=0.8)
```

## Channels / Stories / Project
| tool | params |
|------|--------|
| list_channels / get_channel / get_channel_voices / create_channel(name, device_ids=[]) | GET/POST /channels* |
| list_stories / get_story / create_story(name, description?) / export_story_audio(story_id) | /stories* |
| list_project_templates / create_project(name="Untitled Project", description="", fps=24.0, sample_rate=48000) / save_project / load_project / import_script | /project/* |

## Plugins / Scripting / Presets / Models
| tool | endpoint |
|------|----------|
| list_plugins / plugin_status / plugins_scan / plugins_process(audio_path, chain=[]) | /plugins/* |
| list_scripting_functions / scripting_execute(function, args={}) | /scripting/* |
| list_community_presets / list_community_preset_categories / list_builtin_presets / export_preset / import_preset | /community-presets, /presets/* |
| models_download(model_name) / model_progress / model_cache_dir / models_load / models_unload | /models/* |
| run_recipe(segments:list, recipe="podcast", music_path?, target_lufs?, gap_ms=250) | POST /recipe/run |
| arrange_music(sections, genre, mood, duration_seconds=60, separate_stems=False) | POST /generate/music |
| export_subtitles(audio_path, fmt="srt", model?, language?) | POST /transcription/export-subtitles |

## Pitfalls / Gotchas
- Audio-primitive tools (noise_reduce/normalize/compress/duck/silence_removal) send args as **query
  params**; the server must be running for the in-process HTTP call to resolve.
- `bounce` tracks match `BounceTrackConfig` (each `audio_data` is base64 WAV; `midi_notes` for synth).
- GM `program` is 0-based (0 = piano). Missing SoundFont → 501.
- `POST /conversation/render` does NOT exist — use `speak` per line + auto_duck/auto_level.
- `speak` returns a `poll_url`; audio is 404 until ready.

## Cross-links
- [engine-atlas](./engine-atlas/SKILL.md)
- [agent-operating-guide](./agent-operating-guide/SKILL.md)
- [effects-field-guide](./effects-field-guide/SKILL.md)

## Validation
- Call `21labs.list_models` first to confirm valid `engine=` values; a 400 means not downloaded.
