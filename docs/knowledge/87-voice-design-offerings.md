# 87 — Voice Design Offerings (All-Model Menu)

PURPOSE: How the voice-design section shows every model's offerings plus grouped accent/nationality/style pickers.
OWNS: backend/services/profiles.py (get_voice_design_capabilities), app/src/features/voices/voiceDesignOptions.ts, app/src/features/voices/ModelOfferings.tsx, both VoiceDesignPanel copies
READ-WHEN: You touch voice design, accents, styles, or model capability display.
KEY-FILES: backend/services/profiles.py, app/src/features/voices/voiceDesignOptions.ts, app/src/features/voices/ModelOfferings.tsx, app/src/features/voices/VoiceDesignPanel.tsx, app/src/components/VoiceProfiles/VoiceDesignPanel.tsx
INVARIANTS: Backend stays backward compatible (engines/default/preview unchanged); frontend aggregates all_models; accent keys match _ACCENT_MAP.
GOTCHAS: Two VoiceDesignPanel copies exist (features/voices + components/VoiceProfiles) — both import the same shared options; update the shared file, not each copy's constants.
UPDATED: 2026-09-11

## Backend
`GET /profiles/voice-design-capabilities` returns `engines` (parler + neutts_2e), `accent_groups` (Americas/British Isles/Europe/Asia-Pacific/Africa & Middle East), `style_groups` (Narrative/Conversational/Expressive/Calm with help), and `all_models` — 14 TTS models with languages, preset counts + lists, clone/design/mixing/emotion/tags/instruct flags, quality scores.

## Frontend
- `voiceDesignOptions.ts`: single source for grouped accents/styles, flat ATTRIBUTE_OPTIONS/LABELS.
- `ModelOfferings.tsx`: collapsible "What each model offers" matrix (counts + per-model badges).
- Both panels: offerings on top, engine selector, grouped Accent (region headers) and Style (use-case help) pickers, free-text notes, live composed preview.

## Agent Callable
- **MCP Tools:** `21labs.list_profiles`
- **REST:** `GET /profiles/voice-design-capabilities`, `GET /profiles/preset-voices`
- **Key Files:** `backend/services/profiles.py`, `app/src/features/voices/voiceDesignOptions.ts`
