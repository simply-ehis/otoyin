# Feature-Exposure Audit — hidden features check

**Date:** 2026-09-03
**Prompt:** `otoyin-redesign-prompts/04-design-system-and-redesign.md` (feature-exposure section)
**Method:** cross-referenced `backend/data/app_features.json` (60 features, machine-readable, each with `where` + `tools`) against the restored component tree (`app/src/components/`) and the TanStack Router route table (`app/src/router.tsx`).

## Verdict

**No completely hidden features found.** All 60 manifest features have at least
one UI component, and every one of those components is reachable through the
router (70+ registered routes). The exposure problem is **discoverability**, not
absence: most features live inside the `Workspace` sub-navigation (27 dedicated
views) or nested settings pages, which a first-time user has no map of. That is
precisely what the redesign's navigation grouping (04), Audio Studio tool
layout (05), and onboarding (11) must solve — none of it requires building new
entry points from scratch.

## Feature → UI surface map (all 60)

| Feature (id) | Where the manifest says | UI surface (verified) |
|---|---|---|
| tts-engines | Models tab | `VoicesTab` · `ModelsTab` · `Generation` |
| voice-cloning | — | `VoiceProfiles` · `VoicesTab` |
| voice-profiles | — | `VoiceProfiles` |
| reference-voices | — | `VoicesTab` |
| emotion-presets | — | `Generation` |
| audio-tags | — | `CapturesTab` |
| rvc-conversion | — | `VoicesTab` · `VoiceProfiles` |
| byok-providers | — | `ServerSettings` (settings) |
| waveform-editor | Audio Studio | `AudioStudio` · `MainEditor` |
| pitch-map | Audio Studio | `AudioStudio` · Workspace `/pitch` |
| effects-chain | Audio Studio | `EffectsTab` · `Effects` · Workspace `/effects` |
| spectrogram | Audio Studio | `Spectrogram` · Workspace view |
| timecode | — | `TimecodeDisplay` · settings `/timecode` |
| ab-comparison | — | `ABComparison` |
| tape-scrubber | — | `TapeScrubber` |
| transcription-subtitles | — | `DubbingTab` · `CapturesTab` |
| transcript-edit | Audio Studio | `AudioStudio` · Workspace `/transcript-edit` |
| noise-reduction | — | `Effects` · Workspace `/noise-reduction` |
| audio-enhance | — | `Effects` · Workspace `/audio-enhance` |
| loudness-metering | — | `AudioStudio` · `Effects` |
| import | — | `Import` · Workspace |
| mixer | Audio Studio | Workspace `/mixer` · `AudioStudio` |
| auto-duck | Audio Studio | `AudioStudio` (mixer) |
| mastering | Audio Studio | `AudioStudio` (mixer) |
| platform-export | — | `Library` · Workspace `/export` |
| reaper-export | — | `Library` |
| lottie-export | — | `LottieExport` · settings `/lottie-export` |
| stories | — | `StoriesTab` |
| conversation-mode | — | `StoriesTab` · Workspace `/conversation` |
| adr-mode | — | `StoriesTab` · Workspace `/adr` |
| comping | — | `AudioStudio` · Workspace `/comping` |
| audio-plan | — | Workspace `/audio-plan` |
| batch-queue | — | `Library` · Workspace `/batch` |
| content-recipes | — | `Help` · `Assistant` · `StoriesTab` |
| voice-changer | — | `VoiceChat` · Workspace `/voice-changer` |
| voice-chat | — | `VoiceChat` |
| dictate | — | `VoiceChat` · `CapturePill` |
| streaming-stt | — | `VoiceChat` |
| music-generation | — | `VoicesTab` · `Store` |
| sfx-generation | — | `VoicesTab` · `Store` · Workspace `/sounds` |
| bark-nonverbals | — | `Generation` |
| gm-instruments | — | `AudioStudio` · Workspace `/instruments` |
| drum-machine | — | `AudioStudio` · `ChordPicker` |
| dsp-synth | — | Workspace `/dsp` |
| freesound-browser | — | `Library` · `Import` |
| binaural | — | `AudioStudio` · `Effects` · Workspace `/spatial` |
| doppler | — | `AudioStudio` · Workspace `/spatial` |
| convolution-reverb | — | `AudioStudio` · `Effects` |
| assistant | — | `Assistant` |
| mcp-server | — | settings `/mcp` · `Assistant` |
| scripting | — | settings `/scripting` |
| automation-lanes | — | Workspace `/automation` |
| agent-skills | — | settings + `Assistant` (prompt 11 builds the browser UI) |
| model-manager | Models tab | `ModelsTab` · settings `/models` |
| shortcuts | — | settings `/shortcuts` (prompt 11 surfaces it) |
| projects | — | `Workspace` · `StandaloneProject` |
| cross-tab-bus | — | `CapturePill` · `AudioPlayer` |
| community-presets | — | `CommunityPresets` |
| telemetry | — | settings `/telemetry` |
| non-destructive | — | `AudioStudio` · `History` |

## Notes

- **Manifest accuracy:** `app_features.json` is real and current (version 1,
  60 features, per-feature `where`/`tools`/`keywords`). The `where` fields are
  sparse but the `tools` list maps 1:1 to MCP/assistant tool names — it can
  drive the in-app help search (prompt 11) as-is.
- **Discovery gap examples:** 27 Workspace views exist with no single map;
  `bark-nonverbals`, `timecode`, `lottie-export`, `telemetry` live in settings
  sub-pages; `reference-voices` has no dedicated surface (it's inside
  `VoicesTab`). These are candidates for the redesign's navigation grouping,
  not new builds.
- **Frontend restore note:** components were restored from
  `archive/frontend-components/` (gitignored) into `app/src/components/`
  during this pass — they must be committed or the app loses its UI.

## Recommended redesign actions (feeds 04 navigation + 05 + 11)

1. Give the Workspace a landing view that maps all 27 views by category
   (edit / mix / spatial / dialogue / export), instead of a bare submenu.
2. Group sidebar sections by job-to-be-done (Generate → Edit → Mix → Ship),
   matching the manifest categories.
3. Surface `reference-voices` from within VoicesTab as its own section.
4. Use `app_features.json` as the source for onboarding "what can I do here?"
   and in-app help search.