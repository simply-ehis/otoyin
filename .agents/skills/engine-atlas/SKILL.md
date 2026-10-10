---
name: engine-atlas
description: Consolidated catalog of every otoyin engine — 13 TTS, 6 music/SFX, multiple STT families, 1 LLM, 3 voice conversion — with sizes, languages, clone capability, best use, limits, and the engine fallback matrix. Load before picking an engine in any generation task.
---
# Engine Atlas

## Purpose
otoyin runs everything on-device. This skill is the single source of truth for which engine
to pick. There are **13 TTS runtime IDs**, **6 music/SFX runtime IDs**,
**multiple STT families/catalog models**, **1 LLM** (jackrong Qwen3.5 family), and **3 voice conversion engines**. Values come from
`backend/backends/protocols.py::TTS_ENGINES`, `backend/backends/configs.py` (sizes,
languages, clone flags), `backend/backends/registry.py` (factory), and GROUNDING-PACK.

## When to use
- Picking a TTS engine for a voice, clone, or language.
- Choosing a music/SFX/STT/LLM/VC engine.
- An engine is missing and you need the fallback.

## Prerequisites
- Model downloaded: `21labs.models_download(model_name="<catalog model>")` / `POST /models/download`. Missing model → HTTP 400.
- See [agent-operating-guide](../agent-operating-guide/SKILL.md) for the loop.
- See [mcp-tool-reference](../mcp-tool-reference/SKILL.md) for tool signatures.

## TTS engines (13 runtime ids — catalog entries include torch/ONNX/GGUF variants)
| engine | model(s) | size MB | langs | clone | best use | known limits |
|--------|----------|---------|-------|-------|----------|--------------|
| kokoro | Kokoro-82M / ONNX | 350 / 340 | 8 (en,es,fr,hi,it,pt,ja,zh) | NO (preset blend + .pt packs only) | fast CPU batch narration | long text must be chunked (250 chars) + 120s/chunk timeout; no zero-shot clone |
| fish_speech_s2 | Fish Audio S2 Pro (GGUF) | ~1700 | 10+ | NO cloned-profile support | high-quality multilingual TTS | Fish Research License — non-commercial research; do not ship as unrestricted paid model |
| zonos_gguf | Zyphra Zonos v0.1 GGUF | 2000 | 5 (en,ja,zh,fr,de) | clone + emotion | clone + emotion control | GGUF/crispasr subprocess; profile clone path |
| pocket_tts | Pocket-TTS / ONNX | 200 | 6 (en,fr,de,pt,it,es) | clone (CLONING_ENGINES) | tiny CPU clone | CC-BY model weights; attribution required |
| parler_tts_gguf | Parler-TTS Mini | 880 | 1 (en) | clone/design-capable | prompt-describable voice | en only |
| moss_tts_nano | MOSS-TTS-Nano (ONNX) | 763 | 20 | clone (CLONING_ENGINES) | multilingual zero-shot clone | ONNX-only; no torch fallback |
| kitten_tts | KittenTTS (mini) | 80 | 1 (en) | no | tiny en | KITTEN_SIZE env: mini=80 / micro=40 MB |
| neutts | NeuTTS-Air (Q4 GGUF) | 400 | 1 (en) | clone (CLONING_ENGINES) | GGUF CPU clone | Apache 2.0 |
| neutts_2e | NeuTTS-2E (Q4 / Q8 GGUF) | 400 / 700 | 1 (en) | clone/design-capable | GGUF CPU clone | custom NeuTTS license; verify before commercial use |
| orpheus | Orpheus 3B (Q4_K_M / Q8_0 GGUF) | 2360 / 4030 | 1 (en) | clone (CLONING_ENGINES) | high-quality English | heavy; GGUF; weight license differs from code license |
| qwen3_tts | Qwen3-TTS 1.7B (subprocess) | ~1700 | 10 (en,zh,ja,ko,de,fr,es,it,pt,ru) | clone (CLONING_ENGINES) | multilingual clone | subprocess one-shot; no resident model |
| bark_small | Bark Small (GGUF, subprocess) | ~400 | 1 (en) | clone (CLONING_ENGINES) | non-verbal sounds (laughs, sighs) | subprocess one-shot; no resident model |
| voxcpm2 | VoxCPM2 (GGUF) | verify with `21labs.list_models` | verify with `21labs.list_models` | NO cloned-profile support | verify with `21labs.list_models` | verify model/license before production use |

## Music / SFX engines (6 runtime ids)
| engine | size / type | use | notes |
|--------|-------------|-----|-------|
| stable_audio | Stable Audio Open 1.0 | music + SFX | `21labs.generate_sfx`; diffusers/torch path |
| acestep_gguf | ACE-Step 1.5 GGUF | full music generation | genre/mood/tempo controllable |
| heartmula | HeartMuLa 3B (Q8_0) | music generation | |
| sa3_sfx | Stable Audio 3 Small SFX (Q8_0) | sound effects | |
| minimax_music3 | MiniMax Music 3 (Q8_0) | music generation | |

## STT engines (catalog families)
| engine | backend | notes |
|--------|---------|-------|
| whisper | whisper.cpp (GGML GGUF) | default STT | MCP transcribe/diarize keys are `tiny.en` and `base.en`; larger faster-whisper catalog names are store/download names, not MCP model keys |
| faster-whisper | CTranslate2 int8 | fast CPU inference |
| parakeet | parakeet.cpp (native C++) | 25 European languages |
| qwen3_asr | ONNX Runtime C++ | 52 languages |
| moonshine | transcribe.cpp GGUF | streaming small model; EN-only; no native word timestamps |

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
  | planner-4b | bartowski/Qwen3.5-4B-125B-16EF-GGUF | 2.7 GB | Q4_K_M | No (default) |
  | planner-4b-v3 | bartowski/Qwen3.5-4B-125B-40EF-GGUF | 2.8 GB | Q4_K_M | Yes |
  | planner-spark-x-2.5-4b | bartowski/Spark-2.5B-A3B-GGUF | 2.5 GB | Q4_K_M | Yes |
  | planner-lfm2-2.6b | LiquidAI/LFM2.5-2.6B-GGUF | 1.6 GB | Q4_0 | Yes |
  | planner-lfm2-8b-a1b | LiquidAI/LFM2.5-8B-A1B-GGUF | 4.5 GB | Q4_K_M | Yes (MoE) |
  | planner-ling-tiny | inclusionAI/Ling-3.0-tiny-GGUF | 4.8 GB | Q4_K_M | Yes (MoE) |
  | planner-bonsai-2-27b | prism-ml/Ternary-Bonsai-2-27B-gguf | 6.1 GB | PTQ1_0 | Yes |
  10 languages (en,zh,ja,ko,de,fr,es,it,pt,ru). Drives in-app assistant refinement via
  `POST /llm/generate` and `GET /llm/status`. `llama-cpp-python` removed — uses the native
  `llama-server` binary as a sidecar process.

## ENGINE FALLBACK MATRIX
| situation | pick |
|-----------|------|
| default quality | Kokoro (default engine), Zonos GGUF for higher quality |
| want a real-voice clone | cloned profile from the current `CLONING_ENGINES` → `zonos_gguf`, `qwen3_tts`, `pocket_tts`, `moss_tts_nano`, `neutts`, `neutts_2e`, `parler_tts_gguf`, `orpheus`, or `bark_small`; never `styletts2` because it has no backend |
| multilingual needed | Qwen3-TTS (10), MOSS-TTS-Nano (20) |
| tiny CPU / offline | Pocket-TTS (200 MB), KittenTTS (80 MB), Kokoro (350 MB) |
| non-verbal sounds | Bark Small (subprocess, GGUF) |
| one-shot SFX | Stable Audio Open |
| full music generation | ACE-Step 1.5, HeartMuLa 3B, MiniMax Music 3 |
| multilingual STT | Qwen3-ASR (52 langs), Whisper large-v3 (100+ langs) |
| fast English STT | Faster-Whisper (CTranslate2 int8) |
| European STT | Parakeet TDT (25 European langs) |

## Pitfalls / Gotchas
- **13 TTS runtime IDs** in `backend/backends/protocols.py`; Fish S2 Pro is `fish_speech_s2` and has a non-commercial research license flag.
- **6 music/SFX runtime IDs**, including `cloud`.
- **Multiple STT catalog families/models**; only faster-whisper has native word timestamps, other engines use proportional segment fallback for Scribe JSON.
- **3 VC engines** (RVC, Seed-VC, OpenVoice). Seed-VC requires GPU.
- Kokoro has NO zero-shot cloning — only preset blending ("af_bella,af_sky") + custom `.pt` packs.
- **Two distinct cloning paths.** Profile-layer `CLONING_ENGINES` (`services/profiles.py:146-157`) is the ONLY
  set usable via `voice_type:"cloned"`, except `styletts2`, which has no backend. Kokoro, KittenTTS, Fish S2 Pro, and VoxCPM2 cannot use cloned profiles.
- Missing model → HTTP 400 "not downloaded yet", not a 500.

## Cross-links
- [agent-operating-guide](../agent-operating-guide/SKILL.md)
- [effects-field-guide](../effects-field-guide/SKILL.md)
- [mcp-tool-reference](../mcp-tool-reference/SKILL.md)

## Validation
- Confirm engine availability via `21labs.list_models` (`tts_engines`, `music_engines`, `llm_engines`, `stt`).
- Confirm a model is downloaded before generating; otherwise the call returns 400.
