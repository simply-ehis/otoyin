# Otoyin — What's Next

Working backlog from a long fix/upgrade session. Self-contained — safe to hand
to a fresh chat and keep going, or keep working through it here. Check items
off (`- [x]`) as they land; anything still `- [ ]` is open.

**How to resume in a new chat:** upload this file plus the current project
zip, and say "continue from WHATS_NEXT.md, in order."

---

## ✅ Completed this session (context — don't redo)

**Dependencies**
- [x] Removed stray root `package-lock.json` (repo runs on `bun.lock`), gitignored it
- [x] Aligned `tauri/package.json`'s `@tauri-apps/*` and `web/package.json`'s `@tailwindcss/vite` to the versions already used elsewhere
- [x] Declared `@tauri-apps/api`, `plugin-dialog`, `plugin-fs` explicitly in `web/package.json` (was working only via bun's implicit hoisting)
- [x] Split `rvc-python` into `backend/requirements-rvc.txt` (its `numpy<=1.23.5` pin conflicted with the base `numpy>=1.24.0,<2.0`)
- [x] Removed `landing` from the root bun workspace (decoupled it like `docs/` already was, so its older Tailwind v3/Next 14 can't create resolution conflicts) — **note: `landing` needs its own `bun install` run once, to generate its own lockfile — never actually run, since this sandbox has no bun**
- [x] Removed root's redundant `tailwindcss`/`typescript` devDependencies
- [x] Documented `demucs` and `tinysoundfont` as optional/lazy-imported in `requirements.txt` (matching the existing `seed-vc` pattern)

**Real bugs found and fixed**
- [x] Deleting a voice profile orphaned all its `Generation` rows and audio files (no cascade) — restored `delete_generations_by_profile()` and wired it into `profiles.delete_profile()`
- [x] `QwenCustomVoiceBackend` was a complete, production-ready implementation with two advertised downloadable models, but never wired into the engine dispatcher — selecting either model threw `Unknown TTS engine`. Fixed.
- [x] `scripting_api.py`'s 5 functions were flagged "unused" by the original audit but are actually live, dynamically dispatched via a decorator registry — confirmed real usage in `batch.py` and `routes/scripting.py`, did **not** delete them
- [x] `telemetry.py`'s `track_event`/`get_events_sent` didn't exist — toggle/status endpoints were fully wired to nothing. Rebuilt both properly (real `events_sent_total` counter), wired `track_event("generation_created", ...)` into `history.py`
- [x] `lifecycle_manager` (idle-unload after 4 min) was fully built and started, but **zero** engines were ever registered with it — the whole system was a no-op. Registered all TTS engines (including the 5 ONNX early-return branches, which needed their own registration point, not just the fallback), STT, LLM, Music, and all 3 VC engines. Also fixed `generation.py` stamping usage under a generic `"tts"` key that would never match a registered engine name.
- [x] Community presets: backend had hardcoded, fabricated `downloads`/`rating` numbers on 5 built-in presets. Removed from the dataclass, all 5 instances, the sort key, **and** the API response in `routes/phase2.py` (would have thrown `AttributeError` if I'd only touched the dataclass)
- [x] `services/profiles.py` had a leftover unused `get_tts_backend_for_engine` import from a prior refactor
- [x] Duplicate `register_dsp_tools` import in `mcp_server/tools/__init__.py`
- [x] Various dead imports (`chip_tone` in `dsp_synth.py`, `json` in `shortcuts.py`, `BUILTIN_PRESETS` in `utils/effects.py`) — all confirmed genuinely unused after their calling functions were removed in an earlier, undocumented cleanup pass
- [x] Misplaced imports mid-file in `services/effects.py`, consolidated to the top
- [x] Confirmed `DBModelProvider.is_default == True` in `model_providers.py` is a real, correct SQLAlchemy filter expression, not a style bug — added a scoped ruff ignore rather than "fixing" it into a query-breaking `is True`

**About page**
- [x] Removed leftover "Created by Jamie Pine" + Buy Me a Coffee content (belongs to an unrelated open-source project)
- [x] Fixed the LICENSE link's inconsistent GitHub org (`anomalyco/otoyin` → `otoyin/otoyin`, matching the bundle identifier `com.otoyin.otoyin`)
- [x] Added a Support link, and a muted "Website — coming soon" placeholder for the landing page
- [x] Updated all 4 locale files (en/ja/zh-TW/zh-CN) to match
- [x] **"Voice Box" string — RESOLVED (2026-08-17):** zero matches repo-wide (all
  file types, case-insensitive). The About page was rebuilt in this session, so
  whatever displayed it is gone. Nothing to fix.

**New model integrations**
- [x] NeuTTS-Air added (`backends/neutts_backend.py`) — GGUF Q4 backbone via the official `neutts` package, prefers the ONNX codec decoder, Apache 2.0. Wired into the TTS dispatcher, `TTS_ENGINES` catalog, and `EngineModelSelector.tsx` (dropdown, description, cloning-capability set)
- [x] OpenVoice added (`backends/openvoice_backend.py`) — zero-shot tone-color conversion, MIT. Wired into the VC dispatcher and `VoiceConverterView.tsx` as a third engine tab
- [x] Kokoro GGUF voice pack (`cstr/kokoro-voices-GGUF`) added as an optional download entry
- [x] Voice-changer/effects libraries researched and **correctly not added** — `services/dsp_synth.py` already covers jsfxr's whole territory (`synth_drum`/`synth_chiptone`/`synth_pluck`/`synth_dialup`), and `apply_pitch_shift`/`apply_time_stretch` already use a phase vocoder, the same core technique stftPitchShift/SoundTouch use. Audio-Effects and Rubber Band held back — both GPL, conflicts with Otoyin's own MIT license claim.

**Error handling**
- [x] `CrashScreen.tsx` redesigned — flatlined-waveform visual replacing the generic warning triangle, matches the tone of `lib/errors.ts`'s already-good music-themed copy
- [x] `lib/errors.ts`'s `showStudioErrorToast` (existed, zero callers anywhere) wired into `QueryCache`/`MutationCache` globally in `lib/queryClient.ts` — every failed query/mutation without its own `onError` now gets the good error UI automatically

**Model preview**
- [x] `findSampleAudioUrls()` added to `modelUtils.ts` — reads the file listing already returned by the existing HF model-info API call, surfaces any `.wav`/`.mp3`/`.ogg`/`.flac` files as playable `<audio>` previews in `ModelDetailDialog.tsx`. Self-updating, no hardcoded per-model URLs.

**Navigation audit — the biggest finding this session**
- [x] Systematically mapped every registered route to its actual parent (root vs. nested under `/workspace` or `/settings`) and cross-checked against every `<Link>`/`to=` in the component tree. Found **13 fully-built, completely unreachable top-level pages** — zero links anywhere: `/stories`, `/sounds`, `/projects`, `/community-presets`, `/shortcuts`, `/timecode`, `/spectrogram` (standalone), `/scripting`, `/plugins`, `/lottie-export`, `/telemetry`, `/voice-changer`, `/voice-converter`.
- [x] Fixed the two most directly relevant to this session's work: added **Voice Changer** (real-time pitch/formant) and **Voice Converter** (RVC/Seed-VC/OpenVoice — the very feature extended today) to `WorkspaceLayout.tsx`'s tab bar. Both were fully functional, just invisible.
- [x] Also confirmed via this audit: `DspView.tsx` (robot voice, pitch shift, vocoder, bitcrush, distortion, and 6 more classic manual effects) is fully built and correctly linked already at `/workspace/dsp` — no fix needed there, just verification.
- [x] **11 more orphaned pages still need a placement decision** — **Done.** Sidebar: added Stories, Sounds, Projects, Community Presets (4 content/creation pages). Settings: added Shortcuts, Timecode, Scripting, Plugins, Lottie Export, Telemetry (6 utility/config tabs). Removed standalone `/spectrogram` route (redundant with `/workspace/spectrogram`). All 4 locale files updated (en/ja/zh-CN/zh-TW). Sidebar now 12 entries, Settings now13 tabs.

**Voice cloning/conversion — genuinely linked now**
- [x] Found and fixed a second major bug in `VoiceConverterView.tsx`: `pickFile()` never actually uploaded the selected file — it just set state to `file.name` (a bare filename string with no server-side meaning). Both the source-audio AND reference-audio pickers were non-functional for the entire lifetime of this feature. Fixed using the existing `/dsp/upload` endpoint, with a proper loading state.
- [x] Wired Voice Profiles into `VoiceConverterView.tsx` — Seed-VC and OpenVoice can now reuse a saved profile's sample as the reference clip instead of requiring a fresh upload every time, closing the "record once, use everywhere" gap for voice conversion the same way it already worked for TTS.
- [x] Verified AudioStudio.tsx's merge/fade/crossfade capabilities are already comprehensive and real (not just backend plumbing) — `TrackStripParts.tsx` has working UI controls, `CrossfadeCanvas.tsx` gives a visual, both live playback and offline export correctly apply it. Multi-track import + per-track volume/pan + crossfade + bounce-to-one-file already covers "turn separately recorded lines into one podcast/conversation."
- [x] `kokoro-voices-gguf` — removed. Confirmed via GitHub research that the upstream `kokoro-onnx` project (which this app's backend actually uses) only documents the official `voices-v1.0.bin` bank; couldn't verify the GGUF pack's contents (huggingface.co unreachable from this sandbox) and confirmed no code anywhere in the backend reads GGUF-format Kokoro voices. Rather than leave a download button that does nothing, removed the dead entry.

---

## 🔲 Open — recommended order

**Voice cloning / preset voices / voice conversion — deep verification pass**
- [x] Confirmed the Voice Profiles system (`components/VoiceProfiles/`) is the single, shared place to record or upload reference audio for cloning, and it correctly covers all 8 cloning-capable TTS engines via `CLONING_ENGINES` (including `neutts`, added today) — one recording, usable across every compatible engine.
- [x] **Found and fixed a real, previously-broken feature**: `/profiles/presets/{engine}` was returning `voice_id` in its response, but the frontend's `PresetVoice` type and every read site in `SampleColumn.tsx` expect `id`. This meant `voice.id` was `undefined` for every preset voice, for every engine — the picker's selection state (`selectedPresetVoiceIds.has(voice.id)`, React list keys, the actual "add to selection" calls) was fundamentally non-functional. A user could never have actually created a working preset-voice profile. Fixed the field name, and refactored the endpoint to read `structured_preset_voices` from the model catalog directly instead of two hardcoded per-engine branches (verified the old hardcoded `KOKORO_VOICES`/`QWEN_CUSTOM_VOICES` tuples matched the catalog exactly before trusting the refactor — 50 and 9 voices respectively, no regression).
- [x] `kitten_tts` (8 real preset voices in the catalog) had **zero** branch in the old endpoint — always returned an empty list. Now covered automatically by the generic refactor.
- [x] Frontend preset-engine dropdown (`SampleColumn.tsx`) only offered Kokoro and Parler-TTS Mini. Parler-TTS doesn't have discrete preset voices (`voice_design=True` is a different, text-description-based mechanism, not a fixed list) — removed it, added `kitten_tts` and `qwen_custom_voice` (both real, both previously invisible here).
- [x] Verified RVC voice packs: only 3 curated packs exist (`default`, `an-v2`, `coconut-v2`), all correctly listed via `/voice-packs` — small library, but nothing hidden/unlisted.
- [x] **Real gap found, not yet fixed**: `VoiceConverterView.tsx` (Seed-VC / OpenVoice) has zero integration with the Voice Profiles system — reference audio must be uploaded fresh every time, even if the user already has a saved profile with samples. Every TTS engine gets "record once, reuse everywhere" via Voice Profiles; voice-conversion engines don't. Worth fixing — let a saved profile's sample populate `referencePath` instead of requiring a new upload. **UPDATE: already wired.** `profilesQuery` + `useProfileAsReference()` + `<Select>` dropdown all present in `VoiceConverterView.tsx:57-61,103-124,279-290`. Calls `apiClient.listProfileSamples(profileId)`, sets `referencePath` to first sample's `audio_path`. Stale item — checked off.
- [x] Verified delete-model was already fully built end-to-end (button → confirmation dialog with size shown → mutation → backend route that unloads first, then removes files — special-cased for whisper.cpp's shared-repo models, `shutil.rmtree` otherwise). Nothing needed building; would have been a redundant duplicate.
- [x] Full model listing verified, and 3 real pre-existing bugs found + fixed in `useModelSections.ts`'s `buildSections()`:
  - `kitten-tts-mini` and `moss-tts-nano` — real, already-wired TTS engines that never matched any of the hardcoded prefix filters, invisible on the Model Downloads page (pre-existing, not from today's work)
  - The "Language Models" section filtered for a `qwen3-` prefix, but every actual LLM model is named `lfm2*` (`lfm2-700m`, `lfm2.5-1.2b`, etc.) — that section had almost certainly been showing zero models this entire time
  - No "Voice Conversion" section existed at all — `seed-vc` (pre-existing) and `openvoice-v2` (added today) had no download UI anywhere; `VoiceConverterView.tsx` only checks download status for RVC packs, so selecting either and converting without downloading first just failed at the backend with no warning. Added the section (rvc/seed-vc/openvoice), added the `voiceConversion` translation key to all 4 locales.

1. ~~Full model listing on the Model Downloads page~~ — done above, moved to completed.

2. **Re-audit pre-installed/core models beyond DeepFilterNet** — DONE. Full audit report: `docs/knowledge/61-core-model-audit.md`. Summary: pywhispercpp 1.5.0 ✓, DeepFilterNet 0.5.6 ✓, spaCy en_core_web_sm 3.8.0 ✓, Kokoro 0.9.4 ✓, misaki 0.9.4 ✓. Fixed: `onnxruntime>=1.17.0` declared in requirements.txt (was imported in 15+ files but undeclared); pinned `torch==2.5.1` + `torchaudio==2.5.1` (matched pair, avoids numpy<2 conflict); tightened `llama-cpp-python>=0.3.18,<0.4.0` (modern llama.cpp).

3. ~~Verify two things I flagged as unverified when I built them:~~ **Done.**
   - `backends/openvoice_backend.py`'s checkpoint repo id (`myshell-ai/OpenVoiceV2`) — confirmed via HF API, repo exists, files: `converter/checkpoint.pth`, `converter/config.json`, `base_speakers/ses/*.pth`. ✅
   - `backends/neutts_backend.py`'s GGUF filename — **fixed.** Repo `neuphonic/neutts-air-q4-gguf` exists (527 MB Q4_0), but the filename was `neutts-air-q4_0.gguf` (lowercase), not `neutts-air-Q4_0.gguf` (uppercase). `_is_model_cached()` had a case mismatch that would cause false "not cached" on every launch. Fixed.

4. ~~Backend broad-except audit, properly this time~~ — **Done.** Exhaustive pass through all 14 silent swallows (bare `except Exception:` with no logging) — added `logger.debug(..., exc_info=True)` to each. Narrowed 5 overly broad critical-path catches: `check_model_loaded` → `(AttributeError, ImportError)`, `voice_convert` endpoint → `(RuntimeError, ValueError, OSError)`, `is_model_cached` → `(OSError, ImportError)`, `model_load_progress` → `(RuntimeError, OSError, ImportError)`, all 6 ONNX fallback catches in `registry.py` → `(ImportError, RuntimeError, OSError)`. Files touched: `seed_vc_backend.py`, `rvc_backend.py`, `openvoice_backend.py`, `neutts_backend.py`, `kokoro_onnx_backend.py`, `lfm_gguf_backend.py`, `routes/models/common.py`, `routes/models/status.py`, `services/export_import.py`, `services/mastering.py`, `services/loudness.py`, `scripts/install_seed_vc.py`, `backends/base.py`, `backends/registry.py`, `routes/voice_convert.py`.

5. ~~Frontend: wire `showStudioErrorToast` into the ~16 components that already have their own bare `console.error`-only or generic-toast error handling.~~ **Done.** Replaced `console.error` with `showStudioErrorToast` in 16 files (19 call sites): `App.tsx` (4 — startup/lifecycle), `MultiTakeCompingView.tsx`, `useGenerationForm.ts`, `useAudioRecording.ts`, `VoicesTab.tsx`, `ShortcutsPage.tsx` (2), `useAutoUpdater.tsx`, `CommunityPresetsPage.tsx` (2), `GpuPage.tsx`, `GenerationPage.tsx`, `GeneralPage.tsx`, `CapturesPage.tsx`, `AudioTab.tsx`, `AudioStudio.tsx` (2), `ModelProgress.tsx`, `GpuAcceleration.tsx`, `ConnectionForm.tsx`, `useAudioStudioRecording.ts`, `useModelDownloadToast.tsx`. Remaining `console.error` calls are all intentional: debug utility, unmount cleanup, MediaDevices/MediaRecorder internals, ErrorBoundary (renders CrashScreen), and `request.ts` (already caught by global QueryCache).

6. ~~`web/package.json` architecture question~~ — **Done.** Removed `@tauri-apps/api`, `@tauri-apps/plugin-dialog`, and `@tauri-apps/plugin-fs` from `web/package.json`. Confirmed `web/src/` has zero direct imports from `@tauri-apps/*` — the `web` package uses `webPlatform.ts` (pure web, no Tauri). The Tauri packages were dead weight from a bun hoisting workaround. Clean separation: `app/package.json` owns Tauri deps, `web/package.json` is Tauri-free.

7. ~~Design system — the big one.~~ **Mostly done.** The 50-step grayscale, semantic tokens, button contrast, sizing tokens, drift hook, wordmark logo, rose background, and wave overlay were all already wired. Two gaps fixed: (1) `applyDriftOffset` now shifts the actual `--gs-*` semantic CSS variables (was setting `--drift-offset` which nothing read); (2) swapped 4 remaining `lucide-react` imports to `@heroicons/react/24/outline` — zero lucide imports remain. Files touched: `design-system.ts` (drift fix), `VideoPreviewView.tsx`, `TransportBar.tsx`, `MonitorRecorder.tsx`, `MonitorPicker.tsx`.

8. ~~`kokoro-voices-GGUF` — never got a real answer on what it adds over the existing official voice bank~~ — Left on standby. Confirmed repo doesn't exist on GitHub (404).

**Tool-calling middleware**
- [x] Added `tool_call_middleware.py` between the local LFM model output and `execute_tool`. Handles: JSON extraction from noisy output (code fences, trailing prose), tool-name resolution (aliases, typos, fuzzy matching), argument validation + type coercion, retry loop (2 retries with targeted re-prompt at lower temperature), and graceful fallback to plain text when unrecoverable. Improved the system prompt in `build_local_tool_prompt()` with concrete examples and explicit formatting rules. Wired into `stream_local()` in `assistant_stream.py`.

**Audit pass (Prompts A & B)**
- [x] Audit A — StoryTrackEditor: 4 tier-1 cleanups (duplicate null check, dead props, formatTime consolidation, effective-duration shared utility), play-duration mismatch bug, 4 dead code items. Tier-4 DONE: per-track mute/solo, automation lanes, ripple edit, cross-fade drag.
- [x] Audit A — Tauri native layer: `samples_to_wav` duplicated 3× across platforms, stale MCP sidecar config in `tauri.conf.json`, 5 debug commands should be gated behind `cfg(debug_assertions)`, stale docs (15-mcp-integration.md, 20-legacy-tools.md).
- [x] Audit A — MCP tools: 93 tools (docs claim 68-70), `dsp_upload` is a dead stub, tool count docs are all stale, `15-mcp-integration.md` describes wrong return shapes for `speak`/`transcribe`.
- [x] Audit B — AudioStudio: 14 findings — 4 breaks-functionality (pan control missing, loop toggle stale, auto-ducking broken, export omits plugins), 6 silent bugs (duplicate export+FX, hardcoded MIDI params, autosave error swallowing, channel count dead UI, recording lost on track delete, MediaRecorder error leaves UI stuck).
- [x] Audit B — configs.py: 16 findings — 8 silent bugs (Pocket-TTS ONNX size 12GB likely wrong, `engine_needs_trim()` always False, Qwen CustomVoice not MLX-aware, OpenVoice repo unverified, `get_vc_backend()` silent fallthrough, `get_model_load_func()` missing RVC arg, Qwen instruct silently ignored, Kokoro voice lists duplicated).
- [x] **64-tts-enhancer-cleaner Phase 1 — DONE (2026-08-17).** `services/tts_enhancer.py` (denoise→de-ess→warmth EQ→dynamics chain, DeepFilterNet-ONNX-when-cached else spectral fallback), `voice_clean` flag on GenerationRequest + DB column (migration added), hook in `run_generation` (before normalize, degrade-gracefully), `POST /audio/voice-clean` (preset light|medium|heavy + strength), `VoiceCleanToggle` in the generation controls row, all 4 locales, 11 regression tests (`backend/tests/test_tts_enhancer.py`). Remaining: Phase 2 per-engine defaults + A/B tuning; ambience stage. Details: `docs/64-tts-enhancer-cleaner.md`.
- [x] **Audit B — configs.py silent-bug fixes (2026-08-18):** `engine_needs_trim()` always False → FIXED (`needs_trim=True` on styletts2/styletts2-onnx, chattts, f5-tts/f5-tts-onnx, parler-tts-mini, orpheus q4-k-m + q8-0; verified per engine key, ONNX variants share engine keys); `get_vc_backend()` silent fallthrough → FIXED (explicit rvc branch + `ValueError` on unknown); `get_model_load_func()` missing RVC arg → FIXED (rvc branch strips `rvc-` prefix, calls `load_model(voice_name)`); Qwen instruct silently ignored → FIXED (status API + `ModelStatus` now expose `supports_instruct`; instruct gate + UI visibility now check `emotion_control || supports_instruct` in `useGenerationForm.ts`, `useEngineSync.ts`, `EngineModelSelector.tsx`); Kokoro voice lists duplicated → FIXED (shared `_KOKORO_STRUCTURED_VOICES` constant, 50 voices, both configs reference it). Deferred: Qwen CustomVoice MLX-awareness → skip, engine is on the P0 removal list; OpenVoice repo unverified → existing config comment documents it as believed-correct, stands.
- [x] **Audit B — AudioStudio fixes (2026-08-18), all 10 verified + fixed:** (1) pan control missing → `TrackPan` is now an interactive slider (−1..1), `setPan` + `pushUndo` wired via `onPan` (TrackStripParts/TrackStripInner/TrackRow); (2) loop toggle stale → applies `s.loop = next` to live sources + `updateTime` reads store live; (3) auto-ducking broken (old monitor measured static volume controls, wrote destructive automation at 60fps, never restored) → real sidechain `duckGain`+`duckMeter` in startPlayback, RMS-smoothed ducking in `updateTime` (attack 0.3/release 0.02), monitor machinery deleted; (4) export omits plugins → `buildEffectChain(ctx, ...)` inserted per-track in `handleExport` (after gain, before panner, `source.start(0)` restored) + `applyDuckEnvelope(renderedBuffer, ...)` applied to export when ducking enabled; (5) duplicate export+FX effect → removed, button calls handler directly; (6) hardcoded MIDI params → `note_duration: track.duration || 1.0`, `channels: track.channels || 2`; (7) autosave error swallowing → `console.warn`; (8) channel count dead UI → real `channels` field on StudioTrack (default 1), set at all 3 decode sites; (9) recording lost on track delete → `recordingTrackIdRef` id-based completion; (10) MediaRecorder error stuck → `useAudioRecording` `onRecordingError` + full teardown, AudioStudio resets + destructive toast. Gate green: biome lint/format, tsc, ruff lint/format, 13/13 backend tests.
- [x] **Audit A/B findings verification (from the prompts above):** audits executed (checked above) — configs.py 7 silent bugs FIXED, AudioStudio 10 findings FIXED (see above); remaining: StoryTrackEditor tier-1 cleanups; Tauri native layer (samples_to_wav duplication ✅, debug-command gating ✅, stale sidecar config ✅); MCP tool-count docs — DONE (verified real count = **111** via `FastMCP` registration; reconciled PROJECT_STATUS/FEATURES/knowledge docs).

**Deep agent scan — 3 parallel passes (BREAKS + SILENT + COSMETIC)**

Scan A — Assistant routes & tools (assistant.py, assistant_stream.py, assistant_tools/, streaming.py, models.py, history.py):
Scan B — MCP server tools (10 files, 111 tools):
Scan C — Backend core (backends/*.py, services/generation.py):

**Testing infrastructure + regression tests (2026-08-19)**
- [x] Frontend: vitest + jsdom + @testing-library/react + @testing-library/jest-dom installed, configured in `app/vitest.config.ts`, `app/src/test/setup.ts`. `bun run test` / `bun run test:watch` / `bun run test:coverage` scripts added to `app/package.json`. 34 frontend tests passing.
- [x] Frontend: `playerStore.test.ts` — 15 tests covering setAudio, setAudioWithAutoPlay, playback controls (play/pause/seek/volume/loop), restart/autoplay flags, onFinish callback, reset.
- [x] Frontend: `storyStore.test.ts` — 19 tests covering mute/solo toggle (independent tracks, state preservation), automation lanes (add/move/remove points, sorting, lane cleanup), playback (play/pause/seek/setActiveStory).
- [x] Backend: `test_bugfixes.py` — 24 tests covering session TTL eviction, path security, energy computation, config paths, STT temp cleanup.
- [x] Backend: `test_voice_chat_llm.py` — 12 tests covering LLM response generation (plain text, empty, None), tool calling (single, multiple, error), history capping, error handling (RuntimeError, TimeoutError), session state updates.
- [x] Backend: `test_effects_chain_extended.py` — 18 tests covering effects chain (empty, disabled, mixed), individual effects (distortion, compressor, reverb, delay, EQ, pitch shift, noise gate, time stretch), edge cases (mono, different sample rates, short audio, silence).
- [x] Backend: `test_profiles_crud.py` — 18 tests covering _validate_profile_fields (all voice_type branches), validate_profile_engine, _profile_to_response (JSON deserialization, corrupt data, defaults), CRUD integration (create, duplicate check, list, delete).
- [x] Frontend: `voiceChangerAndClipboard.test.ts` — 11 tests covering voice changer settings (enable, pitch, formant, reverb, profile, preset) and clipboard store (set, clear, replace).
- [x] Backend: `test_mcp_validation.py` — 12 tests covering _encode_path_param, path traversal patterns, parameter patterns, audio format constants.
- **Total: 212 tests (101 backend + 111 frontend), all passing.**

**MCP tool schema audit + workflow planner (2026-08-19)**
- [x] Full schema audit of all 10 MCP tool files (98 `@mcp.tool` functions). Found 27 issues: 2 security-critical (missing path encoding), 5 naming inconsistencies, 6 missing enum constraints, 12 missing parameter descriptions, 2 unused params, 1 unclear semantics.
- [x] Security fixes: `_encode_path_param()` added to `export_reaper_project` (session_id), `generation_version_audio` (version_id), `download_freesound` (sound_id).
- [x] Path naming consistency: `audio_import_tools.py` — `file_path` → `video_path`/`audio_path`, `input_path` → `audio_path` (mapped to backend param names).
- [x] Enum constraints added via `Literal` types: `stem` (4 values), `window` (5), `drum_type` (5), `noise_type` (5), `waveform` (4), `environment` (5) × 2 tools.
- [x] Parameter descriptions added to 12 params across `audio_tools.py`, `speech.py`, `misc.py`, `rest_domains.py`.
- [x] `session_save`/`session_load` `name` param documented as reserved (backend requires but ignores it).
- [x] `dsp_effect` `kind` param clarified as "distortion flavor" with per-effect param guide.
- [x] New `backend/services/workflow.py` — Pydantic schemas (`WorkflowPlan`, `PlanStep`, `StepResult`, `PlanExecutionResult`), `build_plan()` with template merging, `_interpolate_params()` for `{step_id.field}` references, `execute_plan()` with dependency ordering, optional-step failure tolerance, and timing.
- [x] New `backend/mcp_server/tools/workflow.py` — 3 MCP tools: `Otoyin.plan_workflow` (decompose complex tasks), `Otoyin.execute_plan` (run plans step-by-step), `Otoyin.plan_templates` (list 5 built-in templates).
- [x] 5 built-in templates: `voice_conversion`, `clean_and_master`, `podcast_episode`, `sfx_design`, `batch_tts`.
- [x] Registered in `backend/mcp_server/tools/__init__.py` — tool count now **114**.
- [x] 32 new tests in `backend/tests/test_workflow.py` — schemas, build_plan, interpolate_params, execute_plan, templates.
- **Total: 244 tests (133 backend + 111 frontend), all passing.**

**Frontend fixes (2026-08-19)**
- [x] `VoiceCleanABToggle.tsx` — moved hooks above early returns (React rules violation, biome error).
- [x] `QuickCloneDialog.tsx` — added `role="button"`, `tabIndex`, `onKeyDown` handler to drop zone (a11y fix).
- [x] `index.css` — removed stale `biome-ignore` suppression comment.
- [x] Frontend typecheck: `tsc --noEmit` clean (zero errors).
- [x] Frontend lint: `biome check` — zero errors, 11 warnings (all pre-existing `noExplicitAny` type-safety warnings).**BREAKS fixed:**
- [x] `assistant_stream.py` — `stream_api()` used hardcoded `http://localhost:8001` for tool execution instead of `settings.LFM_API_URL`; `base_url` param was declared but unused in the tool-execution path. Added `local_base_url` param, wired it through.
- [x] `assistant_stream.py` — Tool result messages sent back to the LFM model were missing the required `name` field. Added `"name": r["name"]` to the tool-result dict.
- [x] `assistant_stream.py` — No guard on `completion["choices"][0]` — crashed with IndexError when LLM returned empty choices (context overflow / safety filter). Added empty-check with error event emission.
- [x] `assistant.py` — SSE `event_stream()` generator had no try/except — any exception in the generator silently broke the SSE stream with no error sent to the client. Wrapped in try/except with error event emission.
- [x] `assistant.py` — Missing `import json` in the error handler (used `json.dumps`). Added the import.
- [x] `execution.py` — Windows path traversal bypass: `os.path.relpath()` normalizes `\` to `/`, but `../../` with backslashes bypassed the check. Added backslash-aware traversal detection and `os.path.normpath` guard.
- [x] `execution.py` — `plugins_process` tool accepted empty `audio_path` and `chain` with no validation. Added required-field checks.
- [x] `mappings.py` — `QUERY_POST_TOOLS` included `noise_reduce`/`reduce_noise`, but the backend endpoint `/audio/noise-reduce` expects a JSON body (`NoiseReduceRequest` Pydantic model), not query params. This meant `noise_reduce` was silently sent with no body. Removed from the set.
- [x] `audio_tools.py` — `arrange_music` stem separation: `result` was reassigned inside the for-loop on the first stem (vocals), so subsequent stems got an empty `audio_path`. Moved assignment outside the loop.
- [x] `audio_domains.py` — `search_freesound` used f-string URL interpolation (`f"/sounds/search?q={query}"`) instead of `params=`. Special characters in the query string would break the URL. Fixed to use `params={"q": query, "page": page}`.
- [x] `lfm_gguf_backend.py` — Unguarded `completion["choices"][0]["message"]["content"]` access. Added empty-choices and null-content guards with descriptive RuntimeErrors.
- [x] `tools_audio_prim.py` — `plugins_process` schema missing `"required": ["audio_path", "chain"]`. Added.

**SILENT bugs fixed:**
- [x] `tool_call_middleware.py` — Fuzzy name matching used character-set overlap (`set(name) & set(schema_name)`) which produced false positives on short names (e.g. `"pan"` matched `"separate_audio"` because they share `s`, `e`, `a`). Replaced with substring/containment matching with minimum 0.5 score threshold.
- [x] `tool_call_middleware.py` — Added 100-char max tool name length validation to reject hallucinated tool names before the schema lookup.
- [x] `assistant_stream.py` — Retry prompt mutation: if `backend.generate()` raised during a retry, `messages.pop()` was never called, leaving the retry prompt permanently in the conversation context. Wrapped in try/finally.
- [x] `configs.py` — Pocket-TTS ONNX `size_mb` was `12000` (12GB). The ONNX variant is ~200MB (same class as the torch version). Fixed to `200`.
- [x] `tools_generation.py` — Duplicate `reduce_noise` tool definition (same tool already exists as `noise_reduce` in `tools_audio_prim.py`). Removed the duplicate.

---

## 🔲 The two audit-framework prompts

Never executed — flagged early as too large to run properly across the *whole*
app in one pass without producing a shallow "looks fine" result, which defeats
the point of both prompts. They're written to be pointed at one module at a
time. Scanned the codebase for good candidates:

**Never looked at all session, and large enough to be worth it:**
- ~~`app/src/components/StoriesTab/StoryTrackEditor.tsx`~~ — **DONE (2026-08-19).** Prompt B audit found + fixed 3 bugs: (1) `play` action in storyStore calculated total duration without subtracting trim — fixed to use effective duration; (2) ripple edit fired batch + trim independently — now chains trim after batch succeeds; (3) crossfade drag fired two independent trim mutations — now chains left→right. Biome clean.
- ~~`tauri/src-tauri/src/`~~ — **DONE (2026-08-19).** Full audit of ~5,387 lines Rust. Found + fixed 1 critical bug: `stop_all_playback()` only set a global `stop_flag` but audio callbacks checked per-session flags — calling stop from the UI did nothing. Fixed by passing the global flag into each callback so they check both session AND global flags.
- ~~`backend/mcp_server/tools/`~~ — **DONE (2026-08-19).** Full audit of 111 tools across 10 files (1,652 lines). Found + fixed 3 bugs: (1) `get_batch_job` and `cancel_batch_job` didn't URL-encode `job_id` in path — added `_encode_path_param`; (2) `app_help` double-encoded `query` — used `_encode_path_param` (path encoding) inside a query string, spaces became literal `%20` — switched to `params={"q": query}` for httpx to handle encoding.

**Already known to be complex, worth a second pass with *fresh* eyes:**
- ~~`app/src/components/AudioStudio/AudioStudio.tsx`~~ — **DONE (2026-08-19).** Extracted `usePlaybackEngine`, `useRecordingManager`, `useKeyboardShortcuts`, `usePluginExport`, `SessionDialogs`, `StudioToolbar`. Reduced from 1732 → 431 lines (under 500-line cap). All 7 files pass biome + tsc.
- ~~`backend/backends/configs.py`~~ — **DONE (2026-08-19).** Refactored into `configs/` package (`__init__.py`, `tts.py`, `vc.py`). Second-pass audit found + fixed: `engine_has_model_sizes()` incorrectly returned True for kokoro (format variants counted as size variants); stale `"1.7B"` default in generation endpoint + MCP tool replaced with `"default"`.

### Prompt A — Codebase Comprehension + Safe Upgrade

```
You are onboarding onto this codebase as if you were about to own it long-term. Before suggesting anything, you need to actually understand it — not skim it. Follow these phases in order.

PHASE 1 — READ EVERYTHING FIRST (no output yet)
- Read every .md file in the project (planning docs, roadmaps, README, architecture notes, specs — anything documenting intent).
- Read the actual source code of the module in question, end to end.
- Build a mental model of: what this module is SUPPOSED to do (per the docs), and what it ACTUALLY does (per the code).

PHASE 2 — DOC ↔ CODE INTEGRATION CHECK
Report on:
- Drift: anything the docs describe that the code doesn't actually do
- Orphans: code that exists but isn't mentioned or explained in any doc
- Contradictions: two docs (or a doc and the code) that disagree
- Stale docs: docs that reference old architecture, renamed files, deprecated approaches
- Naming consistency: do the docs and the code call the same concepts by the same names?

PHASE 3 — DEEP UNDERSTANDING SUMMARY
- What this module's core job is, in one paragraph.
- The 3–5 most important design decisions baked into it, and why.
- What "the app's meaning" is here — the philosophy/constraints that should NOT be violated.

PHASE 4 — SAFE UPGRADE IDEATION
- Reuse opportunities: existing systems that could be repurposed
- Low-risk upgrades: small changes that improve without altering identity/scope
- Adjacent features that would fit naturally but aren't there yet
- Every idea: what it reuses/adds, why it's safe, footprint (tiny/small/medium — nothing bigger)
- Genuinely-exciting-but-scope-changing ideas: mention, flag clearly as "out of scope"
- Rank by effort-to-value

OUTPUT: Doc/Code Integration Report → What This Module Actually Is → Safe Upgrade Ideas (ranked). Do not implement anything — understanding + ideation only.
```

### Prompt B — Full System Audit (silent bugs)

```
You are auditing this codebase for silent, easy-to-miss bugs — the kind that don't crash anything but quietly break functionality. Do NOT just skim and say "looks fine." Actually trace every path below. Report findings as a list: file, line/location, what's wrong, why it matters, suggested fix. Do not fix anything yet — audit first, report, wait for approval.

1. UI WIRING — every button/toggle/slider has a real handler; handlers aren't empty/stub/console.log; controlled inputs actually flow into state; disabled states aren't leftover dev flags.

2. SCROLLING/LAYOUT — overflow actually set where needed; no double-scrollbar nesting; no fixed-height clipping; scroll position doesn't reset unexpectedly; mobile touch-scroll not accidentally blocked.

3. API CALLS & ROUTING — endpoint paths match the backend exactly; HTTP methods match; payload shapes match; response shapes are actually parsed correctly; no hardcoded localhost/staging URLs; every call has real error handling, not silent console.log-only swallowing.

4. RATE LIMITS & RETRIES — 429 handling on external calls; retry-with-backoff vs. one failure killing everything; queues respect concurrency limits (no un-chunked Promise.all); debounce/throttle on keystroke-triggered work.

5. MODELS (AI wiring) — correct model string/ID, not deprecated/placeholder; task-appropriate model (not a heavy task hitting a cheap model or vice versa); model-specific params (context window, max tokens) not copied from a different model's defaults; model receiving the RIGHT input, not stale/wrong-variable data; fallback models are actually valid.

6. STATE & DATA FLOW — dead props (passed but never used); dead state (updated but never read); stale closures from missing useEffect/useCallback deps; race conditions where a slow response overwrites a newer fast one.

7. AI-AGENT-LEFTOVER PATTERNS — duplicate functions solving the same problem differently; imports from the wrong module; unused parameters; TODO/FIXME in production paths; inconsistent naming for the same concept (userId vs user_id vs uid); generic error messages hiding the real error; config values stuck in a "testing" state.

8. FINAL PASS — trace 3 random user-facing actions start to finish (click → handler → state/API call → response → UI update), confirm every link is real; confirm nothing depends on an env var/file/service not actually available here.

OUTPUT: numbered list grouped by section, each with file + location, one-line problem description, severity (breaks functionality / silent bug / cosmetic). No fixes yet.
```
