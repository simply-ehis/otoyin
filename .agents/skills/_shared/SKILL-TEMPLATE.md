# otoyin Skill Template (REQUIRED shape for every skill)

Every skill is a folder `.agents/skills/<skill-name>/SKILL.md` with this shape.
Keep each file ≤200 lines, focused, and grounded in code. No vague adjectives
without numbers. If a value is not in the cited source, write `[VERIFY IN CODE]`.

```
---
name: <kebab-case-skill-name>
description: <one sentence — what it produces + when an agent should load it; this drives agent discovery>
---
# <Human Title>

## Purpose
<One paragraph: what this layer/feature produces and why it exists.>

## When to use
- <trigger 1: e.g. "user asks for a 16-step drum loop">
- <trigger 2>

## Prerequisites
- Engine/model: <which model must be downloaded/loaded; link engine-atlas>
- Tool surface: <MCP `21labs.*` | in-app assistant | REST `POST /...`>
- Voice/profile: <if needed>

## Parameters / Schema (REAL ranges from code — never invent)
| param | range | default | notes |
|-------|-------|---------|-------|
| ...   | ...   | ...     | ...   |

## Agent procedure (step-by-step, real endpoint/tool names)
1. ...
2. ...

## Worked example
<Real call — MCP tool invocation OR REST curl OR assistant tool — with literal params.>

## Pitfalls / Gotchas
- <from code/known issues; e.g. GM program is 0-based>

## Cross-links
- [engine-atlas](../../engine-atlas/SKILL.md)
- [effects-field-guide](../../effects-field-guide/SKILL.md)

## Validation
- How to confirm the output is correct (e.g. `measure_loudness` ≈ target LUFS).
```

Hard rules for authors:
- Read the cited `docs/knowledge/*.md` AND the backend source before writing.
- Extract real param ranges/defaults from code; mark unknowns `[VERIFY IN CODE]`.
- Use real endpoint paths (`POST /instruments/gm`) and real MCP tool names (`21labs.play_gm_instrument`).
- Cross-link with RELATIVE paths to sibling skills you create or that exist.
- If docs and code disagree, document the CODE behavior and add a Pitfall note.
