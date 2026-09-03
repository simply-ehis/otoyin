# 66 — Video Dubbing Pipeline

> PURPOSE: How otoyin dubbing works end-to-end — transcribe, translate, re-voice, mux.
> OWNS: backend/services/dubbing.py, backend/routes/dubbing.py, backend/mcp_server/tools/dubbing_tools.py
> READ-WHEN: dubbing a video, troubleshooting dubbing failures, integrating dubbing into recipes
> KEY-FILES: backend/services/dubbing.py (pipeline), backend/routes/dubbing.py (REST), backend/mcp_server/tools/dubbing_tools.py (MCP tools)
> INVARIANTS: dubbing runs async via BackgroundTasks; status polled via job ID; target language must be in supported list
> GOTCHAS: re-voice step requires a loaded TTS model; mux step requires ffmpeg on PATH
> UPDATED: 2026-08-21

## Overview

The dubbing pipeline replaces spoken dialogue in a video with translated speech in
another language, preserving the original video and timing.

## Pipeline steps

1. **Transcribe** — Extract audio from video, run STT to get word-level transcript with timestamps
2. **Translate** — Translate transcript segments to target language via local LLM
3. **Re-voice** — Generate new speech for each translated segment using TTS
4. **Mux** — Replace audio track in original video with dubbed audio, preserving video

## MCP tools

| Tool | Description |
|---|---|
| `21labs.dub_video` | Start a dubbing job (video_path, target_language, voice, engine) |
| `21labs.dub_status` | Check dubbing job status (job_id) |
| `21labs.dub_cancel` | Cancel a running dubbing job |
| `21labs.dub_download` | Download the dubbed video (returns path/base64) |
| `21labs.dub_preview` | Preview transcription without translating |
| `21labs.dub_languages` | List supported target languages |

## REST endpoints

| Endpoint | Method | Description |
|---|---|---|
| `POST /dubbing/dub` | POST | Start dubbing job |
| `GET /dubbing/status/{job_id}` | GET | Get job status |
| `POST /dubbing/cancel/{job_id}` | POST | Cancel job |
| `GET /dubbing/download/{job_id}` | GET | Download dubbed video |
| `POST /dubbing/preview` | POST | Preview transcription |
| `GET /dubbing/languages` | GET | List target languages |

## Agent callable

```python
# Start dubbing
result = mcp.call("21labs.dub_video", video_path="/path/to/video.mp4", target_language="es", engine="kokoro")

# Check status
status = mcp.call("21labs.dub_status", job_id=result["job_id"])

# Download when complete
video = mcp.call("21labs.dub_download", job_id=result["job_id"])
```

## Limitations

- Target language list depends on loaded TTS engine capabilities
- Long videos (>30 min) may take significant time for re-voice step
- Mux step requires ffmpeg installed on the system
- Background music/SFX are not preserved (only dialogue is re-voiced)
