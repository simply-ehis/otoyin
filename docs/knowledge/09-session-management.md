# 09 — Session Management

## StandaloneProjectPage at `/projects`
- **Component:** `StandaloneProjectPage` in `app/src/components/StandaloneProject/StandaloneProjectPage.tsx`
- **What:** Create, save, load, and manage standalone projects. Template selector, project metadata fields, script import.

## Create/Save/Load Workflow
- **Create:** Fill name, description, FPS (default 24), sample rate (default 48000), select template → click "Create Project"
- **Save:** Serializes project to JSON via `POST /project/save` with full project state
- **Load:** Opens existing projects from saved JSON via `POST /project/load`

## Project Templates
- **Blank:** Start from scratch
- **Dialogue:** Two-character dialogue scene
- **Podcast:** Single-host podcast structure
- **Audiobook:** Narrator with character voices
- **Short Film:** Multi-scene film structure

## Script Import
- **Format selector:** Plain text or Fountain (screenplay format)
- **Plain:** Paragraphs become dialogue lines in a single scene
- **Fountain:** `=== Scene Heading` creates scenes, ALL CAPS = character names
- **API:** `POST /project/import-script`

## .dstf Format (Backend)
- **What:** otoyin Timeline Format — JSON file with clips, effects, mixer, profiles, audio plan
- **Where:** `backend/services/session.py`
- **Fields:** version, name, created_at, updated_at, fps, sample_rate, clips, mixer_tracks, mixer_buses, master_volume, audio_plan_json, markers
- **Save API:** `POST /session/save`
- **Load API:** `POST /session/load`

## Agent Callable
- **MCP Tools:** `21labs.session_save`, `21labs.session_load`, `21labs.create_project`, `21labs.save_project`, `21labs.load_project`, `21labs.import_script`, `21labs.list_project_templates`
- **REST Endpoints:** `POST /session/save`, `POST /session/load`, `POST /project/create`, `POST /project/save`, `POST /project/load`, `POST /project/import-script`, `GET /project/templates`
- **Key Backend Files:** `backend/services/session.py`, `backend/routes/standalone.py`, `backend/routes/features.py`
- **Key Frontend Files:** `app/src/components/StandaloneProject/StandaloneProjectPage.tsx`
