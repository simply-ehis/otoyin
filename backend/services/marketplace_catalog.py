"""Marketplace catalog — the signed product list shipped with 21labs.

The catalog is the single source of truth for what is paid vs. free and
at what price (docs/PRICING_PLAN.md, locked 2026-08-17). It is signed
with the marketplace private key so a tampered or downgraded catalog is
rejected at load time. Model-product ``id`` values match the
``model_name`` used by the download pipeline so the license gate in
``routes/models/download.py`` can resolve entitlements.

Pricing rule (docs/PRICING_PLAN.md): only models are paid; the app,
instruments, and every procedural item stay free.  Free tier = equation
price < $3.  NC-licensed engines are NOT shipped (removed 2026-09-05 —
non-commercial weights cannot be distributed through a paid marketplace).
"""

from __future__ import annotations

import datetime
import json
import logging
import os
import threading
import time
import urllib.request
from typing import Any

from .licensing import sign_license, verify_license_signature

logger = logging.getLogger(__name__)

# Optional remote catalog source (07 Part B). When ``OTOYIN_CATALOG_URL`` is
# set, ``refresh_remote_catalog()`` fetches the signed catalog from the
# marketplace service and swaps the bundled ``PRODUCTS`` on success.
# Offline-first: any failure keeps the bundled catalog untouched.
REMOTE_CATALOG_URL = os.environ.get("OTOYIN_CATALOG_URL", "").strip()
REMOTE_CATALOG_TIMEOUT_S = float(os.environ.get("OTOYIN_CATALOG_TIMEOUT_S", "8"))
REMOTE_REFRESH_INTERVAL_S = float(os.environ.get("OTOYIN_CATALOG_REFRESH_S", str(24 * 60 * 60)))
# Background poll tick: how often the startup task checks staleness. The fetch
# itself only runs when remote_catalog_stale() is true (i.e. the last success is
# older than REMOTE_REFRESH_INTERVAL_S, or it never happened / last failed), so
# this is a cheap no-op most ticks and bounds failure retries to once per tick.
REMOTE_CATALOG_POLL_S = float(os.environ.get("OTOYIN_CATALOG_POLL_S", "3600"))

# Product registry. `id` matches the download pipeline `model_name` for
# model products. `paid` drives the license gate.
PRODUCTS: list[dict[str, Any]] = [
    # --- Free funnel (always allowed) ---
    # IDs must match model_name in backends/configs — the download pipeline
    # and license gate both resolve entitlements via this name.
    {
        "id": "kokoro-onnx",
        "name": "Kokoro 82M",
        "category": "tts",
        "price_usd": 0,
        "paid": False,
        "note": "Free 30 days, then $3 one-time",
    },
    {
        "id": "kitten-tts-mini",
        "name": "Kitten TTS",
        "category": "tts",
        "price_usd": 0,
        "paid": False,
        "note": "288MB, lightest TTS. 8 preset voices, EN only, CPU-only. Apache 2.0.",
    },
    {
        "id": "moss-tts-nano",
        "name": "MOSS TTS Nano",
        "category": "tts",
        "price_usd": 0,
        "paid": False,
        "note": "184MB GGUF via audio.cpp, zero-shot voice cloning, 20 languages. No torch needed.",
    },
    {
        "id": "demucs-int8",
        "name": "Demucs (Stem Separation)",
        "category": "music",
        "price_usd": 0,
        "paid": False,
        "note": "94MB int8 ONNX. Splits audio into vocals, drums, bass, other. No torch needed.",
    },
    {
        "id": "whisper-tiny-en",
        "name": "Whisper Tiny EN",
        "category": "stt",
        "price_usd": 0,
        "paid": False,
        "note": "75 MB — fastest, decent English accuracy",
    },
    {
        "id": "moonshine-tiny",
        "name": "Moonshine Tiny",
        "category": "stt",
        "price_usd": 0,
        "paid": False,
        "note": "35 MB Q8_0 — ultra-light English STT, 12% WER, Raspberry Pi friendly. MIT license.",
    },
    {
        "id": "whisper-base-en",
        "name": "Whisper Base EN",
        "category": "stt",
        "price_usd": 0,
        "paid": False,
        "note": "142 MB — good speed/accuracy balance",
    },
    {
        "id": "moonshine-base",
        "name": "Moonshine Base",
        "category": "stt",
        "price_usd": 0,
        "paid": False,
        "note": "74 MB Q8_0 — best balance English STT, 3.3% WER. MIT license.",
    },
    {
        "id": "moonshine-streaming-small",
        "name": "Moonshine Streaming Small",
        "category": "stt",
        "price_usd": 0,
        "paid": False,
        "note": "189 MB Q8_0 — streaming-capable English STT, 2.5% WER, beats Whisper Large v3. MIT license.",
    },
    {
        "id": "whisper-small-en",
        "name": "Whisper Small EN (faster-whisper)",
        "category": "stt",
        "price_usd": 5,
        "paid": True,
        "note": "466 MB — excellent accuracy, CTranslate2 int8, sweet spot for most users. 23 languages.",
    },
    {
        "id": "whisper-medium-en",
        "name": "Whisper Medium EN (faster-whisper)",
        "category": "stt",
        "price_usd": 12,
        "paid": True,
        "note": "1.5 GB — best EN accuracy before large, handles accented speech. CTranslate2 int8.",
    },
    {
        "id": "whisper-large-v3",
        "name": "Whisper Large-v3 (faster-whisper)",
        "category": "stt",
        "price_usd": 30,
        "paid": True,
        "note": "3.1 GB — flagship multilingual, 99 languages, CTranslate2 int8. Near-human accuracy.",
    },
    {
        "id": "whisper-large-v3-turbo",
        "name": "Whisper Large-v3-Turbo",
        "category": "stt",
        "price_usd": 20,
        "paid": True,
        "note": "1.6 GB — near-human accuracy, 99 languages, runs on CPU",
    },
    # --- Paid Fish Audio S2 Pro (GGUF, 4.56B Dual-AR, s2.cpp) — user anchor $80 overrides $91 equation ---
    {
        "id": "fish-speech-s2-pro",
        "name": "Fish Audio S2 Pro",
        "category": "tts",
        "price_usd": 80,
        "paid": True,
        "coming_soon": True,
        "note": "4.56B Dual-AR GGUF via s2.cpp, 10 languages, voice cloning, [emotion] tags. GPU (Vulkan) or large RAM. Fish Audio Research License. Coming soon — binary not shipped yet.",
    },
    {
        "id": "voxcpm2-q8",
        "name": "VoxCPM2 2B",
        "category": "tts",
        "price_usd": 40,
        "paid": True,
        "note": "2B tokenizer-free CFM diffusion AR, 30 languages, 48kHz, zero-shot voice cloning, voice design via text instructions. GGUF via CrispASR. Apache 2.0.",
    },
    # --- Paid audiocpp TTS ---
    {
        "id": "pocket-tts",
        "name": "Pocket TTS",
        "category": "tts",
        "price_usd": 8,
        "paid": True,
        "note": "380M params, $8. English, clone or pick from 26 packaged voices, runs via the audio.cpp sidecar. CC-BY-4.0.",
    },
    # --- Paid STT (equation: params_b x $20) ---
    {
        "id": "parakeet-v3-q8",
        "name": "Parakeet v3",
        "category": "stt",
        "price_usd": 12,
        "paid": True,
        "note": "0.6B params → $12. 25 European languages, auto-detect, fast on CPU. GGML Q8.",
    },
    {
        "id": "parakeet-v3-f16",
        "name": "Parakeet v3 (fast)",
        "category": "stt",
        "price_usd": 12,
        "paid": True,
        "note": "0.6B params → $12. 25 European languages, F16 quant, 220 MB, faster than Q8.",
    },
    {
        "id": "qwen3-asr-0.6b-int4",
        "name": "Qwen3 ASR 0.6B",
        "category": "stt",
        "price_usd": 12,
        "paid": True,
        "note": "0.6B params → $12. 52 languages, INT4 quant, 600 MB, CPU-friendly.",
    },
    {
        "id": "qwen3-asr-1.7b-int4",
        "name": "Qwen3 ASR 1.7B",
        "category": "stt",
        "price_usd": 34,
        "paid": True,
        "note": "1.7B params → $34. 52 languages, INT4 quant, near-cloud accuracy offline. 1.7GB.",
    },
    # --- Paid TTS ---
    {
        "id": "bark-small",
        "name": "Bark Small",
        "category": "tts",
        "price_usd": 5,
        "paid": True,
        "note": "235MB GGUF, 26 preset voices, 13 languages. MIT. CPU-friendly, no torch needed.",
    },
    {
        "id": "neutts-air-q8",
        "name": "NeuTTS-Air",
        "category": "tts",
        "price_usd": 10,
        "paid": True,
        "note": "803MB GGUF, zero-shot voice cloning, English only. Apache 2.0.",
    },
    {
        "id": "neutts-2e-orig",
        "name": "NeuTTS-2E",
        "category": "tts",
        "price_usd": 12,
        "paid": True,
        "note": "Emotion-aware TTS, 9 preset voices, English only. Single orig-precision GGUF via audio.cpp (~2.9 GB).",
    },
    {
        "id": "parler-tts-mini-gguf",
        "name": "Parler-TTS Mini",
        "category": "tts",
        "price_usd": 18,
        "paid": True,
        "note": "979MB GGUF, voice design (describe voice in natural language), English only. No torch.",
    },
    {
        "id": "qwen3-tts-1.7b",
        "name": "Qwen3-TTS 1.7B",
        "category": "tts",
        "price_usd": 40,
        "paid": True,
        "note": "2.3GB GGUF (backbone + mmproj), 10 languages, voice cloning + voice design. Apache 2.0.",
    },
    {
        "id": "orpheus-q8-0",
        "name": "Orpheus 3B",
        "category": "tts",
        "price_usd": 80,
        "paid": True,
        "note": "3B GGUF (3.7GB), SNAC decoder, 8 preset voices, emotion tags (<laugh>, <sigh>, etc). CPU-friendly, 24kHz output.",
    },
    # --- Paid VC ---
    {
        "id": "meanvc2-fp32",
        "name": "MeanVC2",
        "category": "vc",
        "price_usd": 10,
        "paid": True,
        "note": "1.55GB, zero-shot voice conversion on CPU or GPU. Apache-2.0, 110ms latency.",
    },
    {
        "id": "tone-color-vc-f16",
        "name": "Tone Color VC",
        "category": "vc",
        "price_usd": 5,
        "paid": True,
        "note": "63MB, OpenVoice V2-derived tone-color match from a reference clip. MIT license, offline.",
    },
    {
        "id": "seed-vc-mlx-q8",
        "name": "Seed-VC",
        "category": "vc",
        "price_usd": 20,
        "paid": True,
        "note": "3.0GB, zero-shot voice cloning + singing conversion. GPL-3.0 upstream - weights are user-downloaded.",
    },
    # --- New 2026-11 audiocpp catalog (migrated + additions) ---
    {
        "id": "phonon-31m-en",
        "name": "Phonon-31m-en",
        "category": "tts",
        "price_usd": 0,
        "paid": False,
        "note": "81MB, Gradium's 31M tiny English TTS, Apache-2.0, CPU-only.",
    },
    {
        "id": "inflect-micro-v2",
        "name": "Inflect Micro v2",
        "category": "tts",
        "price_usd": 0,
        "paid": False,
        "note": "69MB, owensong Inflect Micro v2 — tiny English CPU TTS, Apache-2.0. Requires eSpeak-ng.",
    },
    {
        "id": "supertonic-3",
        "name": "Supertonic 3",
        "category": "tts",
        "price_usd": 25,
        "paid": True,
        "note": "433MB, Supertone Supertonic 3 — 31 languages, 10 preset voices. Apache-2.0.",
    },
    {
        "id": "piper-en-us-lessac-medium",
        "name": "Piper",
        "category": "tts",
        "price_usd": 0,
        "paid": False,
        "note": "60MB, en-US lessac-medium voice. MIT.",
    },
    {
        "id": "chatterbox-turbo",
        "name": "Chatterbox Turbo",
        "category": "tts",
        "price_usd": 12,
        "paid": True,
        "note": "667MB, distilled 350M English TTS, MIT. Single built-in voice; 19 emotion/style tags ([laugh], [sigh], [happy], [angry], [whispering], ...).",
    },
    {
        "id": "audio8-tts-realistic",
        "name": "Audio8-TTS",
        "category": "tts",
        "price_usd": 30,
        "paid": True,
        "note": "1.4GB, 12 languages, zero-shot cloning. Apache-2.0.",
    },
    {
        "id": "cosyvoice3",
        "name": "CosyVoice3",
        "category": "tts",
        "price_usd": 30,
        "paid": True,
        "note": "2.2GB, FunAudioLLM voice clone, 10 languages. Apache-2.0.",
    },
    {
        "id": "magpie-tts-357m",
        "name": "MagpieTTS",
        "category": "tts",
        "price_usd": 18,
        "paid": True,
        "note": "1.5GB, NVIDIA MagpieTTS, 10 baked voices across 13 languages. Apache-2.0.",
    },
    {
        "id": "zonos3-mini",
        "name": "ZONOS3-Mini",
        "category": "tts",
        "price_usd": 35,
        "paid": True,
        "note": "1.1GB, Zyphra ZONOS3-Mini, Apache-2.0. 0.8B MoE (~100M active), 43 languages, zero-shot voice clone from ~5s clip.",
    },
    {
        "id": "omnivoice",
        "name": "OmniVoice",
        "category": "tts",
        "price_usd": 15,
        "paid": True,
        "note": "1.29GB, 600+ languages, zero-shot clone + voice design. CC-BY-NC-4.0.",
    },
    {
        "id": "drama-3-4bit",
        "name": "Drama-3",
        "category": "tts",
        "price_usd": 40,
        "paid": True,
        "note": "23.5GB, CUDA required. Fish Audio Community License v1.0.",
    },
    {
        "id": "yue2-3b",
        "name": "Yue2-3B",
        "category": "music",
        "price_usd": 30,
        "paid": True,
        "note": "4.3GB, lyric-conditioned music + VAE file. CC-BY-NC-4.0.",
    },
    {
        "id": "stable-audio-3-small-music",
        "name": "Stable Audio 3 Small Music",
        "category": "music",
        "price_usd": 28,
        "paid": True,
        "note": "1.6GB, Stability Community License. Text-to-music generation.",
    },
    {
        "id": "moss-soundeffect-v2",
        "name": "MOSS-SoundEffect v2",
        "category": "sfx",
        "price_usd": 25,
        "paid": True,
        "note": "3.8GB, MOSS SoundEffect v2, English/Chinese descriptions. Apache-2.0.",
    },
    # --- Paid Music ---
    {
        "id": "acestep-1-5-gguf",
        "name": "ACE-Step 1.5 1.7B",
        "category": "music",
        "price_usd": 43,
        "paid": True,
        "coming_soon": True,
        "note": "7.7GB GGUF, full song generation with vocals + instruments. CPU-friendly with Q8 quant. Coming soon — binary not shipped yet.",
    },
    {
        "id": "heartmula-3b",
        "name": "HeartMuLa 3B",
        "category": "music",
        "price_usd": 37,
        "paid": True,
        "note": "7.6GB GGUF, best-in-class lyrics music generation. 12GB+ RAM recommended.",
    },
    {
        "id": "stable-audio-3-small-sfx",
        "name": "Stable Audio 3 Small SFX",
        "category": "sfx",
        "price_usd": 25,
        "paid": True,
        "note": "1.7GB GGUF, sound effects generation (Foley, impacts, ambiences). 2.5GB+ RAM.",
    },
    # --- Paid Assistant planners (LLM) ---
    {
        "id": "planner-lfm2-2.6b",
        "name": "LFM2.5-2.6B (Free)",
        "category": "llm",
        "price_usd": 0,
        "paid": False,
        "note": "LiquidAI LFM2.5-2.6B — free multilingual planner: 128K context, 24 languages, tool calling + thinking tags. Strong multilingual reasoning at a tiny footprint.",
    },
    {
        "id": "planner-lfm2-8b-a1b",
        "name": "LFM2.5-8B-A1B ($40)",
        "category": "llm",
        "price_usd": 40,
        "paid": True,
        "note": "LiquidAI LFM2.5-8B-A1B — 8B MoE, 1.5B active per token. 128K context, 24 languages, reasoning + tool calling. Fastest in its size class.",
    },
    {
        "id": "planner-ling-tiny",
        "name": "Ling-3.0-tiny ($40)",
        "category": "llm",
        "price_usd": 40,
        "paid": True,
        "note": "inclusionAI Ling-3.0-tiny — 7.9B MoE, 1.3B active per token. 128K context, 128 routed experts, hybrid KDA/MLA reasoning.",
    },
    {
        "id": "planner-bonsai-2-27b",
        "name": "Bonsai 2 27B ($80)",
        "category": "llm",
        "price_usd": 80,
        "paid": True,
        "note": "PrismML Bonsai 2 27B — 27B ternary quantized, 5.95 GB, 98.2% of FP16 quality. Apache 2.0. Requires PrismML llama.cpp fork (TWENTYLABS_LLAMA_SERVER_BONSAI env).",
    },
    # --- Cloud LLM subscription tiers (coming soon) ---
    {
        "id": "llm-cloud-starter",
        "name": "Cloud Starter — Coming Soon ($10/mo)",
        "category": "llm",
        "price_usd": 10,
        "paid": True,
        "coming_soon": True,
        "note": "Planned cloud-hosted LLM Starter tier. No download, faster than local, subscription billing coming soon.",
    },
    {
        "id": "llm-cloud-pro",
        "name": "Cloud Pro — Coming Soon ($20/mo)",
        "category": "llm",
        "price_usd": 20,
        "paid": True,
        "coming_soon": True,
        "note": "Planned cloud-hosted LLM Pro tier. Smarter model, better reasoning, subscription billing coming soon.",
    },
    {
        "id": "llm-cloud-max",
        "name": "Cloud Max — Coming Soon ($50/mo)",
        "category": "llm",
        "price_usd": 50,
        "paid": True,
        "coming_soon": True,
        "note": "Planned cloud-hosted LLM Max tier. Top-tier model, maximum capability, subscription billing coming soon.",
    },
    # --- Free downloadable utilities (not bundled, install from Marketplace) ---
    {
        "id": "translate-en-es",
        "name": "Translate English ↔ Spanish",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-en-fr",
        "name": "Translate English ↔ French",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-en-de",
        "name": "Translate English ↔ German",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-en-ja",
        "name": "Translate English ↔ Japanese",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-en-zh",
        "name": "Translate English ↔ Chinese",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-en-pt",
        "name": "Translate English ↔ Portuguese",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-en-ru",
        "name": "Translate English ↔ Russian",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-en-ar",
        "name": "Translate English ↔ Arabic",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-en-hi",
        "name": "Translate English ↔ Hindi",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-en-it",
        "name": "Translate English ↔ Italian",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-es-en",
        "name": "Translate Spanish → English",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-fr-en",
        "name": "Translate French → English",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-de-en",
        "name": "Translate German → English",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-ja-en",
        "name": "Translate Japanese → English",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-zh-en",
        "name": "Translate Chinese → English",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-pt-en",
        "name": "Translate Portuguese → English",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-ru-en",
        "name": "Translate Russian → English",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-ar-en",
        "name": "Translate Arabic → English",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-hi-en",
        "name": "Translate Hindi → English",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-it-en",
        "name": "Translate Italian → English",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "note": "Offline translation pack. ~45 MB.",
    },
    # --- Free downloadable instruments (not bundled, install from Marketplace) ---
    {
        "id": "sf2-generaluser-gs",
        "name": "GeneralUser GS (GM + drums)",
        "category": "instruments",
        "price_usd": 0,
        "paid": False,
        "note": "261 GM presets + 13 drum kits in ~31 MB. Free for any use (S. Christian Collins). Works in studio + launcher on install.",
    },
    {
        "id": "sf2-fluid-gm",
        "name": "FluidR3 GM (classic GM + drums)",
        "category": "instruments",
        "price_usd": 0,
        "paid": False,
        "note": "Classic MIT-licensed GM bank (~142 MB) with full drum kits. Works in studio + launcher on install.",
    },
    # --- Spatial audio ---
    {
        "id": "steam-audio",
        "name": "Steam Audio SDK",
        "category": "spatial",
        "price_usd": 0,
        "paid": False,
        "note": "Bundled with Otoyin 0.1.0 (Apache-2.0 phonon.dll, ~50 MB). Binaural HRTF + occlusion out of the box; re-download restores it if deleted.",
    },
    {
        "id": "steer-tts",
        "name": "SteerTTS (WhissleAI)",
        "category": "tts",
        "price_usd": 0,
        "paid": False,
        "note": "23M params. 2,825 voices, 12 acoustic controls, style tags, voice cloning. CC BY-NC 4.0. No torch needed.",
    },
    {
        "id": "planner-lfm2-24b-a2b",
        "name": "LFM2.5-24B-A2B (MoE)",
        "category": "llm",
        "price_usd": 80,
        "paid": True,
        "note": "24B params, 2B active MoE. Q4_K_M. 14GB. Requires 8GB RAM + 4GB VRAM.",
    },
]
_PRODUCT_INDEX = {p["id"]: p for p in PRODUCTS}


def get_product(product_id: str) -> dict | None:
    """Return a product by id, or None if unknown (treated as free)."""
    return _PRODUCT_INDEX.get(product_id)


def build_catalog() -> dict:
    """Return a signed catalog document."""
    catalog = {
        "schema_version": "1.0",
        "signed_at": datetime.datetime.now(datetime.UTC).isoformat(),
        "currency": "USD",
        "products": PRODUCTS,
    }
    return sign_license(catalog)


def verify_catalog(catalog: dict) -> bool:
    """Verify the catalog signature (tamper/downgrade protection)."""
    return verify_license_signature(catalog)


# ── Remote catalog (07 Part B) ───────────────────────────────────────────

_LAST_REMOTE_REFRESH: float = 0.0
_refresh_lock = threading.Lock()


def refresh_remote_catalog() -> str:
    """Fetch + verify the signed remote catalog; swap ``PRODUCTS`` on success.

    Trust boundary: the fetched document must verify against the embedded
    marketplace public key (``licensing.verify_license_signature``). The
    marketplace service signs the full response payload (minus ``sig``) with
    its private key — see ``marketplace_server/routes/catalog.py``.

    Offline-first: any failure (no network, timeout, bad signature, malformed
    shape) keeps the bundled catalog untouched and logs at debug level.
    Returns a result code so callers can distinguish the outcome:

    - ``"refreshed"`` — a verified remote catalog was swapped in
    - ``"no_url"`` — no ``OTOYIN_CATALOG_URL`` configured (offline by design)
    - ``"failed"`` — fetch/verify/shape failure (bundled catalog kept)

    Never raises.
    """
    global _LAST_REMOTE_REFRESH, _PRODUCT_INDEX
    if not REMOTE_CATALOG_URL:
        return "no_url"
    if not _refresh_lock.acquire(blocking=False):
        return "failed"
    try:
        from ..utils.ssrf import is_url_safe

        if not is_url_safe(REMOTE_CATALOG_URL):
            logger.warning("Remote catalog URL failed SSRF check: %s", REMOTE_CATALOG_URL)
            return "failed"
        req = urllib.request.Request(
            REMOTE_CATALOG_URL,
            headers={"Accept": "application/json", "User-Agent": "otoyin/0.1"},
        )
        with urllib.request.urlopen(req, timeout=REMOTE_CATALOG_TIMEOUT_S) as resp:
            catalog = json.loads(resp.read().decode("utf-8"))
        if not isinstance(catalog, dict):
            raise ValueError("remote catalog is not an object")
        if not verify_catalog(catalog):
            logger.warning("Remote catalog failed signature verification — keeping bundled catalog")
            return "failed"
        products = catalog.get("products")
        if not isinstance(products, list) or not products:
            raise ValueError("remote catalog has no products list")
        for product in products:
            if not isinstance(product, dict) or not product.get("id"):
                raise ValueError("remote catalog contains a malformed product")
        # Swap in place so existing references to PRODUCTS see the update.
        PRODUCTS[:] = products
        _PRODUCT_INDEX = {p["id"]: p for p in products}
        _LAST_REMOTE_REFRESH = time.monotonic()
        logger.info("Swapped bundled catalog with remote catalog (%d products)", len(products))
        return "refreshed"
    except Exception:
        logger.debug("Remote catalog fetch failed; keeping bundled catalog", exc_info=True)
        return "failed"
    finally:
        _refresh_lock.release()


def remote_catalog_stale(age_s: float = REMOTE_REFRESH_INTERVAL_S) -> bool:
    """True when a configured remote catalog hasn't refreshed within ``age_s``."""
    return bool(REMOTE_CATALOG_URL) and (time.monotonic() - _LAST_REMOTE_REFRESH) > age_s


def refresh_remote_catalog_if_stale(force: bool = False) -> str:
    """Refresh the remote catalog when stale — or immediately when forced.

    Cheap when fresh: no network, no lock, ``"fresh"`` immediately. Fetches via
    ``refresh_remote_catalog()`` only when ``remote_catalog_stale()`` says the
    last successful refresh is older than ``REMOTE_REFRESH_INTERVAL_S`` — or
    never happened / last failed, since the timestamp only advances on success,
    so a failure is retried on the next poll tick rather than after a full
    interval. ``force=True`` (the manual "Check for updates" action) skips the
    staleness gate so the user can pull newly published products on demand;
    still offline-first — no configured ``OTOYIN_CATALOG_URL`` stays a no-op
    and any fetch failure keeps the bundled catalog untouched.
    Returns a result code: ``"refreshed"`` when a fresh catalog was swapped
    in, ``"fresh"`` when the stale gate skipped the fetch, ``"no_url"`` when
    no remote is configured, or ``"failed"`` when the fetch/verify failed.
    """
    if not force and not remote_catalog_stale():
        return "fresh"
    return refresh_remote_catalog()


# ── Reviews (SQLite-backed — survive restarts) ──────────────────────────


def _reviews_db():
    """Open a session for review reads/writes (caller closes)."""
    from ..database.session import SessionLocal

    factory = SessionLocal
    if factory is None:
        raise RuntimeError("Database not initialized (init_db has not run yet)")
    return factory()


def get_product_reviews(product_id: str) -> list[dict]:
    """Reviews for a product, oldest first (matches the pre-DB ordering)."""
    from ..database.models import ProductReview

    db = _reviews_db()
    try:
        rows = (
            db.query(ProductReview)
            .filter(ProductReview.product_id == product_id)
            .order_by(ProductReview.created_at.asc(), ProductReview.id.asc())
            .all()
        )
        return [
            {
                "id": r.id,
                "rating": r.rating,
                "comment": r.comment,
                "device_id": r.device_id,
                "created_at": r.created_at.isoformat() if r.created_at else "",
            }
            for r in rows
        ]
    finally:
        db.close()


def add_product_review(product_id: str, rating: int, comment: str, device_id: str) -> None:
    """Add (or update, per device) a review. One row per (product, device)
    so re-posting corrects instead of ballot-stuffing."""
    from ..database.models import ProductReview

    if not 1 <= int(rating) <= 5:
        raise ValueError("Rating must be 1-5")
    if comment is not None and len(comment) > 2000:
        raise ValueError("Comment must be at most 2000 characters")
    db = _reviews_db()
    try:
        row = (
            db.query(ProductReview)
            .filter(
                ProductReview.product_id == product_id,
                ProductReview.device_id == (device_id or ""),
            )
            .first()
        )
        if row is None:
            row = ProductReview(product_id=product_id, device_id=device_id or "")
            db.add(row)
        row.rating = int(rating)
        row.comment = (comment or "")[:2000]
        db.commit()
    finally:
        db.close()


def get_rating_summary(product_id: str) -> tuple[float | None, int]:
    """(average rating 1-5, review count) for catalog annotation."""
    summaries = get_all_rating_summaries()
    return summaries.get(product_id, (None, 0))


def get_all_rating_summaries() -> dict[str, tuple[float | None, int]]:
    """One GROUP BY query for every product's (average, count)."""
    from sqlalchemy import func

    from ..database.models import ProductReview

    db = _reviews_db()
    try:
        rows = (
            db.query(
                ProductReview.product_id,
                func.avg(ProductReview.rating),
                func.count(ProductReview.id),
            )
            .group_by(ProductReview.product_id)
            .all()
        )
        return {pid: (round(float(avg), 2), count) for pid, avg, count in rows}
    finally:
        db.close()


# ── Wishlist (in-memory, production: use DB) ───────────────────────────

_wishlists: dict[str, list[str]] = {}  # device_id → [product_ids]


def get_device_wishlist(device_id: str) -> list[str]:
    """Get wishlist product IDs for a device."""
    return _wishlists.get(device_id, [])


def add_to_wishlist(product_id: str, device_id: str) -> None:
    """Add a product to a device's wishlist."""
    if device_id not in _wishlists:
        _wishlists[device_id] = []
    if product_id not in _wishlists[device_id]:
        _wishlists[device_id].append(product_id)


def remove_from_wishlist(product_id: str, device_id: str) -> None:
    """Remove a product from a device's wishlist."""
    if device_id in _wishlists:
        _wishlists[device_id] = [pid for pid in _wishlists[device_id] if pid != product_id]
