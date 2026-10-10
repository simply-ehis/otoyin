PURPOSE: Local takes pipeline (words + speakers + YAMNet events) emitting video-use-compatible Scribe JSON + packs, with highlight extraction and auto-chapters.
OWNS: takes pipeline slices 1-7 (diarization merge, YAMNet backend, Scribe-JSON export, pack UI, interop proof, highlights, chapters).
READ-WHEN: working on transcripts, diarization, audio events, capture packs, or video-use interop; before touching Word schema, YAMNet backend, or pack format.
KEY-FILES: backend/services/diarization.py (word merge), backend/backends/yamnet_onnx_backend.py (events), backend/services/scribe_json.py (normalizer), backend/services/captures.py (auto-pack), app/src/features/captures/CapturesTab + app/src/lib/transcript/ (UI).
INVARIANTS: local-only (no cloud/STT keys); per capture scope; pack never enters otoyin assistant context; YAMNet weights bundled (not downloaded); Scribe-shaped JSON stays byte-compatible with video-use pack_transcripts.py assumptions.
GOTCHAS: faster-whisper words are milliseconds (Scribe wants seconds); packer needs speaker_N IDs (renderer strips prefix); YAMNet frames are 0.48s-hop (coarser than words); *.onnx is gitignored → build-time fetch, never commit weights.
UPDATED: 2026-09-23

# Takes Pipeline — Local, video-use-compatible (7 slices)

## Goal
Every transcribed capture produces (a) Scribe-shaped JSON (`words[]` with word/spacing/audio_event types + `speaker_N` IDs) that video-use's `pack_transcripts.py` consumes unchanged, and (b) a ~12KB packed markdown reading view with copy/download. All local: faster-whisper/parakeet words, Resemblyzer speakers, YAMNet-ONNX events (bundled ~16MB model). Plus highlight extraction and auto-chapters reusing the event stream.

## Decisions (locked 2026-09-23)
- Local only — no Scribe/cloud/BYOK. Per capture scope. Pack is user-facing + export, never assistant context.
- Events: YAMNet-ONNX `audiomagic/yamnet-onnx` (16MB, Apache-2.0, verified provenance + numerical reference vectors). CLAP stays the open-vocabulary upgrade path.
- **yamnet = bundled model**: weights ship in the installer (PyInstaller `--add-data`, Tauri sidecar resources), resolved frozen-aware with dev fallback. Never committed (`*.onnx` gitignored) — fetched at build time if absent, like Silero weights.

## Interop contract (from video-use source)
- `<stem>.json`: `words[]` `{text, start, end, type, speaker_id}`, seconds, monotonic, sorted.
- Spacing entries synthesized from gaps (their packer reads both).
- `speaker_0` style IDs; bare event text (`laughter` — packer parenthesizes).
- Cache-if-exists; silence pre-check (peak < −60dBFS → clean skip).
- Pack markdown: `# Packed transcripts`, `## <stem> (duration, N phrases)`, `  [002.52-005.36] S0 text`, phrases break on silence ≥0.5s or speaker change.

## Slices
Status 2026-09-23: all slices implemented and green (backend pytest + vitest + tsc + biome + ruff). YAMNet weights bundled via `build_binary.py` --add-data; proven on next exe build.
1. **Word-level speaker merge** (`services/diarization.py` + tests): `align_words_to_speakers`, nearest-turn inheritance, straddle/gap/single-speaker cases.
2. **YAMNet backend** (`backends/yamnet_onnx_backend.py` + ModelConfig): ORT session, 16kHz mono, class-map CSV, per-class thresholds, `audio_event` tokens at frame starts. Proofs: README parity vectors, fixture takes, threshold pass.
3. **Scribe-JSON export** (`services/scribe_json.py`, `services/captures.py`, GET endpoint, migration for word persistence): normalize ms→s, synthesize spacing, attach speakers/events, write `<id>.words.json`, silence pre-check, cache-if-exists. Contract test + golden fixture.
4. **Pack view + export** (CapturesTab, transcript lib): exact markdown render, Copy + Download, i18n under transcript namespaces. Component test. No size cap — the full take always renders.
5. **Interop proof** (tests only): replicate their grouping rules against our JSON; identical phrase structure vs Scribe equivalent.
6. **Highlight extraction**: top event-moment clips (laughter/applause peaks ± padding) as exportable selects; reuses event stream, no new model.
7. **Auto-chapters**: segment long recordings on music/silence/applause boundaries; chapter list export; reuses event stream + VAD.

## Deferred
- CLAP open-vocabulary events; Scribe/cloud; assistant-context injection; realtime paths; video-use→otoyin MCP direction.

## Risks
- Turn-level diarization errors propagate to words (ok for reading view).
- YAMNet thresholds need real-take tuning; laughter-during-speech is the hard case.
- Pack markdown is uncapped by decision (no truncation).
