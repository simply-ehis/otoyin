# otoyin Grounding Pack — REAL values extracted from code (2026-08-03)

Use these as the source of truth when writing skills. All numbers below were read
directly from `backend/`. If you need something not listed, READ THE CODE and cite it.

## Effects — `backend/services/plugins.py` BUILTIN_EFFECTS (the 10-effect chain)
Applied via `POST /effects/preview/{generation_id}` (assistant `apply_effects`) OR a
generation's `effects_chain` array. NOT applied by `run_recipe` (see gotcha).
| effect | params (min–max, default) |
|--------|---------------------------|
| pitch_shift | semitones [-12,12] def 0 (st) |
| formant_shift | shift_factor [0.5,2.0] def 1.0 |
| time_stretch | factor [0.5,2.0] def 1.0 |
| reverb | room_size [0,1] 0.5, damping [0,1] 0.5, wet [0,1] 0.3 |
| delay | delay_ms [10,1000] 200 (ms), feedback [0,0.9] 0.4, mix [0,1] 0.3 |
| chorus | depth [0,0.01] 0.002, rate [0.1,5] 1.5 (Hz), mix [0,1] 0.5 |
| distortion | gain [1,10] 2.0, mix [0,1] 0.5 |
| eq | low_gain [-12,12] 0, mid_gain [-12,12] 0, high_gain [-12,12] 0 dB — 3-band SHELVING |
| compressor | threshold [-60,0] -20 (dB), ratio [1,20] 4, attack [0.001,0.1] 0.01 (s), release [0.01,1] 0.1 (s) |
| noise_gate | threshold [-60,0] -40 (dB) |

## Cleanup effects — `backend/services/effects_extended.py` (used ONLY inside run_recipe segment `effects`)
- deesser: threshold_db def -18.0, reduction_db def -6.0, freq_low 4000.0, freq_high 8000.0, strength [0,1] 0.6. Attenuates detected 4–8 kHz sibilant band.
- spectral_denoise: amount [0,1] 0.7. Estimates noise profile from FIRST 100 ms, spectral subtraction.

## Recipe targets — `backend/services/recipe_runner.py` RECIPE_TARGETS
| recipe | target LUFS | channels | notes |
|--------|-------------|----------|-------|
| podcast | -16.0 | mono | crossfade gap_ms default 250, fade_ms 120 |
| audiobook | -18.0 | stereo | |
| film-dialogue-adr | -24.0 | 5.1 (or stereo) | |
| voiceover-ad | -12.0 | mono | |
| social-short | -14.0 | mono | |
| youtube | -14.0 | mono (stereo for hosted) | |
true_peak_db default = -1.0. `master_audio(speech, sr, target_lufs, true_peak_db)`.

## Engines — `backend/backends/protocols.py::TTS_ENGINES` (13)
Keys are the `engine=` values accepted by `POST /generate` / `21labs.speak`. The registry
(`registry.py::get_tts_backend_for_engine`) raises `ValueError: Unknown TTS engine` for any
engine not listed here — old docs' qwen / qwen_custom_voice / step_audio_editx / pocket_emo /
luxtts / chatterbox / chatterbox_turbo / tada / piper / xtts_v2 are REMOVED (no backend
modules exist for them). ACE-Step (music) and Bark (non-verbal SFX) are removed too.
| engine | model(s) | size MB | langs | clone? | notes |
|--------|----------|---------|-------|-------|-------|
| kokoro | Kokoro-82M / ONNX | 350 / 340 | 8 (en,es,fr,hi,it,pt,ja,zh) | NO — preset blend + custom .pt packs only | fast CPU narration; default engine; chunk long text + 120s/chunk timeout |
| fish_speech | Fish Speech S1-mini (0.5B) | 2000 | 13 | gen-time zero-shot (CLONING_ENGINES) | reference-style voice |
| zonos | Zyphra Zonos v0.1 | 2000 | 5 (en,ja,zh,fr,de) | clone + emotion (CLONING_ENGINES) | |
| styletts2 | StyleTTS2 LibriTTS / ONNX | 400 / 440 | 1 (en) | clone (CLONING_ENGINES) | CC-BY-NC weights |
| chattts | ChatTTS | 400 | 2 (en,zh) | — | |
| f5_tts | F5-TTS Small / ONNX | 600 / 700 | 2 (en,zh) | gen-time clone (CLONING_ENGINES) | CC-BY-NC weights |
| pocket_tts | Pocket-TTS / ONNX | 200 | 6 (en,fr,de,pt,it,es) | clone (CLONING_ENGINES) | 100M, CPU |
| parler_tts | Parler-TTS Mini | 880 | 1 (en) | text-described voice | prompt describes the voice |
| moss_tts_nano | MOSS-TTS-Nano (ONNX) | 763 | 20 | gen-time zero-shot (NOT in CLONING_ENGINES) | torch-free ONNX only; no torch fallback |
| kitten_tts | KittenTTS (mini) | 80 | 1 (en) | — | KITTEN_SIZE env: mini=80 / micro=40 MB |
| neutts | NeuTTS-Air (Q4 GGUF) | 400 | 1 (en) | zero-shot clone (NOT in CLONING_ENGINES) | Apache 2.0 |
| neutts_2e | NeuTTS-2E (Q4 / Q8 GGUF) | 400 / 700 | 1 (en) | zero-shot clone (NOT in CLONING_ENGINES) | |
| orpheus | Orpheus 3B (Q4_K_M / Q8_0 GGUF) | 2360 / 4030 | 1 (en) | — | |
(Total: 13 TTS + 1 music + 1 STT + 1 LLM. OLD docs say "17" or "10" or "11" TTS engines — WRONG.
CLONING_ENGINES = {fish_speech, zonos, styletts2, f5_tts, pocket_tts} —
`backend/services/profiles.py:26`.)

## GM instruments + drum machine — `backend/services/gm_instrument.py`, `drum_machine.py`, `routes/instruments.py`
Offline via `tinysoundfont` + a SoundFont in `data/soundfonts/` (FreePats / FluidR3_GM.sf2 / FluidR3_GS.sf2). Missing → HTTP 501 with install hint.
- GM program is 0-BASED: 0 piano, 32 bass, 40 strings, 56 trumpet, 73 pad, 112 tinkle bell. (Do NOT add 1.)
- `play_gm_instrument(program, note=60, duration=1.0, velocity=0.8)` → `POST /instruments/gm`
- `play_drum_machine(pattern | lanes, swing=0.0, step_duration=0.125, bars=1, velocity=0.8)` → `POST /instruments/drum-machine`. `pattern` = list of steps, each a voice name ("kick") or list (["kick","hihat"]); OR `lanes` = {voice: [per-step velocity 0..1]} (longest lane = bar, wins over `pattern`). `swing` 0..0.5 delays off-steps. Voices: kick/snare/hihat/clap/tom. step_duration 0.125 s = 120 BPM sixteenths.
- `GET /instruments/gm-types` for discovery (`note` + `programs`: all 128 GM names with families). Stereo 48000 Hz.

## MCP tool surface — `backend/mcp_server/tools/` (namespace `21labs.*`)
**~106 tools** across 10 files in the `tools/` package (one module per domain). Core tools:
speak, transcribe, list_captures, list_profiles, generate_sfx, list_models, bounce,
bounce_preview, list_conversation_presets, conversation_auto_duck,
conversation_auto_level, list_batch_jobs, get_batch_job,
create_batch_job, cancel_batch_job, list_community_presets, list_community_preset_categories,
list_builtin_presets, export_preset, import_preset, voice_changer_capabilities, list_channels,
get_channel, get_channel_voices, create_channel, list_stories, get_story, create_story,
export_story_audio, list_project_templates, create_project, save_project, load_project,
import_script, list_plugins, plugin_status, plugins_scan, preview_plugin_chain, plugins_process,
list_scripting_functions, scripting_execute, spectrogram, noise_reduce, normalize_audio,
master_audio, separate_audio, run_recipe, play_gm_instrument, play_drum_machine,
models_download, models_load, models_unload, model_progress, model_cache_dir, cuda_status,
cuda_download.
Model commands are `models_download` / `models_load` / `models_unload` (+ `cuda_download` /
`cuda_status`) — there is NO `models_status` tool.
(Get the full tool catalog + signatures from `docs/knowledge/mcp-tools-extended.md` or
`mcp-server`'s own README. generate_music / generate_sound / list_sounds / arrange_music were
REMOVED with the ACE-Step / Bark / Pocket-TTS-EmoShift engines.)

## KEY GOTCHAS (document these in the relevant skills)
1. TWO effect paths: `run_recipe` applies ONLY deesser+spectral_denoise per segment + crossfade + master. The 10-effect chain (eq/compressor/reverb/etc.) is applied via `POST /effects/preview/{generation_id}` (assistant `apply_effects`) — a SEPARATE call. To actually get EQ/compressor on a clip, apply the effects_chain BEFORE run_recipe.
2. "10"/"11"/"17 TTS engines" in old docs is WRONG — there are 13 today (see engines above); qwen/qwen_custom_voice/step_audio_editx/pocket_emo/luxtts/chatterbox/tada/piper/xtts_v2 are removed.
3. GM program is 0-based (0 = piano).
4. Kokoro has NO zero-shot cloning; only preset blending + custom .pt packs.
5. `engine_has_model_sizes()` is True only where an engine has >1 model config (kokoro, styletts2, f5_tts, pocket_tts, neutts_2e, orpheus) — pass `model_size` for those; otherwise `model_size` is ignored.
6. Server must run with `PYTHONPATH=<repo root>`; MCP mounted at `/mcp`.
7. POST /models/download uses `progress_callback=` (not `callback=`); downloads run on a dedicated executor; status shows "downloading" only while active.
8. Virtual instruments / GM require a SoundFont file present or they 501.
9. Cloned profiles (`voice_type:"cloned"`) can only use CLONING_ENGINES (fish_speech, zonos, styletts2, f5_tts, pocket_tts). Engines outside that set (neutts, neutts_2e, moss_tts_nano, parler_tts, kitten_tts, chattts, kokoro, orpheus) must be routed via `engine=` in `POST /generate`, never as a cloned profile.
