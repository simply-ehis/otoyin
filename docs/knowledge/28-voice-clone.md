# 28 — Voice Cloning

PURPOSE: One-click voice clone workflow: upload audio → extract voice profile → use immediately.
OWNS: Voice clone creation, QuickCloneDialog, voice profile cloning backends.
READ-WHEN: You touch voice profiles, clone dialogs, or the clone pipeline.
KEY-FILES: app/src/components/VoiceProfiles/QuickCloneDialog.tsx, backend/routes/profiles.py, backend/services/voice_clone.py, backend/routes/voice_clone.py
INVARIANTS: Clone requires 5–60s of clear speech; auto-transcribes reference text; auto-detects best engine.
GOTCHAS: QuickCloneDialog handles upload → backend → profile creation in a single flow. Engine selection is automatic based on available models (Fish Speech > Seed-VC > RVC).
UPDATED: 2026-08-21

## Agent Callable

| Feature | MCP Tool | REST Endpoint | Key Files |
|---------|----------|---------------|-----------|
| Quick clone | `21labs.quick_clone` | `POST /voice-clone/quick` | `backend/routes/voice_clone.py` |
| Clone status | `21labs.clone_status` | `GET /voice-clone/status/{id}` | `backend/routes/voice_clone.py` |
| List clone engines | `21labs.list_clone_engines` | `GET /voice-clone/engines` | `backend/routes/voice_clone.py` |
| Auto-transcribe | `21labs.auto_transcribe` | `POST /voice-clone/auto-transcribe` | `backend/routes/voice_clone.py` |

## How It Works

### One-Click Clone Flow
1. User opens QuickCloneDialog from VoiceProfiles tab
2. Uploads 5–60 seconds of clear speech (or records inline)
3. Backend auto-transcribes the reference text using Whisper
4. Backend auto-detects best available cloning engine (Fish Speech → Seed-VC → RVC)
5. Creates voice profile with extracted embedding
6. Profile is immediately available for TTS generation

### Engine Selection
The system automatically picks the best engine based on what's loaded:

| Engine | Quality | Speed | When Selected |
|--------|---------|-------|---------------|
| Fish Speech | ★★★★★ | Medium | When model loaded, best quality |
| Seed-VC | ★★★★ | Fast | When Fish Speech unavailable |
| RVC v2 | ★★★ | Fast | Fallback — always available |

### Reference Text Auto-Fill
- Whisper transcribes the uploaded audio in background
- Pre-fills the reference text field so user doesn't have to type
- User can edit before committing

### Audio Preview
- Play/pause button lets user hear uploaded audio before cloning
- Ensures correct audio was selected

## Frontend Components

| Component | File | Purpose |
|-----------|------|---------|
| `QuickCloneDialog` | `app/src/components/VoiceProfiles/QuickCloneDialog.tsx` | Main clone dialog |
| `ProfileList` | `app/src/components/VoiceProfiles/ProfileList.tsx` | List + clone button trigger |
| `ProfileInfoColumn` | `app/src/components/VoiceProfiles/ProfileInfoColumn.tsx` | Profile details display |

## Backend Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/voice-clone/quick` | POST | Create clone from audio + text |
| `/voice-clone/status/{id}` | GET | Check clone job status |
| `/voice-clone/engines` | GET | List available cloning engines |
| `/voice-clone/auto-transcribe` | POST | Transcribe uploaded audio |
