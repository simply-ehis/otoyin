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
    # quality_score: 1-10 rating within the product's category.
    # IDs must match model_name in backends/configs — the download pipeline
    # and license gate both resolve entitlements via this name.
    {
        "id": "kokoro-onnx",
        "name": "Kokoro 82M",
        "category": "tts",
        "price_usd": 0,
        "paid": False,
        "quality_score": 10,
        "note": "Free 30 days, then $3 one-time",
    },
    {
        "id": "kitten-tts-mini",
        "name": "KittenTTS mini",
        "category": "tts",
        "price_usd": 0,
        "paid": False,
        "quality_score": 3,
        "note": "80MB, lightest TTS. 8 preset voices, EN only, CPU-only. Apache 2.0.",
    },
    {
        "id": "moss-tts-nano",
        "name": "MOSS-TTS-Nano",
        "category": "tts",
        "price_usd": 0,
        "paid": False,
        "quality_score": 5,
        "note": "763MB ONNX, zero-shot voice cloning, 20 languages. No torch needed.",
    },
    {
        "id": "whisper-tiny-en",
        "name": "Whisper Tiny EN",
        "category": "stt",
        "price_usd": 0,
        "paid": False,
        "quality_score": 3,
        "note": "75 MB — fastest, decent English accuracy",
    },
    {
        "id": "whisper-base-en",
        "name": "Whisper Base EN",
        "category": "stt",
        "price_usd": 0,
        "paid": False,
        "quality_score": 5,
        "note": "142 MB — good speed/accuracy balance",
    },
    {
        "id": "whisper-small-en",
        "name": "Whisper Small EN (faster-whisper)",
        "category": "stt",
        "price_usd": 5,
        "paid": True,
        "quality_score": 7,
        "note": "466 MB — excellent accuracy, CTranslate2 int8, sweet spot for most users. 23 languages.",
    },
    {
        "id": "whisper-medium-en",
        "name": "Whisper Medium EN (faster-whisper)",
        "category": "stt",
        "price_usd": 12,
        "paid": True,
        "quality_score": 8,
        "note": "1.5 GB — best EN accuracy before large, handles accented speech. CTranslate2 int8.",
    },
    {
        "id": "whisper-large-v3",
        "name": "Whisper Large-v3 (faster-whisper)",
        "category": "stt",
        "price_usd": 30,
        "paid": True,
        "quality_score": 10,
        "note": "3.1 GB — flagship multilingual, 99 languages, CTranslate2 int8. Near-human accuracy.",
    },
    {
        "id": "whisper-large-v3-turbo",
        "name": "Whisper Large-v3-Turbo",
        "category": "stt",
        "price_usd": 20,
        "paid": True,
        "quality_score": 10,
        "note": "1.6 GB — near-human accuracy, 99 languages, runs on CPU",
    },
    {
        "id": "planner-4b",
        "name": "Qwen3.5-4B (free planner)",
        "category": "llm",
        "price_usd": 0,
        "paid": False,
        "quality_score": 7,
        "note": "Unsloth Qwen3.5-4B — free premium planner. Strong all-rounder for reasoning, tool calling, and multi-step workflows. 2.7GB, needs 3.5GB+ RAM.",
    },
    {
        "id": "planner-0.8b",
        "name": "Qwen3.5-0.8B (free planner)",
        "category": "llm",
        "price_usd": 0,
        "paid": False,
        "quality_score": 4,
        "note": "Ultra-lightweight 0.8B fallback — runs on any device with <1GB RAM. Good enough for simple tool calls and quick responses when larger models aren't available.",
    },
    {
        "id": "planner-4b",
        "name": "Qwen3.5-4B (free planner)",
        "category": "llm",
        "price_usd": 0,
        "paid": False,
        "quality_score": 7,
        "note": "Unsloth Qwen3.5-4B — free premium planner. Strong all-rounder for reasoning, tool calling, and multi-step workflows. 2.7GB, needs 3.5GB+ RAM.",
    },
    {
        "id": "planner-lfm2-2.6b",
        "name": "LiquidAI LFM2-2.6B (free planner)",
        "category": "llm",
        "price_usd": 0,
        "paid": False,
        "quality_score": 10,
        "note": "LiquidAI's latest 2.6B — 128K context, 24 languages, tool calling + thinking tags. Free, top-quality planner for capable devices.",
    },
    # --- Paid Fish Audio S2 Pro (GGUF, 4.56B Dual-AR, s2.cpp) — user anchor $80 overrides $91 equation ---
    {
        "id": "fish-speech-s2-pro",
        "name": "Fish Audio S2 Pro",
        "category": "tts",
        "price_usd": 80,
        "paid": True,
        "quality_score": 10,
        "note": "4.56B Dual-AR GGUF via s2.cpp, 10 languages, voice cloning, [emotion] tags. GPU (Vulkan) or large RAM. Fish Audio Research License.",
    },
    # --- Paid ONNX TTS (equation: params_b x $20) ---
    {
        "id": "pocket-tts-onnx",
        "name": "Pocket-TTS ONNX",
        "category": "tts",
        "price_usd": 8,
        "paid": True,
        "quality_score": 5,
        "note": "380M params → $8. 6 languages, clone or pick presets, torch-free ONNX. CPU-only.",
    },
    {
        "id": "pocket-tts",
        "name": "Pocket-TTS (torch)",
        "category": "tts",
        "price_usd": 8,
        "paid": True,
        "quality_score": 5,
        "note": "380M params → $8. 6 languages, clone or pick presets. Requires PyTorch. CC-BY-4.0.",
    },
    # --- Paid STT (equation: params_b x $20) ---
    {
        "id": "parakeet-v3-q8",
        "name": "Parakeet v3 (Q8)",
        "category": "stt",
        "price_usd": 12,
        "paid": True,
        "quality_score": 8,
        "note": "0.6B params → $12. 25 European languages, auto-detect, fast on CPU. GGML Q8.",
    },
    {
        "id": "parakeet-v3-f16",
        "name": "Parakeet v3 (F16)",
        "category": "stt",
        "price_usd": 12,
        "paid": True,
        "quality_score": 9,
        "note": "0.6B params → $12. 25 European languages, F16 quant, 220 MB, faster than Q8.",
    },
    {
        "id": "qwen3-asr-0.6b-int4",
        "name": "Qwen3 ASR 0.6B",
        "category": "stt",
        "price_usd": 12,
        "paid": True,
        "quality_score": 8,
        "note": "0.6B params → $12. 52 languages, INT4 quant, 600 MB, CPU-friendly.",
    },
    {
        "id": "qwen3-asr-1.7b-int4",
        "name": "Qwen3 ASR 1.7B",
        "category": "stt",
        "price_usd": 34,
        "paid": True,
        "quality_score": 10,
        "note": "1.7B params → $34. 52 languages, INT4 quant, near-cloud accuracy offline. 1.7GB.",
    },
    # --- Cloud STT/VC (BYOK, no local weights) ---
    {"id": "stt-cloud", "name": "Cloud STT (BYOK)", "category": "stt", "price_usd": 0, "paid": False, "quality_score": 0, "note": "Bring your own API key. No local download."},
    {"id": "vc-cloud", "name": "Cloud VC (BYOK)", "category": "vc", "price_usd": 0, "paid": False, "quality_score": 0, "note": "Bring your own API key. No local download."},
    # --- Paid TTS ---
    {"id": "bark-small", "name": "Bark Small", "category": "tts", "price_usd": 5, "paid": True, "quality_score": 4, "note": "235MB GGUF, 26 preset voices, 13 languages. MIT. CPU-friendly, no torch needed."},
    {"id": "neutts-air-q8", "name": "NeuTTS-Air (Q8)", "category": "tts", "price_usd": 10, "paid": True, "quality_score": 6, "note": "803MB GGUF, zero-shot voice cloning, English only. Apache 2.0."},
    {
        "id": "neutts-2e-q4",
        "name": "NeuTTS-2E (Q4)",
        "category": "tts",
        "price_usd": 10,
        "paid": True,
        "quality_score": 7,
        "note": "Emotion-aware TTS, 4 preset speakers, English only. Q4 quantized GGUF.",
    },
    {
        "id": "neutts-2e-q8",
        "name": "NeuTTS-2E (Q8)",
        "category": "tts",
        "price_usd": 15,
        "paid": True,
        "quality_score": 8,
        "note": "Emotion-aware TTS, 4 preset speakers, English only. Q8 GGUF, higher quality than Q4.",
    },
    {
        "id": "parler-tts-mini-gguf",
        "name": "Parler-TTS Mini (GGUF)",
        "category": "tts",
        "price_usd": 18,
        "paid": True,
        "quality_score": 6,
        "note": "979MB GGUF, voice design (describe voice in natural language), English only. No torch.",
    },
    {
        "id": "zonos-v0.1-gguf",
        "name": "Zonos v0.1 (GGUF)",
        "category": "tts",
        "price_usd": 32,
        "paid": True,
        "quality_score": 9,
        "note": "1.7GB GGUF, zero-shot voice cloning, emotion control, English only. High fidelity.",
    },
    {
        "id": "qwen3-tts-1.7b",
        "name": "Qwen3-TTS 12Hz 1.7B Base (GGUF)",
        "category": "tts",
        "price_usd": 40,
        "paid": True,
        "quality_score": 9,
        "note": "2.3GB GGUF (backbone + mmproj), 10 languages, voice cloning + voice design. Apache 2.0.",
    },
    {
        "id": "orpheus-q8-0",
        "name": "Orpheus 3B (Q8_0)",
        "category": "tts",
        "price_usd": 80,
        "paid": True,
        "quality_score": 10,
        "note": "3B GGUF (3.7GB), SNAC decoder, 8 preset voices, emotion tags (<laugh>, <sigh>, etc). CPU-friendly, 24kHz output.",
    },
    # --- Paid VC ---
    {
        "id": "rvc-onnx-default",
        "name": "RVC ONNX (default pack)",
        "category": "vc",
        "price_usd": 14,
        "paid": True,
        "quality_score": 5,
    },
    {
        "id": "rvc-onnx-an-v2",
        "name": "RVC ONNX Voice Pack — an-v2",
        "category": "vc",
        "price_usd": 14,
        "paid": True,
        "quality_score": 5,
    },
    {
        "id": "rvc-onnx-coconut-v2",
        "name": "RVC ONNX Voice Pack — coconut-v2",
        "category": "vc",
        "price_usd": 14,
        "paid": True,
        "quality_score": 5,
    },
    {"id": "seed-vc", "name": "Seed-VC", "category": "vc", "price_usd": 20, "paid": True, "quality_score": 8, "note": "1.5GB, zero-shot voice cloning from reference audio. GPU required. High fidelity conversion."},
    {"id": "openvoice-onnx-v2", "name": "OpenVoice V2 ONNX", "category": "vc", "price_usd": 10, "paid": True, "quality_score": 6, "note": "161MB, tone-color conversion, no torch. Fast CPU inference. MIT license."},
    # --- Paid Music ---
    {
        "id": "acestep-1-5-gguf",
        "name": "ACE-Step 1.5 1.7B",
        "category": "music",
        "price_usd": 43,
        "paid": True,
        "quality_score": 9,
        "note": "7.7GB GGUF, full song generation with vocals + instruments. CPU-friendly with Q8 quant.",
    },
    {
        "id": "heartmula-3b",
        "name": "HeartMuLa 3B",
        "category": "music",
        "price_usd": 37,
        "paid": True,
        "quality_score": 8,
        "note": "7.6GB GGUF, best-in-class lyrics music generation. 12GB+ RAM recommended.",
    },
    {
        "id": "stable-audio-3-small-sfx",
        "name": "Stable Audio 3 Small SFX",
        "category": "music",
        "price_usd": 25,
        "paid": True,
        "quality_score": 7,
        "note": "1.7GB GGUF, sound effects generation (Foley, impacts, ambiences). 2.5GB+ RAM.",
    },
    {"id": "music-cloud", "name": "Cloud Music (BYOK)", "category": "music", "price_usd": 0, "paid": False, "quality_score": 0, "note": "Bring your own API key. No local download."},
    # --- Paid Assistant planners (LLM) ---
    {
        "id": "planner-4b-v3",
        "name": "Qwopus3.5-4B-v3 (planner)",
        "category": "llm",
        "price_usd": 40,
        "paid": True,
        "quality_score": 10,
        "note": "Claude-distilled 4B planner. Premium tier — highest-quality reasoning and tool calling for complex multi-step workflows.",
    },
    {
        "id": "planner-lfm2-2.6b-qad",
        "name": "LFM2.5-2.6B QAD-Q4_0 (planner)",
        "category": "llm",
        "price_usd": 13,
        "paid": True,
        "quality_score": 9,
        "special_offer": True,
        "note": "Limited-time special offer — LiquidAI LFM2.5-2.6B with Quantization-Aware-Distillation 4-bit weights (1.59 GB). 128K context, 24 languages, tool calling + thinking tags.",
    },
    {
        "id": "planner-minicpm5-2b",
        "name": "MiniCPM5-2B (planner)",
        "category": "llm",
        "price_usd": 5,
        "paid": True,
        "quality_score": 9,
        "special_offer": True,
        "note": "PROMO — normally $20. OpenBMB's 2B SOTA: competes with 4B-class models. RL + On-Policy Distillation from 16 expert teachers. 128K context, strong at code (LiveCodeBench 69.1%), math (AIME 86.5%), agentic tasks (SWE-bench 46.4%). Apache 2.0.",
    },
    {
        "id": "planner-spark-x-2.5-4b",
        "name": "Spark-X 2.5-4B (planner)",
        "category": "llm",
        "price_usd": 40,
        "paid": True,
        "quality_score": 9,
        "note": "iFLYTEK's 4B agentic king — 1M native context, 200+ languages. Beats Qwen3.5-9B on τ³-bench (30.4 vs 9.3), BrowseComp (40.9 vs 8.3), SWE-Bench Pro (44.4 vs 33.8). Hybrid sliding-window attention. Apache 2.0.",
    },
    {
        "id": "planner-qwen3-8-27b",
        "name": "Qwen3.8-27B (planner)",
        "category": "llm",
        "price_usd": 5,
        "paid": True,
        "quality_score": 9,
        "note": "Alibaba's flagship dense 27B — native vision-language model, 262K context (extensible to 1M). Gated DeltaNet + Attention hybrid architecture. Top-tier at coding, professional work, research, and long-horizon agentic tasks.",
    },
    # --- Free downloadable utilities (not bundled, install from Marketplace) ---
    {
        "id": "demucs_onnx",
        "name": "Demucs HTDemucs — Vocal Isolation",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "quality_score": 8,
        "note": "MIT-licensed stem separation. Extracts vocals, drums, bass or other from any mix. ~316MB, runs on CPU.",
    },
    {
        "id": "translate-en-es",
        "name": "Translate English ↔ Spanish",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "quality_score": 8,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-en-fr",
        "name": "Translate English ↔ French",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "quality_score": 8,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-en-de",
        "name": "Translate English ↔ German",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "quality_score": 8,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-en-ja",
        "name": "Translate English ↔ Japanese",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "quality_score": 8,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-en-zh",
        "name": "Translate English ↔ Chinese",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "quality_score": 8,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-en-pt",
        "name": "Translate English ↔ Portuguese",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "quality_score": 8,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-en-ru",
        "name": "Translate English ↔ Russian",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "quality_score": 8,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-en-ar",
        "name": "Translate English ↔ Arabic",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "quality_score": 8,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-en-hi",
        "name": "Translate English ↔ Hindi",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "quality_score": 8,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-en-it",
        "name": "Translate English ↔ Italian",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "quality_score": 8,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-es-en",
        "name": "Translate Spanish → English",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "quality_score": 8,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-fr-en",
        "name": "Translate French → English",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "quality_score": 8,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-de-en",
        "name": "Translate German → English",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "quality_score": 8,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-ja-en",
        "name": "Translate Japanese → English",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "quality_score": 8,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-zh-en",
        "name": "Translate Chinese → English",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "quality_score": 8,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-pt-en",
        "name": "Translate Portuguese → English",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "quality_score": 8,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-ru-en",
        "name": "Translate Russian → English",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "quality_score": 8,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-ar-en",
        "name": "Translate Arabic → English",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "quality_score": 8,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-hi-en",
        "name": "Translate Hindi → English",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "quality_score": 8,
        "note": "Offline translation pack. ~45 MB.",
    },
    {
        "id": "translate-it-en",
        "name": "Translate Italian → English",
        "category": "utilities",
        "price_usd": 0,
        "paid": False,
        "quality_score": 8,
        "note": "Offline translation pack. ~45 MB.",
    },
    # --- Spatial audio ---
    {
        "id": "steam-audio",
        "name": "Steam Audio SDK",
        "category": "spatial",
        "price_usd": 0,
        "paid": False,
        "quality_score": 5,
        "note": "10MB. Binaural rendering, HRTF, occlusion. Free download — requires phonon.dll on disk.",
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


# ── Reviews (in-memory, production: use DB) ────────────────────────────

_reviews: dict[str, list[dict]] = {}


def get_product_reviews(product_id: str) -> list[dict]:
    """Get reviews for a product."""
    return _reviews.get(product_id, [])


def add_product_review(product_id: str, rating: int, comment: str, device_id: str) -> None:
    """Add a review for a product."""
    if product_id not in _reviews:
        _reviews[product_id] = []
    _reviews[product_id].append(
        {
            "id": len(_reviews[product_id]) + 1,
            "rating": rating,
            "comment": comment,
            "device_id": device_id,
            "created_at": datetime.datetime.now(datetime.UTC).isoformat(),
        }
    )


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
