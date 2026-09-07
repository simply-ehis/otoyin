# Privacy Policy

PURPOSE: User-facing privacy policy for otoyin — explains what data is stored locally, what leaves the device, and user rights.
OWNS: backend/routes/privacy.py
READ-WHEN: User asks about privacy, data export, or data deletion
KEY-FILES: backend/routes/privacy.py, backend/database/models.py, backend/services/telemetry.py, backend/services/crash_reports.py
INVARIANTS: All core data stays on-device; telemetry/crash reports are opt-in and anonymous; no account system exists.
GOTCHAS: Telemetry endpoint URL changed from 21labs.app to otoyin.app — check before updating.
UPDATED: 2026-09-07

**Last updated:** 2026-09-07

## What We Store

Otoyin runs entirely on your device. All data below is stored in a local SQLite database (`data/otoyin.db`) and audio files in `data/audio/`. No data is uploaded unless you explicitly opt in.

### Voice Profiles
- Profile name, description, language, voice type
- Reference audio files (for cloned voices)
- Voice attributes, personality prompts, effects chains

### Generations
- Text input, generated audio files, generation settings
- Engine/model used, duration, seed, status
- Favorited flag, origin (manual/personality/bulk)

### Stories & Projects
- Story text, chapter structure, edit snapshots
- Project metadata, associated generations

### Audio Files
- Generated speech, imported audio, recordings
- Captures, mixed audio, exported files

### Settings
- UI preferences, keyboard shortcuts, effect presets
- Audio channel configuration, device mappings
- Performance settings, MCP client bindings

### Telemetry (Opt-in Only)
- Anonymous usage events (if enabled)
- Local JSONL log (`data/telemetry.jsonl`)
- No personal identifiers collected

### Crash Reports (Opt-in Only)
- Stack traces with PII redacted (emails, API keys, paths)
- Local JSONL log (`data/crash_reports.jsonl`)
- Sent only if `OTOYIN_CRASH_URL` is configured

## What Never Leaves Your Device

- Voice profile audio files
- Generated speech audio
- Text inputs (unless part of an opt-in crash report, redacted)
- Database contents
- Audio files
- Settings and preferences

## Your Rights

### Export Your Data
Use `POST /v1/privacy/export` to download a ZIP archive containing:
- All database tables as JSON
- All audio files referenced by the database
- A manifest.json with metadata

### Delete Your Data
Use `POST /v1/privacy/delete` to permanently remove:
- All voice profiles and their samples
- All generations and their audio
- All stories, projects, and associated data
- All audio files from `data/audio/`
- Telemetry and crash report logs

This action is irreversible. A confirmation token is required.

### Opt Out of Telemetry
Telemetry is disabled by default. If enabled, disable it via:
- UI: Settings > Privacy > Toggle telemetry off
- API: `POST /v1/settings` with `{"telemetry_enabled": false}`

### Opt Out of Crash Reporting
Crash reporting is disabled by default. If enabled, disable it via:
- UI: Settings > Privacy > Toggle crash reporting off
- API: `POST /v1/settings` with `{"crash_reporting_enabled": false}`

## Third-Party Services

Otoyin integrates with optional third-party services for model downloads:
- Hugging Face (model weights, gated repos)
- Each service has its own privacy policy

These are only contacted when you download a model. No personal data is shared with them beyond what's required for the download.

## Children's Privacy

Otoyin is not directed at children under 13. We do not knowingly collect data from children.

## Changes to This Policy

We will update this policy as needed. The "Last updated" date at the top will reflect the most recent changes.

## Contact

For privacy questions, open an issue at https://github.com/anomalyco/otoyin/issues
