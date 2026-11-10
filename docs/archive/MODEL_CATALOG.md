# MODEL_CATALOG.md — Unified Model Registry

Purpose: Every downloadable model in otoyin, one table per category.
Updated: 2026-09-20

---

## TTS — Text-to-Speech

| ID | Display Name | Engine | Size | Min RAM | Quant | Languages | Capabilities | License | Price | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| kokoro-onnx | Kokoro 82M | kokoro | 340 MB | — | int8 | en es fr hi it pt ja zh | 45 preset voices, voice mixing | Apache-2.0 | Free (then $3) | Default voice. Torch-free ONNX, realtime on CPU. |
| kitten-tts-mini | KittenTTS mini | kitten_tts | 80 MB | — | int8 | en | 8 presets, no cloning | Apache-2.0 | Free | Lightest TTS. CPU-only, <1s to first audio. |
| moss-tts-nano | MOSS-TTS-Nano | moss_tts_nano | 763 MB | 1 GB | int8 | en zh ja ko de fr ru pt es it ar tr pl nl id vi th he sv fi | Zero-shot cloning, 20 languages | Apache-2.0 | Free | Torch-free ONNX. Best free multilingual option. |
| pocket-tts-onnx | Pocket-TTS (ONNX) | pocket_tts | 200 MB | — | int8 | en de fr it pt es | Cloning, 20 presets | CC-BY-4.0 | $8 | Torch-free. Same quality as PyTorch variant. |
| pocket-tts | Pocket-TTS (PyTorch) | pocket_tts | 200 MB | — | — | en de fr it pt es | Cloning, 20 presets | CC-BY-4.0 | $8 | Requires PyTorch. |
| bark-small | Bark Small | bark_small | 435 MB | — | q8_0 | en de es fr hi it ja ko pl pt ru tr zh | 26 speakers, nonverbals (laugh/sigh/music) | MIT | $5 | GGUF via CrispASR. Fun for characters and sound-rich scenes. |
| neutts-air-q8 | NeuTTS-Air | neutts | 803 MB | 1.5 GB | Q8_0 | en | Zero-shot cloning | Apache-2.0 | $10 | GGUF backbone. Lightweight voice conversion air bridge. |
| neutts-2e-q4 | NeuTTS-2E (Q4) | neutts_2e | 500 MB | 1 GB | Q4_0 | en | Cloning, emotion control, 4 presets | Apache-2.0 | $10 | Emotion-aware with 4 speakers x 7 emotions. |
| neutts-2e-q8 | NeuTTS-2E (Q8) | neutts_2e | 800 MB | 1.5 GB | Q8_0 | en | Cloning, emotion control, 4 presets | Apache-2.0 | $15 | Higher fidelity than Q4 variant. |
| zonos-v0.1-gguf | Zonos v0.1 | zonos_gguf | 1700 MB | 2 GB | Q8_0 | en | Cloning, emotion control | Apache-2.0 | $32 | Premium expressive TTS. Studio-grade from a single reference. |
| parler-tts-mini-gguf | Parler-TTS Mini | parler_tts_gguf | 979 MB | 1 GB | Q8_0 | en | Voice design (natural language description) | Apache-2.0 | $18 | "Describe the voice" instead of cloning. 14 presets. |
| qwen3-tts-1.7b | Qwen3-TTS 1.7B | qwen3_tts | 2296 MB | 3 GB | Q8_0 | zh en de it pt es ja ko fr ru | Cloning, voice design, 10 languages | Apache-2.0 | $40 | GGUF via llama-tts sidecar. Best multilingual paid option. |
| fish-speech-s2-pro | Fish Audio S2 Pro | fish_speech_s2 | 3400 MB | 4 GB | Q4_K_M | en zh ja ko de fr es pt ru it | Cloning, emotion tags, 10 languages | Fish Audio Research | $80 | 4.56B Dual-AR. GPU required (Vulkan). Premium quality. |
| voxcpm2-q8 | VoxCPM2 2B | voxcpm2 | 2830 MB | 4 GB | Q8_0 | ar da de el en es fi fr he hi id it ja km ko lo ms my nl no pl pt ru sv sw th tl tr vi zh | Cloning, voice design, 30 languages, 48kHz | Apache-2.0 | $40 | CrispASR GGUF. Tokenizer-free CFM diffusion AR. Zero-shot cloning + style control. |

---

## VC — Voice Conversion

| ID | Display Name | Engine | Size | Min RAM | Quant | Languages | Capabilities | License | Price | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| rvc-onnx-default | RVC (default pack) | rvc_onnx | 120 MB | 512 MB | — | en | Real-time voice conversion | Commercial | $14 | Pre-trained RVC voice packs. ONNX, no torch. |
| openvoice-onnx-v2 | OpenVoice V2 | openvoice_onnx | 161 MB | — | — | en | Tone-color conversion, zero-shot | Apache-2.0 | $10 | Keep prosody, swap voice. ONNX, no torch. |
| seed-vc | Seed-VC | seed_vc | 1500 MB | 2 GB | — | en | Zero-shot cloning from reference | Apache-2.0 | $20 | GPU required. High fidelity conversion. |
| orpheus-q8-0 | Orpheus 3B | orpheus | 3700 MB | 5 GB | Q8_0 | en | 8 presets, emotion tags (<laugh>, <sigh>, etc) | Apache-2.0 | $80 | SNAC decoder. 24kHz output. Also usable as TTS. |

---

## STT — Speech-to-Text

| ID | Display Name | Engine | Size | Min RAM | Quant | Languages | Capabilities | License | Price | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| whisper-tiny-en | Whisper Tiny EN | whisper | 75 MB | — | — | en | Fastest, EN-only | MIT | Free | whisper.cpp. Pure C++, no Python. |
| moonshine-tiny | Moonshine Tiny | moonshine | 35 MB | 100 MB | Q8_0 | en | Ultra-light, 12% WER | MIT | Free | transcribe.cpp. 27M params, Raspberry Pi friendly. |
| whisper-base-en | Whisper Base EN | whisper | 142 MB | — | — | en | Good speed/accuracy | MIT | Free | whisper.cpp. |
| moonshine-base | Moonshine Base | moonshine | 74 MB | 200 MB | Q8_0 | en | Best balance, 3.3% WER | MIT | Free | transcribe.cpp. 61M params. |
| moonshine-streaming-small | Moonshine Streaming Small | moonshine | 189 MB | 300 MB | Q8_0 | en | Streaming, 2.5% WER, beats Whisper Large v3 | MIT | Free | transcribe.cpp. 123M params. Best English STT. |
| whisper-small-en | Whisper Small EN | faster-whisper | 466 MB | — | — | en | Excellent accuracy, word timestamps | MIT | $5 | CTranslate2 int8. 23 languages. |
| whisper-medium-en | Whisper Medium EN | faster-whisper | 1530 MB | 2 GB | — | en | Best EN accuracy before large | MIT | $12 | CTranslate2 int8. Handles accents. |
| whisper-large-v3-turbo | Whisper Large-v3-Turbo | faster-whisper | 1620 MB | 2 GB | — | 99 languages | Near-human accuracy, fast | MIT | $20 | 4-8x faster than full large-v3. Runs on CPU. |
| whisper-large-v3 | Whisper Large-v3 | faster-whisper | 3100 MB | 4 GB | — | 99 languages | Flagship multilingual | MIT | $30 | Full large-v3. Best quality when you can afford it. |
| parakeet-v3-q8 | Parakeet v3 (Q8) | parakeet | 600 MB | 800 MB | Q8_0 | 25 European langs | Auto-detect, fast on CPU | Apache-2.0 | $12 | Native C++ via parakeet.cpp. |
| parakeet-v3-f16 | Parakeet v3 (F16) | parakeet | 220 MB | 400 MB | F16 | 25 European languages | Lighter, same accuracy | Apache-2.0 | $12 | 220 MB — pick for tighter disks. |
| qwen3-asr-0.6b-int4 | Qwen3 ASR 0.6B | qwen3_asr | 600 MB | 800 MB | INT4 | 52 languages | Best quality-per-size multilingual | Apache-2.0 | $12 | ONNX Runtime. |
| qwen3-asr-1.7b-int4 | Qwen3 ASR 1.7B | qwen3_asr | 1700 MB | 2.5 GB | INT4 | 52 languages | Near-cloud accuracy offline | Apache-2.0 | $34 | ONNX Runtime. Best STT in the catalog. |

---

## LLM — Assistant Planner

| ID | Display Name | Engine | Size | Min RAM | Quant | Languages | Capabilities | License | Price | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| planner-4b | Qwopus 4B (Free) | gguf_llm | 2740 MB | 3.5 GB | Q4_K_M | en zh ja ko de fr es it pt ru | Reasoning, tool calling | Apache-2.0 | Free | Default assistant brain. Strong all-rounder. |
| planner-4b-v3 | Qwopus 4B v3 | gguf_llm | 2800 MB | 4 GB | Q4_K_M | en zh ja ko de fr es it pt ru | Thinking, tool calling, JSON mode | Commercial | $20 | Claude-distilled. Premium reasoning and tool calling. |
| planner-spark-x-2.5-4b | Spark-X 2.5-4B | gguf_llm | 2500 MB | 3.5 GB | Q4_K_M | en zh ja ko de fr es it pt ru | 1M context, 200+ languages | Apache-2.0 | $20 | iFLYTEK's agentic king. Hybrid sliding-window attention. |
| planner-lfm2-2.6b | LFM2.5-2.6B | gguf_llm | 1590 MB | 4 GB | Q4_0 | 25 languages | 128K context, thinking, tool calling | Apache-2.0 | Free | LiquidAI. Strong multilingual at tiny footprint. |
| planner-lfm2-8b-a1b | LFM2.5-8B-A1B | gguf_llm | 4500 MB | 6 GB | Q4_K_M | 25 languages | 128K context, MoE (1.5B active) | Apache-2.0 | $40 | LiquidAI MoE. Fastest in its class. SSD streaming. |
| planner-ling-tiny | Ling-3.0-tiny | gguf_llm | 4820 MB | 6 GB | Q4_K_M | 25 languages | 128K context, MoE (1.3B active), chain-of-thought | MIT | $40 | inclusionAI. 128 routed experts, hybrid KDA/MLA. |
| planner-bonsai-2-27b | Bonsai 2 27B | gguf_llm | 6090 MB | 8 GB | PTQ1_0 | 25 languages | 262K context, 98.2% of FP16 quality | Apache-2.0 | $80 | PrismML ternary quantized. Requires PrismML llama.cpp fork. |
| llm-cloud-starter | Cloud Starter — Coming Soon | cloud | — | — | — | — | Cloud-hosted LLM | — | $10/mo | Planned subscription tier. Not purchasable yet. |
| llm-cloud-pro | Cloud Pro — Coming Soon | cloud | — | — | — | — | Cloud-hosted LLM | — | $20/mo | Planned subscription tier. Not purchasable yet. |
| llm-cloud-max | Cloud Max — Coming Soon | cloud | — | — | — | — | Cloud-hosted LLM | — | $50/mo | Planned subscription tier. Not purchasable yet. |

---

## Music / SFX

| ID | Display Name | Engine | Size | Min RAM | Quant | Languages | Capabilities | License | Price | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| acestep-1-5-gguf | ACE-Step 1.5 | acestep_gguf | 7700 MB | 10 GB | Q8_0 | en | Full song generation (vocals + instruments) | Apache-2.0 | $43 | GGUF, no torch. 10s-10min stereo tracks. |
| heartmula-3b | HeartMuLa 3B | heartmula | 7660 MB | 10 GB | Q8_0 | en | Lyrics music generation | Apache-2.0 | $37 | Best-in-class lyrics. Tag-based style control. |
| stable-audio-3-small-sfx | Stable Audio 3 Small SFX | sa3_sfx | 1684 MB | 2.5 GB | Q8_0 | en | Sound effects (Foley, impacts, ambiences) | Commercial | $25 | One-shot SFX from text prompt. |
| demucs_onnx | Demucs HTDemucs | demucs_onnx | 316 MB | — | — | — | Stem separation (vocals/drums/bass) | MIT | Free | Torch-free ONNX. Extract stems from any mix. |

---

## Instruments (SoundFont)

| ID | Display Name | Engine | Size | Min RAM | License | Price | Notes |
|---|---|---|---|---|---|---|---|
| sf2-generaluser-gs | GeneralUser GS | soundfont | 31 MB | — | GeneralUser-2.0 | Free | 261 GM presets + 13 drum kits. |
| sf2-fluid-gm | FluidR3 GM | soundfont | 142 MB | — | MIT | Free | Classic GM bank + drums. |

---

## Spatial Audio

| ID | Display Name | Engine | Size | License | Price | Notes |
|---|---|---|---|---|---|---|
| steam-audio | Steam Audio SDK | steam_audio | 10 MB | Proprietary | Free | Binaural rendering, HRTF, occlusion. Pre-installed. |

---

## Translation (Argos Offline Packs)

All packs are ~45 MB each, MIT license, free. 20 bidirectional pairs.

| Pair | Price |
|---|---|
| en↔es, en↔fr, en↔de, en↔ja, en↔zh, en↔pt, en↔ru, en↔ar, en↔hi, en↔it | Free |

---

## Cloud LLM (Coming Soon)

| ID | Category | Price | Notes |
|---|---|---|---|
| llm-cloud-starter | LLM | $10/mo | Planned cloud subscription tier. Not purchasable yet. |
| llm-cloud-pro | LLM | $20/mo | Planned cloud subscription tier. Not purchasable yet. |
| llm-cloud-max | LLM | $50/mo | Planned cloud subscription tier. Not purchasable yet. |

---

## Pricing Summary

| Price Tier | Models |
|---|---|
| Free | Kokoro 82M, KittenTTS, MOSS-TTS-Nano, Whisper Tiny/Base, Demucs, SoundFonts, Translation packs, Steam Audio, Qwopus 4B, LFM2.5-2.6B |
| $5 | Bark Small, Whisper Small |
| $8 | Pocket-TTS (ONNX/PyTorch) |
| $10 | NeuTTS-Air, NeuTTS-2E Q4, OpenVoice V2 |
| $12 | Whisper Medium, Parakeet v3, Qwen3 ASR 0.6B |
| $14 | RVC Voice Packs |
| $15 | NeuTTS-2E Q8 |
| $18 | Parler-TTS Mini |
| $20 | Qwopus 4B v3, Spark-X 2.5-4B, Seed-VC, Whisper Large-v3-Turbo |
| $25 | Stable Audio 3 Small SFX |
| $30 | Whisper Large-v3 |
| $32 | Zonos v0.1 |
| $34 | Qwen3 ASR 1.7B |
| $37 | HeartMuLa 3B |
| $40 | Qwen3-TTS 1.7B, LFM2.5-8B-A1B, Ling-3.0-tiny |
| $43 | ACE-Step 1.5 |
| $80 | Fish Audio S2 Pro, Orpheus 3B, Bonsai 2 27B |
| Coming soon | Cloud Starter ($10/mo), Cloud Pro ($20/mo), Cloud Max ($50/mo) |
