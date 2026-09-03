# otoyin Price & Capability Manifest

> PURPOSE: Single generated-from-code matrix of every downloadable model — price, capabilities, footprint.
> OWNS: product + docs. READ-WHEN: pricing anything, editing marketplace listings, comparing models, or auditing catalog coverage.
> KEY-FILES: `backend/backends/configs/__init__.py` (configs), `backend/services/marketplace_catalog.py` (PRODUCTS), `docs/archive/PRICING_PLAN.md` (locked equations), `backend/backends/protocols.py` (engines).
> INVARIANTS: only models are paid · pay once own forever · offline forever · no CC-BY-NC model is ever sold (FREE + flagged) · free tier = equation price < $3.
> GOTCHAS: quality_score drifts between configs and catalog in 15 pairs — configs win for capability truth, catalog wins for price truth. 3 configs have NO product entry (license gate silently treats as free): f5-tts, rvc-an-v2, rvc-coconut-v2.
> UPDATED: 2026-08-26

Legend: ✔ = supported · – = not supported. Quality = `config/catalog` when they diverge.

## TTS (16 configs, 14 engines)

| Model | Price | Qual | Clone | Emotion | Tags | Design | Mix | GPU-only | Trim | Quant | MB | Langs | Tags |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Kokoro 82M ONNX | $0 (promo→$3) | 10/5 | – | – | – | – | ✔ | – | – | int8 | 340 | 8 | — |
| Fish Speech S1-mini | $0 NC-flagged | 9/9 | ✔ | ✔ | ✔ | ✔ | – | – | – | — | 2000 | 13 | 19 |
| **Fish Audio S2 Pro GGUF** | **$80 anchor** | 10/10 | ✔ | ✔ | ✔ | – | – | ✔ | – | Q4_K_M | 3400 | 10 | 8 `[angry]…` |
| Zyphra Zonos v0.1 | $32 | 9/9 | ✔ | ✔ | ✔ | – | – | – | – | — | 2000 | 5 | 10 |
| StyleTTS2 (LibriTTS) | $5 | 6/7 | ✔ | – | – | – | – | – | ✔ | — | 400 | 1 | — |
| StyleTTS2 ONNX | $5 | 6/6 | ✔ | – | – | – | – | – | ✔ | int8 | 440 | 1 | — |
| ChatTTS | $0 NC-flagged | 7/7 | – | – | ✔ | – | – | – | ✔ | — | 400 | 2 | 10 |
| F5-TTS (torch) | $0 NC-flagged | 7/7 | ✔ | – | – | – | – | – | ✔ | — | 600 | 2 | — |
| F5-TTS ONNX | $0 NC-flagged | 7/7 | ✔ | – | – | – | – | – | ✔ | int8 | 700 | 2 | — |
| Pocket-TTS | $8 | 5/5 | ✔ | – | – | – | – | – | – | — | 200 | 6 | 20 presets |
| Pocket-TTS ONNX | $8 | 5/5 | ✔ | – | – | – | – | – | – | int8 | 200 | 6 | 20 presets |
| MOSS-TTS-Nano ONNX | $0 | 5/5 | ✔ | – | – | – | – | – | – | int8 | 763 | 20 | — |
| Parler-TTS Mini | $18 | 6/8 | – | – | – | ✔ | – | – | ✔ | int8 | 880 | 1 | 14 presets |
| KittenTTS mini | $0 | 3/4 | – | – | – | – | – | – | – | int8 | 80 | 1 | 8 presets |
| Qwen3-TTS 12Hz 1.7B Base | $40 | 8/10 | ✔ | – | – | ✔ | – | – | – | Q4_K_M | 1486 | 10 | — |
| Bark Small GGUF | $5 | 4/6 | – | – | – | – | – | – | – | q4_k | 235 | 13 | 26 presets |

## Voice Conversion / speech-in-category-vc

| Model | Price | Qual | Clone | Emotion | Trim | Quant | MB | Langs | Notes |
|---|---|---|---|---|---|---|---|---|---|
| NeuTTS-Air | $10 | 6/7 | ✔ | – | – | Q4_0 | 400 | 1 | instant clone, CPU |
| NeuTTS-2E Q4 | $10 | 7/8 | ✔ | ✔ | – | Q4_0 | 400 | 1 | 4 presets |
| NeuTTS-2E Q8 | $15 | 8/9 | ✔ | ✔ | – | Q8_0 | 700 | 1 | 4 presets |
| Orpheus 3B Q4_K_M | $50 | 9/9 | – | ✔ | ✔ | Q4_K_M | 2360 | 1 | 7 `<tag>` + 8 presets |
| Orpheus 3B Q8_0 | $80 | 10/10 | – | ✔ | ✔ | Q8_0 | 4030 | 1 | 7 `<tag>` + 8 presets |
| RVC default pack | $14 | 5/5 | – | – | – | — | 120 | 1 | file-based VC |
| RVC an-v2 pack | $14 | 5/5 | – | – | – | — | 120 | 1 | |
| RVC coconut-v2 pack | $14 | 5/5 | – | – | – | — | 120 | 1 | |
| Seed-VC | $20 | 8/8 | ✔ | – | – | — | 1500 | 1 | zero-shot, GPU-only ✔ |
| OpenVoice V2 | $10 | 6/6 | ✔ | – | – | — | 200 | 6 | tone-color |

## STT (10 unique names)

| Model | Engine(s) | Price | Qual | MB | Langs |
|---|---|---|---|---|---|
| Whisper Tiny EN | whisper.cpp + faster-whisper | $0 | 3/4 | 75 | 1 |
| Whisper Base EN | whisper.cpp + faster-whisper | $0 | 5/6 | 142 | 1 |
| Whisper Small EN | faster-whisper | $5 | 7/8 | 466 | 1 |
| Whisper Medium EN | faster-whisper | $12 | 8/9 | 1530 | 1 |
| Whisper Large-v3 | faster-whisper | $30 | 10/10 | 3100 | 99 |
| Whisper Large-v3-Turbo | whisper.cpp + faster-whisper | $20 | 10,9/10 | 1620 | 99 |
| Parakeet TDT v3 Q8 | parakeet.cpp | $12 | 8/8 | 600 | 25 |
| Parakeet TDT v3 F16 | parakeet.cpp | $12 | 9/9 | 220 | 25 |
| Qwen3-ASR 0.6B INT4 | ONNX Runtime | $12 | 8/8 | 600 | 52 |
| Qwen3-ASR 1.7B INT4 | ONNX Runtime | $34 | 10/10 | 1700 | 52 |

## LLM planners (gguf_llm)

| Model | Price | Qual | Quant | MB | Langs | Tags |
|---|---|---|---|---|---|---|
| Qwen3.5-0.8B Opus-Distilled | $0 free fallback | 4/4 | Q5_K_M | 700 | 10 | — |
| Qwen3.5-2B Opus-Distilled | **$0 free default** (⚠ PRICING_PLAN says PAID $20 — catalog wins) | 7/6 | Q4_K_M | 1700 | 10 | — |
| LFM2.5-2.6B QAD-Q4_0 | $13 special offer | 9/9 | Q4_0 | 1590 | 26 | thinking, tool_call, json_mode; supports_instruct ✔ |
| Ministral-3-3B-Reasoning-2512 | $30 | 8/8 | Q4_K_M | 2000 | 10 | — |
| Qwopus3.5-4B-v3 | $40 | 10/9 | Q4_K_M | 2800 | 10 | — |

## Music / SFX / Spatial / Audio-processing

| Model | Category | Price | Qual | Quant | MB | Notes |
|---|---|---|---|---|---|---|
| ACE-Step 1.5 | music | $43 | 9/9 | bf16 | 10300 | 48kHz stereo songs |
| HeartMuLa 3B | music | $37 | 8/8 | Q8_0 | 7660 | 48kHz mono, audio.cpp |
| Stable Audio 3 Small SFX | music/sfx | $25 | 7/7 | Q8_0 | 1684 | one-shot SFX |
| Demucs HTDemucs | sfx | $0 MIT | 8/8 | — | 316 | stem separation |
| Steam Audio SDK | spatial | $0 pre-installed (⚠ plan said $3) | 5/5 | — | 10 | binaural/HRTF |

## Catalog coverage (resolved 2026-08-26)

All 46 downloadable configs now have catalog products, except the in-progress
BYOK cloud entries (`music-cloud`, `vc-cloud` — active session, pending product
decision). Quality drift fully resolved: catalog mirrors config scores for all
15 previously-drifted pairs (turbo STT uses max across its two engine configs).

**TTS equation cross-check (params_b × $20, free < $3, NC = free + flagged):**
all shipped TTS prices verified against the locked equations — kokoro $1.64→free,
moss $2.00→free, kitten $1.60→free, styletts2 $5.26→$5, bark-small $4.80→$5,
pocket-tts $7.60→$8 (half-up), parler $17.60→$18, zonos $32 exact,
qwen3-tts 2B×$20=$40, s2-pro $91.20→$80 user anchor. No further drift.

## Pricing drift vs locked PRICING_PLAN.md (2026-08-17)

- planner-2b shipped FREE (plan says PAID $20) — intentional post-lock decision, needs changelog entry in the plan
- Steam Audio shipped FREE pre-installed (plan says $3) — same
- Emotion DSP products ($3/$5) never shipped as products — emotion_tone is free DSP
- Orpheus split into two SKUs (Q4 $50 / Q8 $80); plan had single $80 row
- MiniMax Music3 $80 anchor references an engine with no downloadable config — dead rule
- **RVC packs re-priced $10/$3 → $14 each (user decision 2026-08-26)** — recorded in PRICING_PLAN.md §8 changelog
