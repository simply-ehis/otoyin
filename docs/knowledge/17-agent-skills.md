# Agent Workflow Skills

otoyin exposes the same workflow playbooks to the in-app assistant and external MCP agents.
The machine-readable source is `backend/agents/manifest.py`.

## Discovery

- In-app assistant: call `list_skills` or `GET /assistant/skills`.
- MCP: call `21labs.list_skills`.
- Pass a short task description to rank the closest playbook.

## Included playbooks

| Skill | Use for | Completion shape |
|---|---|---|
| `voiceover` | Narration and single-speaker delivery | Render → measure → export |
| `podcast` | Multi-speaker episodes | Stage → duck/level → recipe → export |
| `audiobook` | Long-form chapters | Parse → cast → render → export |
| `clean-master` | Cleanup and final loudness | Process → measure → master |
| `adr` | Acted dialogue replacement | Guide → takes → score/select → align |
| `voice-design` | Local profile and cloning workflows | Reference → profile → quality check |
| `dubbing` | Video dubbing into a target language | Languages → dub job → poll → download |
| `transcribe` | Transcripts and subtitles | Transcribe → (diarize) → export subtitles |
| `batch` | Bulk TTS with per-item retry | Create job → poll → retry failures → fetch |

The catalog reports surface-specific tool names because the assistant and MCP use different
names for a few equivalent operations (`generate_speech`/`speak`, for example). Agents should
follow the tools returned for their own surface and verify output before declaring completion.
