---
name: engine-atlas
description: Consolidated catalog of every otoyin engine — 15 TTS, 5 music/SFX, 4 STT, 1 LLM, 3 voice conversion — with sizes, languages, clone capability, best use, limits, and the engine fallback matrix. Load before picking an engine in any generation task.
---
# Engine Atlas

## Purpose
otoyin runs everything on-device. This skill is the single source of truth for which engine
to pick. There are **15 TTS engines**, **5 music/SFX engines**, **4 STT engines**,
**1 LLM** (jackrong Qwen3.5 family), and **3 voice conversion engines**. Values come from
`backend/backends/protocols.py::TTS_ENGINES`, `backend/backends/configs.py` (sizes,
languages, clone flags), `backend/backends/registry.py` (factory), and GROUNDING-PACK.

## When to use
- Picking a TTS engine for a voice, clone, or language.
- Choosing a music/SFX/STT/LLM/VC engine.
- An engine is missing and you need the fallback.

## Prerequisites
- Model downloaded: `21labs.models_download(name)` / `POST /models/download`. Missing model → HTTP 400.
- See [agent-operating-guide](../agent-operating-guide/SKILL.md) for the loop.
- See [mcp-tool-reference](../mcp-tool-reference/SKILL.md) for tool signatures.

## TTS engines (12 — fish_speech/chattts/f5_tts removed, see rows)
| engine | model(s) | size MB | langs | clone | best use | known limits |
|--------|----------|---------|-------|-------|----------|--------------|
| kokoro | Kokoro-82M / ONNX | 350 / 340 | 8 (en,es,fr,hi,it,pt,ja,zh) | NO (preset blend + .pt packs only) | fast CPU batch narration | long text must be chunked (250 chars) + 120s/chunk timeout; no zero-shot clone |
| ~~fish_speech~~ | REMOVED 2026-09-05 (CC-BY-NC-SA weights) | — | — | — | use zonos or qwen3_tts | |
| zonos | Zyphra Zonos v0.1 | 2000 | 5 (en,ja,zh,fr,de) | clone + emotion (CLONING_ENGINES) | clone + emotion control | |
| styletts2 | StyleTTS2 LibriTTS / ONNX | 400 / 440 | 1 (en) | clone (CLONING_ENGINES) | fast English clone | ⚠ atlas notes CC-BY-NC weights yet catalog sells it $5 — license re-verification open |
| ~~chattts~~ | REMOVED 2026-09-05 (CC-BY-NC weights) | — | — | — | conversational → use zonos | |
| ~~f5_tts~~ | REMOVED 2026-09-05 (CC-BY-NC weights) | — | — | — | zero-shot clone → use zonos or qwen3_tts | |
| pocket_tts | Pocket-TTS / ONNX | 200 | 6 (en,fr,de,pt,it,es) | clone (CLONING_ENGINES) | tiny CPU clone | |
| parler_tts | Parler-TTS Mini | 880 | 1 (en) | text-described voice | prompt-describable voice | en only |
| moss_tts_nano | MOSS-TTS-Nano (ONNX) | 763 | 20 | gen-time zero-shot (NOT in CLONING_ENGINES) | multilingual zero-shot clone | ONNX-only; no torch fallback |
| kitten_tts | KittenTTS (mini) | 80 | 1 (en) | no | tiny en | KITTEN_SIZE env: mini=80 / micro=40 MB |
| neutts | NeuTTS-Air (Q4 GGUF) | 400 | 1 (en) | zero-shot clone (NOT in CLONING_ENGINES) | GGUF CPU clone | Apache 2.0 |
| neutts_2e | NeuTTS-2E (Q4 / Q8 GGUF) | 400 / 700 | 1 (en) | zero-shot clone (NOT in CLONING_ENGINES) | GGUF CPU clone | |
| orpheus | Orpheus 3B (Q4_K_M / Q8_0 GGUF) | 2360 / 4030 | 1 (en) | no | high-quality English | heavy; GGUF |
| qwen3_tts | Qwen3-TTS 1.7B (subprocess) | ~1700 | 10 (en,zh,ja,ko,de,fr,es,it,pt,ru) | gen-time zero-shot | multilingual clone | subprocess one-shot; no resident model |
| bark_small | Bark Small (GGUF, subprocess) | ~400 | 1 (en) | no | non-verbal sounds (laughs, sighs) | subprocess one-shot; no resident model |

## Music / SFX engines (5)
| engine | size / type | use | notes |
|--------|-------------|-----|-------|
| stable_audio | Stable Audio Open | one-shot SFX | `21labs.generate_sfx` |
| acestep | ACE-Step 1.5 (bf16) | full music generation | genre/mood/tempo controllable |
| heartmula | HeartMuLa 3B (Q8_0) | music generation | |
| sa3_sfx | Stable Audio 3 Small SFX (Q8_0) | sound effects | |
| minimax_music3 | MiniMax Music 3 (Q8_0) | music generation | |

## STT engines (4)
| engine | backend | notes |
|--------|---------|-------|
| whisper | whisper.cpp (GGML GGUF) | default STT; tiny/base/large-v3 variants |
| faster-whisper | CTranslate2 int8 | fast CPU inference |
| parakeet | parakeet.cpp (native C++) | 25 European languages |
| qwen3_asr | ONNX Runtime C++ | 52 languages |

## Voice conversion engines (3)
| engine | backend | notes |
|--------|---------|-------|
| rvc | RVC v2 (file-based) | pre-trained voice packs |
| seed_vc | Seed-VC (DiT+Whisper+BigVGAN) | zero-shot clone, GPU-only |
| openvoice | OpenVoice (tone-color) | zero-shot, 6 languages, MIT |

## LLM engine
- **gguf_llm** (jackrong Qwen3.5 family, GGUF via llama.cpp `server` sidecar):
  | model_name | repo | size | quant | paid |
  |-----------|------|------|-------|------|
  | planner-2b | Jackrong/Qwen3.5-2B-Claude-4.6-Opus-Reasoning-Distilled-GGUF | 1.7 GB | Q4_K_M | No (free default) |
  | planner-0.8b | Jackrong/Qwen3.5-0.8B-Claude-4.6-Opus-Reasoning-Distilled-GGUF | 700 MB | Q5_K_M | No (low-RAM fallback) |
  | planner-4b-v3 | Jackrong/Qwopus3.5-4B-v3-GGUF | 2.8 GB | Q4_K_M | Yes |
  | planner-ministral-3b | mistralai/Ministral-3-3B-Reasoning-2512-GGUF | 2.0 GB | Q4_K_M | Yes |
  10 languages (en,zh,ja,ko,de,fr,es,it,pt,ru). Drives in-app assistant refinement via
  `POST /llm/generate` and `GET /llm/status`. `llama-cpp-python` removed — uses the native
  `llama-server` binary as a sidecar process.

## ENGINE FALLBACK MATRIX
| situation | pick |
|-----------|------|
| default quality | Kokoro (default engine), Zonos for higher quality |
| want a real-voice clone | cloned profile (CLONING_ENGINES) → zonos, styletts2, pocket_tts; gen-time reference → moss_tts_nano, neutts_2e, qwen3_tts |
| multilingual needed | Qwen3-TTS (10), MOSS-TTS-Nano (20) |
| tiny CPU / offline | Pocket-TTS (200 MB), KittenTTS (80 MB), Kokoro (350 MB) |
| non-verbal sounds | Bark Small (subprocess, GGUF) |
| one-shot SFX | Stable Audio Open |
| full music generation | ACE-Step 1.5, HeartMuLa 3B, MiniMax Music 3 |
| multilingual STT | Qwen3-ASR (52 langs), Whisper large-v3 (100+ langs) |
| fast English STT | Faster-Whisper (CTranslate2 int8) |
| European STT | Parakeet TDT (25 European langs) |

## Pitfalls / Gotchas
- **15 TTS engines** (not 13 as older docs claim). Qwen3-TTS and Bark Small are subprocess-based.
- **5 music/SFX engines** (not 1). ACE-Step, HeartMuLa, MiniMax Music 3 are all active.
- **4 STT engines** (not 1). Parakeet and Qwen3-ASR are newer additions.
- **3 VC engines** (RVC, Seed-VC, OpenVoice). Seed-VC requires GPU.
- Kokoro has NO zero-shot cloning — only preset blending ("af_bella,af_sky") + custom `.pt` packs.
- **Two distinct cloning paths.** Profile-layer `CLONING_ENGINES = {zonos,
  styletts2, pocket_tts, ...}` (services/profiles.py) is the ONLY
  set usable via `voice_type:"cloned"`. `neutts`, `neutts_2e`, `moss_tts_nano`, and `qwen3_tts` clone at
  generation time — for engines OUTSIDE the set, pass `engine` directly in `POST /generate`,
  never as a cloned profile. Kokoro, Parler, KittenTTS, Orpheus, Bark cannot clone.
- Missing model → HTTP 400 "not downloaded yet", not a 500.

## Cross-links
- [agent-operating-guide](../agent-operating-guide/SKILL.md)
- [effects-field-guide](../effects-field-guide/SKILL.md)
- [mcp-tool-reference](../mcp-tool-reference/SKILL.md)

## Validation
- Confirm engine availability via `21labs.list_models` (`tts_engines`, `music_engines`, `llm_engines`, `stt`).
- Confirm a model is downloaded before generating; otherwise the call returns 400.
