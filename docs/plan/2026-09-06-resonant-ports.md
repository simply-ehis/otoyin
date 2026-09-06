# Plan: Resonant Ports — Songwriter, Launcher, Instruments + Extras

> PURPOSE: Port 7 Resonant (AGPL-3.0, © 2026 Calesthio) slices into otoyin as native tabs on our backends, replacing ours where theirs is better.
> OWNS: product + eng. READ-WHEN: touching songwriter, launcher, instruments, vocal-qa, voice consent, acestep modes, or MIDI editing.
> KEY-FILES: `app/src/features/songwriter/`, `app/src/features/launcher/`, `backend/routes/song_drafts.py`, `backend/services/gm_instrument.py`, `app/src/router.tsx`, `app/src/features/workspace/nav.tsx`
> INVARIANTS: Logic ported verbatim with attribution headers; all UI rewritten on our primitives/tokens (no Resonant CSS); our backend stays where agents/headless need it; no new npm/pip deps without user approval.
> GOTCHAS: Resonant library/manager code is Electron IPC (`window.resonantDesktop.*`) — rebuild, don't port; their `.resonant` project format is NOT adopted; our ACE-Step takes no lyrics field yet; router.tsx has a parallel lane — additive edits only.
> UPDATED: 2026-09-06

Source: https://github.com/calesthio/Resonant (surveyed at depth-1 clone, 2026-09-06).
License: AGPL-3.0-only — compatible (otoyin is AGPL). Every ported file keeps
`Ported from Resonant © 2026 Calesthio, AGPL-3.0-only` + THIRD_PARTY_NOTICES entry.

## Replacement rule
Where theirs is better, ours goes; recolored to our visual language. Deliberately
NOT ported: their mixer (thinner than ours), arrangement view (duplicates stories +
launcher capture), audio dedupe (marginal arch churn).

## Phase 1 — Songwriter Studio (~1 session)
Pure-logic port: `songwriting/{core.ts,types.ts,registry.ts}` + 5 packs
(en, es-419, hi, ja-JP, ko-KR) → `app/src/features/songwriter/packs/`.
Zero new deps. UI rewritten on ScreenHeader/Tabs/Textarea (Song DNA + Lyrics & Craft).
Backend: `song_drafts` table (create_all covers new tables — no migration) + CRUD
routes `backend/routes/song_drafts.py` + tests. Client: `clientSongwriter.ts`
chained into ApiClient. Route `/songwriter` + nav entry. SEND TO ACE-STEP →
`POST /generate/music` with prompt composed from stylePrompt + hook + lyric excerpt.
STAGED: zh-CN pack needs `pinyin-pro` (new dep — user approval pending).

## Phase 2 — Clip launcher (~2–3 sessions)
Port pure-WebAudio `LiveEngine.ts` → `features/launcher/engine.ts`, decoding our
library/generation URLs (not their content-addressed assets). Slots/scenes layout
in a backend table (shared across Tauri windows). Grid + scenes + transport UI in
their interaction design, our tokens. Capture writes into our Stories API
(launching becomes a front door to stories). v1-OUT: MIDI note editing (Phase 4),
their arrangement view.

## Phase 3 — Instruments replacement (~2 sessions)
3a: port `domain/instruments.ts` (types + chooseZone) + `audio/instrumentPlayback.ts`
verbatim. Needs `spessasynth_core` npm dep (user approval pending).
3b: library REBUILT on our stack — `instrument_packs` table + endpoints (download
GeneralUser GS, upload-import SF2/SF3/SFZ/samples, list/remove, serve bytes) +
our-primitives UI. WebAudioFont catalog search needs net; cached after install,
degrades gracefully offline.
3c: Studio instruments panel goes realtime (keyboard/pads + velocity + picker).
Drum machine + procedural stay. Backend GM render (`gm_instrument.py`, routes,
MCP tools) demoted to fallback/MCP-only, clearly marked.

## Phase 4 — Extras (~2 sessions)
- Vocal QA: `POST /audio/vocal-qa` (faster-whisper → WER/coverage/missing-words
  vs lyrics) + check button on story items.
- Consent gate: mandatory rights checkbox + source/reference hashes + provenance
  log on voice conversion (backend field + UI).
- ACE-Step modes: cover / repaint-section / reference-audio in `acestep_backend`
  + `POST /generate/music` params + UI modes.
- MIDI editing: step-sequencer note editor on launcher clips using our GM sounds.

## Verification (every phase)
pytest + ruff · tsc + biome · scripts/check-wiring.py · `just dev` smoke
(generate → launch → story). No placeholders (`check_placeholders.py` clean).

## Approvals log
- [x] Slices: songwriter + launcher + instruments-replace + all 4 extras
- [ ] `spessasynth_core` npm dep (Phase 3a)
- [ ] `pinyin-pro` npm dep for zh-CN pack (Phase 1 staged)
- [ ] Order: 1→2→3→4 (default unless re-sequenced)
