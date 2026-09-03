# otoyin MCP server

Local **Model Context Protocol** server — lets any MCP-aware agent
(Claude Code, Cursor, Windsurf, VS Code MCP extensions, etc.) speak text
in your cloned voices, transcribe audio, and browse captures.

The server runs inside the same `uvicorn` process as the rest of otoyin
and is mounted at `/mcp` (Streamable HTTP transport).

## Install into your agent

Preferred — direct HTTP:

```json
{
  "mcpServers": {
    "21-labs": {
      "url": "http://127.0.0.1:17493/mcp",
      "headers": { "X-21-labs-Client-Id": "claude-code" }
    }
  }
}
```

Fallback — stdio shim (when the client doesn't speak HTTP MCP). The
`21labs-mcp` binary ships inside the 21labs.app bundle:

```json
{
  "mcpServers": {
    "21labs": {
      "command": "/Applications/21labs.app/Contents/MacOS/21labs-mcp",
      "env": { "twentylabs_CLIENT_ID": "claude-code" }
    }
  }
}
```

Claude Code one-liner:

```
claude mcp add 21-labs \
  --transport http \
  --url http://127.0.0.1:17493/mcp \
  --header "X-21-labs-Client-Id: claude-code"
```

## Tools

The server exposes **110 tools** in the `21labs.*` namespace, spread across the
modules in `backend/mcp_server/tools/`. Every tool is a thin wrapper over a REST
endpoint and returns base64 WAV (audio tools) or JSON. The full catalog lives in
`docs/knowledge/mcp-tools-extended.md` and `.agents/skills/mcp-tool-reference/SKILL.md`;
here are the core ones:

| Name | Purpose |
|---|---|
| `21labs.speak`          | Speak text in a voice profile. Returns a generation id you can poll. |
| `21labs.transcribe`     | Whisper transcription of a base64 blob or an absolute local path. |
| `21labs.list_captures`  | Recent captures (dictation / recording / file) with transcripts. |
| `21labs.list_profiles`  | Available voice profiles (cloned + preset). |
| `21labs.master_audio`   | Master a mix to a broadcast target (glue compression, limiting, LUFS). |
| `21labs.run_recipe`     | Run a content recipe end-to-end (generate → effects → mastering). |
| `21labs.arrange_music`  | Structured music bed via ACE-Step, optional stem separation. |

All tools resolve voice profiles in this precedence:

1. Explicit `profile` arg (name or id — case-insensitive)
2. Per-client binding keyed by `X-21-labs-Client-Id`
3. `capture_settings.default_playback_voice_id` (global default)

Bindings are managed via `GET|PUT /mcp/bindings` or in the app under
Settings → MCP.

## Debug with MCP Inspector

```
npx @modelcontextprotocol/inspector http://127.0.0.1:17493/mcp
```

Point it at the URL, hit "List tools," call `21labs.list_profiles`
first to confirm wiring, then `21labs.speak` for end-to-end.

## Non-MCP REST surface

`POST /speak` is a thin wrapper on the same code path for callers that
don't speak MCP (shell scripts, ACP, A2A):

```
curl -X POST http://127.0.0.1:17493/speak \
  -H 'Content-Type: application/json' \
  -H 'X-21-labs-Client-Id: claude-code' \
  -d '{"text":"Build complete.","profile":"Morgan"}'
```

## Code layout

```
backend/mcp_server/
├── __init__.py      # re-export mount_into
├── server.py        # build_mcp_server() + mount_into(app)
├── context.py       # ClientIdMiddleware + current_client_id ContextVar
├── resolve.py       # profile resolution precedence
├── events.py        # pub/sub queue for /events/speak pill SSE
├── tools/           # @mcp.tool() implementations — one module per domain (10 files, 110 tools)
│   ├── speech.py          # speak / transcribe / list_captures / list_profiles
│   ├── audio_tools.py     # master/normalize/separate/run_recipe/arrange_music
│   ├── audio_domains.py   # freesound, spatial, spectrogram, loudness
│   ├── audio_import_tools.py, instruments.py, dsp.py, generation.py, misc.py, rest_domains.py
└── README.md        # you are here

backend/mcp_shim/    # stdio ↔ Streamable-HTTP proxy (see its README)
```

The package is **`mcp_server`**, not `mcp`, to avoid shadowing the
installed `mcp` PyPI package that FastMCP imports internally.
