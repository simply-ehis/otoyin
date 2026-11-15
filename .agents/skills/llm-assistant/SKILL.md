---
name: llm-assistant
description: How otoyin's on-device LLM (gguf_llm, LFM2.5 family - GGUF via the llama.cpp server sidecar) drives the in-app assistant refinement. Covers the LFM2.5/Ling/Bonsai planner lineup, configs, and the refinement workflow. Load when wiring or debugging the assistant's text-rewrite / refinement step.
---
# LLM - gguf_llm (LFM2.5 planner, on-device)

## Purpose
otoyin ships a fully local LLM that powers the in-app assistant's refinement (rewriting text in a
voice profile's personality before TTS, and small pattern-matched edits). No cloud. All sizes run via
the llama.cpp server sidecar (Vulkan) in Q4_K_M quantization.

## When to use
- Understanding which LLM size to load for assistant refinement.
- Wiring `personality=true` TTS (text rewritten by the LLM first).
- Debugging local LLM generation.

## Prerequisites
- Engine: `gguf_llm` (the only LLM engine — `LLM_ENGINES` in `backend/backends/__init__.py`).
- Backend: `GGUFServerLLMBackend` (`backend/backends/gguf_server_backend.py`). GGUF is served by a
  native `llama-server` sidecar (Vulkan) — `llama-cpp-python` is **not** used; the server binary is
  resolved via `TWENTYLABS_LLAMA_SERVER` env → `data/models/llama-server.exe` → PATH.
- Endpoint: `POST /llm/generate` (`backend/routes/llm.py`) + `services/refinement.py`. NOTE: not yet
  on the MCP surface — see `36-missing-features-inventory` (#16). Assistant uses it internally via
  `personality=true`.
- See [agent-operating-guide](../agent-operating-guide/SKILL.md) and [engine-atlas](../engine-atlas/SKILL.md).

## Model lineup (from `_get_gguf_llm_configs` in `backend/backends/configs/llm.py`)
| model_name | display | size MB | quant | best for |
|-----------|---------|----------|-------|----------|
| planner-lfm2-2.6b | LFM2.5-2.6B (Free, default) | 1590 | Q4_0 | default planner |
| planner-lfm2-8b-a1b | LFM2.5-8B-A1B ($40) | 4500 | Q4_K_M | MoE, fastest in class |
| planner-ling-tiny | Ling-3.0-tiny ($40) | 4750 | Q4_K_M | 128 routed experts |
| planner-bonsai-2-27b | Bonsai 2 27B ($80) | 6085 | PTQ1_0 | largest quality, needs PrismML fork |

All share the planner languages. Repos live under `LiquidAI/*` (LFM2.5), `inclusionAI/*` (Ling) and `prism-ml/*` (Bonsai).

## Parameters (LLMBackend.generate)
| param | range | default | notes |
|-------|-------|---------|-------|
| prompt | str | required | user turn |
| system | str? | none | system prompt |
| max_tokens | int | 512 | DEFAULT_LLM_MAX_TOKENS |
| temperature | float | 0.7 | DEFAULT_LLM_TEMPERATURE |
| model_size | str? | loaded | one of the model_names above |
| examples | list[(user,assistant)]? | none | few-shot turns (generalizes better than inline) |

## How it drives the assistant
- `21labs.speak(..., personality=true)` with a profile that has a `personality` prompt: the
  route (`generate_speech`) calls the LLM to rewrite `text` in character, then TTS.
- `personality` resolution: per-client MCP binding `default_personality` → else plain TTS.
- Refinement service (`services/refinement.py`) uses `examples` as structured chat turns so tiny
  models pattern-match instead of echoing inline system-prompt samples.

## Agent procedure (assistant refinement)
1. Confirm a profile with a personality prompt: `21labs.list_profiles` (`has_personality`).
2. Speak in character: `21labs.speak(text="...", profile="<name>", personality=true)`.
3. The LLM rewrite happens server-side; the returned generation is already in-character audio.

Example:
```
21labs.speak(text="Welcome back, friend.", profile="Morgan", personality=true)
```

## Pitfalls / Gotchas
- `POST /llm/generate` is NOT on the MCP tool surface yet — only reachable via the assistant /
  REST. Do not invent `21labs.llm_generate`.
- The `qwen` / `qwen_custom_voice` TTS engines are REMOVED — the LLM assistant uses only the
  `gguf_llm` (LFM2.5 family) planner. Don't route LLM requests through a TTS engine.
- Default max_tokens=512 — long rewrites may truncate; raise via the refinement service if needed.

## Cross-links
- [engine-atlas](../engine-atlas/SKILL.md)
- [agent-operating-guide](../agent-operating-guide/SKILL.md)
- [mcp-tool-reference](../mcp-tool-reference/SKILL.md)

## Validation
- A `personality=true` generation whose transcript matches the profile's voice confirms the LLM ran.
