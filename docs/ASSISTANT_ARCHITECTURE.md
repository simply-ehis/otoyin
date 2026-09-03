---
PURPOSE:   Planner-executor assistant architecture — jackrong Qwen3.5 family + Needle 2 tool router on llama.cpp server.exe
OWNS:     backend assistant stack (assistant_stream, agents, assistant_tools) + model catalog
READ-WHEN: touching the assistant LLM, tool routing, model catalog rows, or assistant monetization
KEY-FILES: backend/routes/assistant_stream.py, backend/backends/configs.py, backend/agents/manifest.py,
           backend/routes/assistant_tools/constants.py, docs/knowledge/61-core-model-audit.md
INVARIANTS: ONLY Needle 2 + the 0.8B fallback planner are free; the 2B/4B v3/Ministral
           planners are paid licenses ($20/$40/$30 — PRICING_PLAN.md). BYOK keys + Needle router +
           assistant UI are free infrastructure. Everything offline/on-device.
GOTCHAS:   Needle engine binary redistribution terms = P0 verify before bundling. jackrong 0.8B must be the
           fine-tune (base 0.8B has a thinking-loop bug). No 4B v3.5 exists — v3 is the latest at 4B.
UPDATED:   2026-08-23
---

# Assistant Architecture — Planner + Executor

## 1. What this replaces

The assistant was a single local LLM (LFM2.5 family) with a fragile
hand-parsed JSON tool-call loop. New design: a **tool router** (Cactus Needle 2)
picks the right tools, a **planner LLM** decides what to do, and the executor
calls tools through llama.cpp `server.exe` — replacing `llama-cpp-python`
(pre-flagged at `docs/knowledge/61-core-model-audit.md:58`).

## 2. Model lineup (locked with user 2026-08-16, prices re-locked 2026-08-17)

| Role | Model | Size / RAM | License | Price |
|---|---|---|---|---|
| **Default planner (PAID)** | jackrong `Qwen3.5-2B-Claude-4.6-Opus-Reasoning-Distilled` | ~1.7GB Q4_K_M | Apache-2.0 | **$20** |
| Tiny fallback (FREE) | jackrong `Qwen3.5-0.8B-Claude-4.6-Opus-Reasoning-Distilled` | ~0.7GB Q5_K_M | Apache-2.0 | Free |
| Smart planner (PAID) | `Qwopus3.5-4B-v3` (tool-calling RL + act-then-refine) | ~2.8GB Q4_K_M | Apache-2.0 | **$40** |
| 2nd paid planner | `Ministral-3-3B-Reasoning-2512` (256K ctx, native function calling) | ~2GB Q4 | Apache-2.0 | **$30** |
| Tool router (FREE) | Cactus **Needle 2** (45M params) | 14MB binary / 28MB RAM session | Weights Apache-2.0; engine binary = bespoke grant free under $2M funding AND $2M revenue (commercial license above) | Free |

Distribution: **bundle the 4 curated models** with one-time unlock; **BYOK
keys always work** (any OpenAI-compatible key or local GGUF the user brings).

## 3. Request flow

```
user message
  │
  ▼
Needle 2 (retrieval head: top-5 tools from 128-tool catalogue) ── picks tools
  │                                                              constants.py
  ▼
planner LLM (2B default → 4B v3 / Ministral if licensed)
  │   grammar-compiled JSON tool calls (no fragile string parsing)
  ▼
llama.cpp server.exe  ──/v1/chat/completions──▶  executor runs the tool
  ▲                                                  │
  └───── confidence-gated escalation: Needle <θ → planner reasons ─┘
```

- **Needle 2** retrieves the top-5 relevant tools from the assistant tool
  catalogue (`assistant_tools/constants.py:15`) and returns structured calls.
- **Confidence-gated escalation:** if Needle's confidence is low, the planner
  LLM reasons and calls tools itself — never a silent wrong tool.
- **Grammar-compiled JSON** replaces the fragile JSON parse in
  `assistant_stream.py` (~55–80) with constraint-valid output.
- **llama.cpp `server.exe`** runs the GGUF (OpenAI-compatible `/v1/models`,
  `/health`, `/v1/chat/completions`) — one native binary, no Python binding,
  no version skew between llama-cpp-python and the model.

## 4. RAM budget (worst case, one planner + router)

| Config | RAM |
|---|---|
| 0.8B fallback + Needle | ~0.8GB |
| 2B default (Q4_K_M) + Needle | ~1.8GB |
| 2B premium (i1-Q4_K_M) + Needle | ~1.9GB |
| 4B v3 + Needle | ~2.9GB |
| Ministral-3-3B + Needle | ~2.1GB |

Auto-fallback chain on load failure: 2B → 0.8B → "no local planner —
BYOK key or download the 2B" (never silent, never a dead chat).

## 5. Migration checklist

1. **Runtime:** swap `llama-cpp-python` for `llama.cpp server.exe` sidecar;
   pin the server version in the catalog (61-core-model-audit.md:58).
   **DONE** — `backend/backends/gguf_runner.py` `GGUFServerProcess`; assistant
   uses it via `get_llm_backend()` → `GGUFServerLLMBackend`.
2. **Catalog** (`backend/backends/configs.py`): replace LFM rows with
   `jackrong-2b` (default planner, paid $20), `jackrong-0.8b` (free fallback),
   `qwopus-4b-v3` (paid $40), `ministral-3b` (paid $30); keep BYOK providers.
   **DONE** — verified via `get_llm_model_configs()` (4 planner rows).
3. **Router:** download/embed Needle 2 (14MB binary) — verify engine
   redistribution terms first (P0). Wire retrieval head to
   `assistant_tools/constants.py:15` (top-5).
   **RESOLVED (2026-08-24) via system-prompt approach — NO finetuning, NO
   binary.** Audit finding: Needle 2's 14MB engine binary has no obtainable
   offline source URL (P0 redistribution ambiguity stands), so it cannot ship;
   and tool *selection* quality is driven by prompt/context engineering, not a
   dedicated finetuned router (Switchcraft-style routers are for LLM *model*
   selection, a different problem). Decision: ship the in-prompt tool list and
   add an **offline lexical relevance router** (`assistant_tools/router.py`)
   that prunes the catalogue to the top-K tools relevant to the user's query
   (`rank_tools`/`select_tools_for_prompt`), rendering those in full and the
   rest as a name-only appendix. Execution is never blocked by pruning because
   tools resolve by name from the global `ENDPOINT_MAP` registry at call time
   (`dispatcher.py:88`). Wired: `assistant.py` passes the last user message as
   `query` → `get_agent_system_prompt(with_tools, query)` → `build_local_tool_prompt(subset)`.
   Verified by `tests/test_tool_router.py` (9 tests). The finetuned Needle 2
   model is now a deferred *optional* optimization, not a v1 dependency.
4. **Streaming:** rewrite `assistant_stream.py:29` `stream_local` to
   server.exe + grammar-constrained JSON; delete the hand-rolled parse.
   **PARTIAL (2026-08-23)** — GBNF plumbing is in: `assistant_tools/grammar.py`
   builds a tool-call grammar from `TOOLS`; threaded `chat_completion` →
   `generate` → `stream_local`, gated behind `TWENTYLABS_PLANNER_GRAMMAR`
   (default **off**). The hand-rolled `parse_tool_calls` middleware is kept as a
   safety net, NOT deleted, because the jackrong planners are *thinking* models
   (emit `<think>` into `content`/`reasoning_content`); constraining `content`
   to JSON would suppress that thinking until the interaction is validated
   against the real cached GGUF. `stream_local` also falls back to no-grammar
   generation if the server rejects the grammar, so enabling it can never
   dead-end a chat. Item is complete once grammar is validated live and the
   env flag flipped to default-on.
5. **Manifest/parity** (`agents/manifest.py:63`): refresh planner list +
   parity report against the new catalog.
   **DONE** — `manifest.py` is data-driven off `TOOLS`/`build_local_tool_prompt`;
   `GET /assistant/tool-parity` already surfaces divergence.
6. **Licensing:** free 0.8B fallback always loads; 2B / 4B v3 / Ministral
   load only with a signed entitlement (`docs/MARKETPLACE_PLAN.md` §3,
   prices `docs/PRICING_PLAN.md`).
   **INFRA DONE, PLANNER GATING OPEN** — entitlement system exists
   (`backend/utils/licensing.py`, `has_entitlement`, gates in
   `routes/models/download.py`). The planner load path
   (`gguf_server_backend.load_model`) does not yet consult entitlements; needs
   product-ID mapping (`planner:2b`, `planner:4b-v3`, `planner:ministral-3b`)
   plus a deliberate decision on whether free-tier users may run the paid
   planners at all.
7. **Frontend:** Models tab shows "Free: 0.8B (fallback)" vs
   "Premium: 2B (default, $20), 4B v3 ($40), Ministral ($30)" with
   license-gated install.
   **OPEN** — `ModelsTab` → `ModelManagement` exists but has no planner
   free/premium tiers or license-gated install UI yet; depends on item 6
   product-ID mapping.

## 6. Monetization mapping (locked 2026-08-17)

- **Free forever:** 0.8B fallback planner, Needle 2 router, BYOK keys,
  assistant UI + all 128 tools.
- **Paid ($20 / $40 / $30):** 2B default, 4B v3 and Ministral-3-3B planner
  licenses — the "more intelligent are paid" rule. Tied to the offline
  signed-entitlement system; pay once, own forever.
- No subscriptions, no phone-home.

## 7. Open items (P0)

- [x] Needle 2 redistribution VERIFIED (2026-08-16): weights Apache-2.0
      (never revocable); engine binary under Cactus' bespoke grant — free for
      individuals/edu/nonprofits and organizations under **$2M funding AND
      $2M gross revenue**; above either line a commercial license is required
      within 30 days (engine source MIT on paper, LICENSE file is the grant —
      the HF binary's Apache-2.0 vs engine repo grant ambiguity is unresolved
      by Cactus; we bundle the HF binary and treat the grant as the floor).
      → Same threshold pattern as LFM/MiniMax: free under cap, commercial
      license (or swap router) if Otoyin ever crosses $2M.
- [x] GGUF quant research COMPLETE (2026-08-19): see §8 below —
      Q4_K_M confirmed optimal for 2B default; i1-Q4_K_M from mradermacher
      available as quality upgrade (5-10% slower, better low-bit accuracy).
      4B v3: Q4_K_M confirmed. Ministral: Q4 confirmed.
- [x] Gemma 4 E2B research COMPLETE (2026-08-19): see §9 below —
      NOT a viable v1 replacement for 2B Opus-Distilled (no CoT distillation,
      different architecture). Viable future option for multimodal planner.

## 8. GGUF quant research (2026-08-19)

### Available quants — jackrong Qwen3.5-2B Opus-Distilled (default planner)

Static quants (jackrong repo `Qwen3.5-2B-Claude-4.6-Opus-Reasoning-Distilled-GGUF`):

| Quant | Size | Quality | Notes |
|---|---|---|---|
| Q3_K_M | 1.1 GB | Lower | Budget option |
| **Q4_K_M** | **1.27 GB** | **Good** | **Current default — recommended** |
| Q5_K_M | 1.42 GB | Better | Marginal quality gain over Q4 |
| Q6_K | 1.56 GB | Near-lossless | Overkill for planner |
| Q8_0 | 2.01 GB | Lossless | Wasteful for 2B planner |

Imatrix quants (mradermacher repo `Qwen3.5-2B-Claude-4.6-Opus-Reasoning-Distilled-heretic-v2-i1-GGUF`):

| Quant | Size | Quality | Notes |
|---|---|---|---|
| i1-Q4_K_M | 1.4 GB | Better than static Q4 | Recommended upgrade if RAM allows |
| i1-Q5_K_M | 1.5 GB | Better than static Q5 | Best quality/size for reasoning |
| i1-Q6_K | 1.7 GB | Practically like static Q6 | Diminishing returns |

**Key insight from Unsloth benchmarks:** Imatrix quants weight the
quantization process using calibration data, significantly improving
low-bit accuracy (especially for reasoning/thinking models). Trade-off:
5-10% slower inference. For the 2B planner where quality matters more
than raw speed, **i1-Q4_K_M is the recommended upgrade** over static
Q4_K_M.

**Recommendation:** Keep `2B-Q4_K_M` as default (1.27 GB, fast, good
enough). Add `2B-i1-Q4_K_M` (1.4 GB) as a "premium quality" option
for users with 4GB+ RAM who want better reasoning accuracy. The 130MB
extra RAM is worth it for the CoT quality improvement.

### Available quants — Qwopus3.5-4B-v3 (paid smart planner)

Jackrong repo `Qwopus3.5-4B-v3-GGUF` provides standard static quants.
Q4_K_M (~2.8 GB) is confirmed optimal — same reasoning as above.
Imatrix versions from mradermacher not confirmed available for this
specific model; static Q4_K_M is sufficient.

### Available quants — Ministral-3-3B-Reasoning-2512 (paid planner)

Standard GGUF quants. Q4_K_M (~2 GB) confirmed. No imatrix variants
known. 256K native context makes this the best choice for long-context
planning tasks.

### A/B testing methodology

To validate quant choices on target hardware:
1. Load each quant on the weakest target (8-core CPU, 8GB RAM)
2. Run 10 identical planner prompts (tool-calling JSON generation)
3. Measure: first-token latency, total generation time, VRAM/RAM peak
4. Score output quality: correct JSON schema adherence, tool name accuracy
5. Document results in `docs/knowledge/` before finalizing defaults

## 9. Gemma 4 E2B research (2026-08-19)

### What it is

Gemma 4 E2B is Google DeepMind's smallest Gemma 4 variant, released
April 2, 2026 under Apache 2.0. Designed for edge/mobile deployment.

| Property | Value |
|---|---|
| Effective parameters | 2.3B (5.1B with embeddings) |
| Architecture | Dense with Per-Layer Embeddings (PLE) |
| Context window | 128K tokens |
| Modalities | Text, Image, Audio |
| Vision encoder | ~150M params |
| Audio encoder | ~300M params |
| GGUF available | Yes — unsloth/gemma-4-E2B-it-GGUF |
| Recommended quant | UD-Q4_K_XL (3.18 GB) or Q4_K_M (3.11 GB) |
| Min RAM | ~2 GB (Q4) / ~9.3 GB (BF16) |

### Benchmarks (instruction-tuned)

| Benchmark | Gemma 4 E2B | Qwen3.5-2B Opus-Distilled |
|---|---|---|
| MMLU-Pro | 60.0% | Not published (reasoning-focused) |
| AIME 2026 | 37.5% | Not published |
| LiveCodeBench v6 | 44.0% | Not published |
| GPQA Diamond | 43.4% | Not published |

Note: The jackrong 2B Opus-Distilled is a CoT-distilled reasoning model
optimized for structured `<think>` thinking — benchmarks are not directly
comparable since Gemma 4 E2B is a general-purpose chat model.

### Why it's NOT a v1 replacement for 2B Opus-Distilled

1. **No CoT distillation.** Gemma 4 E2B is a base instruction-tuned
   model, not distilled from a reasoning teacher like Claude Opus. The
   jackrong 2B's core advantage is structured `<think>` reasoning
   patterns learned from Opus — Gemma 4 E2B lacks this entirely.

2. **Different architecture (PLE).** Per-Layer Embeddings use large
   lookup tables that are memory-efficient at runtime but make the model
   behave differently from standard transformers. The effective parameter
   count (2.3B) is misleading — total params including embeddings is
   5.1B, and the GGUF quant at Q4 is 3.11 GB vs 1.27 GB for the 2B
   jackrong. Nearly 3x the RAM for comparable text reasoning.

3. **Multimodal overhead we don't need.** The vision encoder (~150M)
   and audio encoder (~300M) add ~450M params of overhead that the
   planner never uses. Wasted RAM and slower cold-start.

4. **No native function-calling grammar support.** The jackrong models
   work with llama.cpp's grammar-constrained JSON output. Gemma 4's
   function calling uses a different template that may not be compatible
   with b10472's grammar mode.

5. **Thinking mode is different.** Gemma 4 uses `<|think>` tokens and
   `<|channel>thought` / `<channel|>` wrapping. The jackrong models use
   </think>...</think>` which our `generate()` helper already parses correctly.

### When Gemma 4 E2B WOULD make sense

- **V2 multimodal planner:** If the assistant needs to reason about
  images/audio inputs (e.g., "describe this waveform and suggest
  effects"), Gemma 4 E2B's native multimodal support is compelling.
- **Ultra-low-RAM fallback:** At Q4_K_M (3.11 GB) it's heavier than
  the 0.8B jackrong (0.7 GB) but much smarter — could replace the
  0.8B as the "smart fallback" on 4GB RAM devices.
- **Non-reasoning tasks:** For simple classification, summarization,
  or tool-routing where CoT isn't needed, Gemma 4 E2B is fine.

### Community Opus-reasoning LoRAs for Gemma 4

No community LoRAs distilling Opus reasoning into Gemma 4 E2B were
found as of 2026-08-19. The mradermacher repos focus on Qwen3.5
family. If someone fine-tunes Gemma 4 E2B on Opus CoT data, it could
become a compelling alternative — but that work doesn't exist yet.

**Conclusion:** Stick with jackrong Qwen3.5-2B Opus-Distilled for v1.
Revisit Gemma 4 for v2 if multimodal planning is needed or if
community LoRAs emerge.
- [x] server.exe version pin + download source RESOLVED (2026-08-17):
      llama.cpp **b10472** (`llama-b10472-bin-win-cpu-x64.zip`, GitHub
      releases) → `data/models/llama-server.exe` + the zip's DLLs MUST sit
      beside the exe (it's a 9KB loader stub; missing DLLs → exit
      0xC0000135). CPU build only; GPU offload later via a vulkan/cuda
      asset + `TWENTYLABS_LLAMA_GPU_LAYERS`. Resolver order: env →
      `data/models/` → PATH.
- [x] Runtime findings (2026-08-17, 0.8B Q5_K_M, 2-core AMD 3020e / 3.4GB
      dev box): (a) the Opus-Distilled models are THINKING models — output
      goes to `reasoning_content` first; `content` stays empty until
      thinking finishes. `enable_thinking: false` is NOT honored by
      b10472, and a small `max_tokens` (e.g. 64) burns entirely on
      thinking → `finish_reason: length` + empty content. `generate()`
      handles this: returns reasoning text on `stop`, raises a clear
      "spent its token budget thinking" error on `length`. (b) Throughput
      on weak HW is brutal: ~1–3 tok/s (prompt processing stalls on cold
      page-in of the mmap'd GGUF for the FIRST request after load; warm
      runs ~2.5 tok/s). A 256-token turn ≈ 5 min on this box — acceptable
      for target HW (8+ cores/SSD ≈ 15–40 tok/s), but the assistant on
      weak boxes needs the 0.8B fallback + generous gen budget.
      (c) First-request-after-load latency is page-in-bound, not CPU-bound.
- [x] Gemma 4 E2B (Apache-2.0) + community Opus-reasoning LoRAs: research
      COMPLETE (2026-08-19) — see §9. NOT viable for v1; revisit for v2.
      note only — NOT in the v1 lineup (user chose Ministral instead).