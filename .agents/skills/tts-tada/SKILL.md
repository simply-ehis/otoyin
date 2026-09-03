---
name: tts-tada
description: Drive the HumeAI TADA engine — tada-1b (4000MB, en) / tada-3b-ml (8000MB, multilingual), 24kHz, encoder-forced-alignment cloning — via POST /generate or 21labs.speak.
---

# HumeAI TADA (TTS)

> **REMOVED — 2026-07.** The `tada` engine is no longer registered in `TTS_ENGINES`
> (`backend/backends/protocols.py:300-318`); no `tada_backend.py` exists, and
> `get_tts_backend_for_engine` raises `ValueError: Unknown TTS engine` (`registry.py:355-356`).
> This page is retained for historical reference only — do not use it for current work.
> See [engine-atlas](../engine-atlas/SKILL.md) for the 13 live engines and their clone paths.

## Purpose
TADA (Text-Acoustic Dual Alignment) is HumeAI's high-quality cloning model.
Two variants: `tada-1b` (English, 4000MB) and `tada-3b-ml` (multilingual,
8000MB). It uses a shared codec encoder that forced-aligns reference audio to
text, producing 1:1 token embeddings, then a causal LM generates speech via
flow-matching diffusion. TADA is a member of `CLONING_ENGINES`.

## When to use
- User wants premium cloned speech (English or multilingual).
- A reference sample is available for encoder forced-alignment.
- GPU (bf16) is available for the 4B/8B weights; CPU runs fp32.

## Prerequisites
- Engine: `tada` (HF repos `HumeAI/tada-1b` 4000MB, `HumeAI/tada-3b-ml` 8000MB; codec `HumeAI/tada-codec`; tokenizer `unsloth/Llama-3.2-1B`). See [engine-atlas](../engine-atlas/SKILL.md).
- Tool surface: REST `POST /generate` | MCP `21labs.speak`.
- Voice: cloned profile (member of `CLONING_ENGINES`) with reference sample.

## Parameters / Schema (from backend/backends/hume_backend.py, backends/__init__.py)
| param | range | default | notes |
|-------|-------|---------|-------|
| engine | `tada` | `kokoro` | set in GenerationRequest |
| model_size | `1B` \| `3B` | `1B` | selects tada-1b / tada-3b-ml |
| language | 1B:`en`; 3B:`en,ar,zh,de,es,fr,it,ja,pl,pt` | `en` | |
| seed | int ≥ 0 | None | `manual_seed` when set |
| instruct | str | None | ignored by TADA |
| sample_rate (out) | — | 24000 | 24kHz fixed |
| dtype | bf16 (CUDA/XPU) / fp32 (CPU) | auto | `torch.bfloat16` if supported |

## Agent procedure
1. Confirm downloaded: `POST /models/download` for `HumeAI/tada-1b` (or `tada-3b-ml`) — also triggers codec + tokenizer snapshot downloads.
2. Load: `POST /models/load` engine `tada` with `model_size:"1B"` or `"3B"`. Switching size unloads then reloads.
3. Clone: `POST /profiles/{id}/samples` with `reference_text`. Encoder does forced alignment; if `reference_text` omitted it falls back to built-in English ASR.
4. Generate: `POST /generate` → `{profile_id, text, engine:"tada", model_size:"1B"|"3B", language, seed}`.
   `model_size` is honored because `engine_has_model_sizes("tada")` is true (generations.py:131).

## Worked example
```bash
curl -X POST http://localhost:17493/generate -H 'content-type: application/json' -d '{
  "profile_id": "prof_tada_clone", "text": "High fidelity clone.",
  "engine": "tada", "model_size": "3B", "language": "es", "seed": 1
}'
```

## Pitfalls / Gotchas
- On macOS, MPS is force-disabled (`force_cpu_on_mac=True`) due to flow-matching / large `lm_head` issues — TADA runs on CPU there (fp32, slow).
- The tokenizer is silently redirected from the gated `meta-llama/Llama-3.2-1B` to `unsloth/Llama-3.2-1B`. No user action needed.
- 24kHz output (not 44.1k/48k) — resample before 48k-only effects.
- Encoder language is baked in at clone time; switching `language` at generate time does NOT re-encode.

## Cross-links
- [engine-atlas](../engine-atlas/SKILL.md)
- [voice-profiles](../voice-profiles/SKILL.md)
- [voice-cloning](../voice-cloning/SKILL.md)
- [tts-luxtts](../tts-luxtts/SKILL.md) (smaller CPU clone)

## Validation
- Output WAV at 24000 Hz. Clone matches reference; for 3B, non-English `language` must be one of the 10 supported codes or it is rejected by the profile language pattern.
