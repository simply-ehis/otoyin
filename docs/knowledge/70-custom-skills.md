# Custom Agent Skills

> **PURPOSE** — How users create, manage, and use custom workflow skills for the AI assistant.
> **OWNS** — The custom skill system (backend + frontend).
> **READ-WHEN** — Building custom workflows, extending the assistant, or debugging skill discovery.

## What are custom skills?

Custom skills are user-created workflow playbooks that teach the AI assistant how to perform domain-specific tasks. They extend the 9 built-in skills (voiceover, podcast, audiobook, etc.) with your own procedures.

A skill defines:
- **Triggers** — keywords that activate this skill when the assistant detects a matching task
- **Steps** — the ordered procedure the assistant should follow
- **Tools** — which backend tools the assistant should call at each step
- **Pitfalls** — known gotchas the assistant should avoid

## Creating a custom skill

### Via the UI

1. Open the Assistant panel (click the bot icon in the top-right)
2. Click the **Skills** tab (wrench icon in the left rail)
3. Click **New** to open the skill form
4. Fill in:
   - **Skill ID** — unique kebab-case identifier (e.g., `my-podcast-intro`)
   - **Name** — human-readable name (e.g., "My Podcast Intro")
   - **Description** — what the skill does (one sentence)
   - **Triggers** — comma-separated keywords (e.g., `podcast intro, show opening`)
   - **Steps** — one step per line (e.g., `Generate intro music\nRender host greeting\nMix together`)
   - **Tools** — format: `surface: tool1, tool2` (one surface per line)
   - **Pitfalls** — one per line (e.g., `Never use a silent intro`)
5. Click **Create**

### Via the REST API

```bash
curl -X POST http://localhost:8000/skills \
  -H "Content-Type: application/json" \
  -d '{
    "skill_id": "my-podcast-intro",
    "name": "My Podcast Intro",
    "description": "Generate a podcast intro with music and host greeting",
    "triggers": ["podcast intro", "show opening"],
    "steps": [
      "Generate 5-second music bed",
      "Render host greeting over music",
      "Mix and export"
    ],
    "tools": {
      "assistant": ["generate_music", "generate_speech", "bounce"],
      "mcp": ["generate_music", "speak", "bounce"]
    },
    "pitfalls": ["Keep intro under 10 seconds"]
  }'
```

### Via MCP (for external agents)

```python
# In your MCP client
result = await mcp.call_tool("21labs.list_custom_skills")
```

## Managing skills

- **Edit**: Click the pencil icon on any skill row, modify fields, click Update
- **Delete**: Click the trash icon — this is permanent
- **Disable**: Edit a skill and set `enabled: false` via API to hide it from the catalog without deleting

## How skills are discovered

When the assistant receives a message, it:
1. Searches built-in + custom skills for trigger keyword matches
2. Ranks matches by relevance (more trigger hits = higher rank)
3. Injects the top-matching skill's steps and tool list into the system prompt
4. Follows the skill's procedure to complete the task

Custom skills are merged into the same catalog as built-in skills. The assistant doesn't distinguish between them.

## Tool surfaces

Each skill must declare tools for the surfaces it supports:

| Surface | Description | Tool naming |
|---------|-------------|-------------|
| `assistant` | In-app assistant (REST-backed) | Bare snake_case (`generate_speech`) |
| `mcp` | External MCP clients | Dotted (`21labs.speak`) |

A skill can support one or both surfaces. If a skill references tools not available on a surface, it simply won't appear when that surface is queried.

## Validation

The backend validates skills on catalog queries:
- Duplicate skill IDs are rejected
- Tool references are checked against registered tools per surface
- Invalid surface names return errors

## Storage

Skills are stored in the SQLite database (`custom_skills` table). They survive app restarts and are included in database backups.

## Pitfalls

- **Don't duplicate built-in skill IDs** — custom skill IDs must not collide with the 9 built-in IDs (`voiceover`, `podcast`, `audiobook`, `clean-master`, `adr`, `voice-design`, `dubbing`, `transcribe`, `batch`)
- **Tool names must be real** — referencing a non-existent tool will cause validation errors
- **Triggers should be specific** — vague triggers like "do this" will match too broadly
- **Steps should be actionable** — "Generate audio" is better than "Handle the audio"
