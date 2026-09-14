"""Marketplace listing content rules (spec §3).

Locks the structured-description contract so catalog edits can't regress it:
- Display names carry no quantization/porting tokens (Q4, GGUF, ONNX, …) —
  that trivia belongs in the Technical details section, not the headline.
  (A "(PyTorch)"-style runtime requirement is allowed: it tells the user
  what must be installed, not how the weights were packed.)
- Every listing has pitch text (what it's good at + why download it).
- The /models/status surface exposes ``quant`` so the storefront's
  Technical details section can show it without scraping names.
"""

from __future__ import annotations

import re

import pytest

from backend.services.marketplace_catalog import PRODUCTS

# Quantization / weight-porting tokens banned from display names.
_TECH_TOKENS = re.compile(r"\b(Q\d[\w_]*|GGUF|ONNX|INT\d|FP16|F16|QAD|QUANT)\b", re.IGNORECASE)


def test_display_names_have_no_quant_tokens():
    offenders = {p["id"]: p["name"] for p in PRODUCTS if _TECH_TOKENS.search(str(p.get("name", "")))}
    assert not offenders, f"quant/porting tokens in display names: {offenders}"


def test_every_product_has_pitch_text():
    missing = [
        p["id"]
        for p in PRODUCTS
        if not (p.get("long_description") or p.get("description") or p.get("note"))
    ]
    assert not missing, f"products with no pitch text: {missing}"


def test_status_surface_exposes_quant():
    """quant flows registry config → /models/status → storefront details."""
    from backend.backends import get_model_config
    from backend.routes.models.status import _build_model_status

    cfg = get_model_config("kokoro-onnx")
    assert cfg is not None and cfg.quant, "fixture assumption: kokoro-onnx has a quant tag"
    config_dict = {
        "model_name": cfg.model_name,
        "display_name": cfg.display_name,
        "engine": cfg.engine,
        "hf_repo_id": cfg.hf_repo_id,
        "model_size": cfg.model_size,
        "quant": cfg.quant,
        "gpu_only": cfg.gpu_only,
        "clone_voice": cfg.clone_voice,
        "emotion_control": cfg.emotion_control,
        "supports_instruct": cfg.supports_instruct,
        "paralinguistic_tags": cfg.paralinguistic_tags,
        "voice_design": cfg.voice_design,
        "supports_editing": cfg.supports_editing,
        "supported_tags": cfg.supported_tags,
        "structured_preset_voices": [],
        "supports_voice_mixing": cfg.supports_voice_mixing,
        "quality_score": cfg.quality_score,
        "category": cfg.category,
    }
    status = _build_model_status(config_dict, False, False, None, False, False)
    assert status.quant == cfg.quant
    assert status.model_size == cfg.model_size


@pytest.mark.parametrize("product_id", ["pocket-tts-onnx", "neutts-2e-q4", "neutts-2e-q8"])
def test_variant_pairs_stay_distinguishable(product_id):
    """Renamed headlines must still tell variants apart (ids are stable)."""
    from backend.services.marketplace_catalog import get_product

    names = {
        "pocket-tts-onnx": "Pocket-TTS",
        "neutts-2e-q4": "NeuTTS-2E",
        "neutts-2e-q8": "NeuTTS-2E (high fidelity)",
    }
    assert get_product(product_id)["name"] == names[product_id]
