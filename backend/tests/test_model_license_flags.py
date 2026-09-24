from backend.backends.configs import get_all_model_configs
from backend.models.health import ModelStatus
from backend.routes.models.status import _build_model_status


def _config(model_name: str):
    return next(cfg for cfg in get_all_model_configs() if cfg.model_name == model_name)


def _status(cfg) -> ModelStatus:
    return _build_model_status(
        {
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
            "structured_preset_voices": cfg.structured_preset_voices,
            "supports_voice_mixing": cfg.supports_voice_mixing,
            "license_id": cfg.license_id,
            "license_note": cfg.license_note,
            "commercial_use": cfg.commercial_use,
            "category": cfg.category,
        },
        downloaded=False,
        is_downloading=False,
        size_mb=None,
        loaded=False,
        entitled=False,
    )


def test_fish_license_is_visible_and_non_commercial():
    status = _status(_config("fish-speech-s2-pro"))
    assert status.license_id == "fish-audio-research"
    assert status.commercial_use is False
    assert status.license_note


def test_pocket_license_is_visible():
    status = _status(_config("pocket-tts"))
    assert status.license_id == "cc-by-4.0"
    assert status.commercial_use is True
