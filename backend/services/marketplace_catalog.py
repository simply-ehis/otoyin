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
    },
    {
        "id": "moss-tts-nano",
        "name": "MOSS-TTS-Nano",
        "category": "tts",
        "price_usd": 0,
        "paid": False,
        "quality_score": 5,
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
        "name": "Whisper Small EN",
        "category": "stt",
        "price_usd": 5,
        "paid": True,
        "quality_score": 7,
        "note": "466 MB — excellent accuracy, sweet spot for most users",
    },
    {
        "id": "whisper-medium-en",
        "name": "Whisper Medium EN",
        "category": "stt",
        "price_usd": 12,
        "paid": True,
        "quality_score": 8,
        "note": "1.5 GB — best EN accuracy before large, handles accented speech",
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
        "id": "planner-2b",
        "name": "Qwen3.5-2B (free planner)",
        "category": "llm",
        "price_usd": 0,
        "paid": False,
        "quality_score": 7,
    },
    {
        "id": "planner-0.8b",
        "name": "Qwen3.5-0.8B (free planner)",
        "category": "llm",
        "price_usd": 0,
        "paid": False,
        "quality_score": 4,
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
        "id": "styletts2-onnx",
        "name": "StyleTTS2",
        "category": "tts",
        "price_usd": 5,
        "paid": True,
        "quality_score": 6,
        "note": "263M params → $5. Same voices as StyleTTS2, torch-free via ONNX Runtime.",
    },
    {
        "id": "pocket-tts-onnx",
        "name": "Pocket-TTS",
        "category": "tts",
        "price_usd": 8,
        "paid": True,
        "quality_score": 5,
        "note": "380M params → $8. 6 languages, clone or pick presets, torch-free.",
    },
    # --- Paid STT (equation: params_b x $20) ---
    {
        "id": "parakeet-v3-q8",
        "name": "Parakeet v3 (Q8)",
        "category": "stt",
        "price_usd": 12,
        "paid": True,
        "quality_score": 8,
        "note": "0.6B params → $12. 25 European languages, auto-detect, fast on CPU.",
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
        "note": "1.7B params → $34. 52 languages, INT4 quant, near-cloud accuracy offline.",
    },
    # --- Paid TTS ---
    {"id": "bark-small", "name": "Bark Small", "category": "tts", "price_usd": 5, "paid": True, "quality_score": 4},
    {"id": "neutts-air", "name": "NeuTTS-Air", "category": "tts", "price_usd": 10, "paid": True, "quality_score": 6},
    {
        "id": "neutts-2e-q4",
        "name": "NeuTTS-2E (Q4)",
        "category": "tts",
        "price_usd": 10,
        "paid": True,
        "quality_score": 7,
    },
    {
        "id": "neutts-2e-q8",
        "name": "NeuTTS-2E (Q8)",
        "category": "tts",
        "price_usd": 15,
        "paid": True,
        "quality_score": 8,
    },
    {
        "id": "parler-tts-mini",
        "name": "Parler-TTS Mini",
        "category": "tts",
        "price_usd": 18,
        "paid": True,
        "quality_score": 6,
    },
    {"id": "zonos-v0.1", "name": "Zonos v0.1", "category": "tts", "price_usd": 32, "paid": True, "quality_score": 9},
    {
        "id": "qwen3-tts-1.7b",
        "name": "Qwen3-TTS 12Hz 1.7B Base",
        "category": "tts",
        "price_usd": 40,
        "paid": True,
        "quality_score": 8,
    },
    {
        "id": "orpheus-q4-k-m",
        "name": "Orpheus 3B (Q4)",
        "category": "vc",
        "price_usd": 50,
        "paid": True,
        "quality_score": 9,
    },
    {
        "id": "orpheus-q8-0",
        "name": "Orpheus 3B (Q8)",
        "category": "vc",
        "price_usd": 80,
        "paid": True,
        "quality_score": 10,
    },
    # --- Paid VC ---
    {
        "id": "rvc-default",
        "name": "RVC (default pack)",
        "category": "vc",
        "price_usd": 14,
        "paid": True,
        "quality_score": 5,
    },
    {
        "id": "rvc-an-v2",
        "name": "RVC Voice Pack — an-v2",
        "category": "vc",
        "price_usd": 14,
        "paid": True,
        "quality_score": 5,
    },
    {
        "id": "rvc-coconut-v2",
        "name": "RVC Voice Pack — coconut-v2",
        "category": "vc",
        "price_usd": 14,
        "paid": True,
        "quality_score": 5,
    },
    {"id": "seed-vc", "name": "Seed-VC", "category": "vc", "price_usd": 20, "paid": True, "quality_score": 8},
    {"id": "openvoice-v2", "name": "OpenVoice V2", "category": "vc", "price_usd": 10, "paid": True, "quality_score": 6},
    # --- Paid Music ---
    {
        "id": "acestep-1-5",
        "name": "ACE-Step 1.5 1.7B",
        "category": "music",
        "price_usd": 43,
        "paid": True,
        "quality_score": 9,
    },
    {
        "id": "heartmula-3b",
        "name": "HeartMuLa 3B",
        "category": "music",
        "price_usd": 37,
        "paid": True,
        "quality_score": 8,
    },
    {
        "id": "stable-audio-3-small-sfx",
        "name": "Stable Audio 3 Small SFX",
        "category": "music",
        "price_usd": 25,
        "paid": True,
        "quality_score": 7,
    },
    # --- Paid Assistant planners (LLM) ---
    {
        "id": "planner-4b-v3",
        "name": "Qwopus3.5-4B-v3 (planner)",
        "category": "llm",
        "price_usd": 40,
        "paid": True,
        "quality_score": 10,
    },
    {
        "id": "planner-ministral-3b",
        "name": "Ministral-3B (planner)",
        "category": "llm",
        "price_usd": 30,
        "paid": True,
        "quality_score": 8,
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
    # --- Free extras (pre-installed / always allowed) ---
    {
        "id": "steam-audio",
        "name": "Spatial Sound Engine (Steam Audio)",
        "category": "extras",
        "price_usd": 0,
        "paid": False,
        "quality_score": 5,
        "note": "Pre-installed. Binaural spatial audio via Steam Audio SDK.",
    },
    # --- Free extras (always allowed) ---
    {
        "id": "demucs_onnx",
        "name": "Demucs HTDemucs — Vocal Isolation",
        "category": "extras",
        "price_usd": 0,
        "paid": False,
        "quality_score": 8,
        "note": "MIT-licensed stem separation. Extracts vocals, drums, bass or other from any mix. ~316MB, runs on CPU.",
    },
    # --- Catalog gaps (G7): missing Store cards for downloadable configs ---
    {
        "id": "whisper-large-v3",
        "name": "Whisper Large-v3",
        "category": "stt",
        "price_usd": 30,
        "paid": True,
        "quality_score": 10,
        "note": "3.1 GB — flagship multilingual (faster-whisper), 99 languages.",
    },
    {
        "id": "parakeet-v3-f16",
        "name": "Parakeet v3 (F16)",
        "category": "stt",
        "price_usd": 12,
        "paid": True,
        "quality_score": 9,
        "note": "0.6B params → $12. 25 European languages, F16 quant, 220 MB.",
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
_REFRESHING = False


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
    global _LAST_REMOTE_REFRESH, _REFRESHING, _PRODUCT_INDEX
    if not REMOTE_CATALOG_URL:
        return "no_url"
    if _REFRESHING:
        return "failed"
    _REFRESHING = True
    try:
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
        _REFRESHING = False


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
