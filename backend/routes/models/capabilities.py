"""Model capabilities endpoint."""

from .common import _safe_available, router


@router.get("/models/capabilities")
async def model_capabilities():
    """Aggregate every audio-model capability for the frontend 'About' bar.

    Reports which engines are installed/available and which stay resident, so
    the UI can show a collapsible capability overview without probing each
    backend individually.
    """
    from ...backends import (
        get_llm_backend_for_engine,
        get_stt_backend,
        get_tts_backend,
        get_vc_backend,
    )
    from ...backends.stable_audio_backend import stable_audio_backend
    from ...services.always_on import is_engine_always_on
    from ...services.noise_reduction import reduce_noise_deepfilternet
    from ...utils.model_lifecycle import lifecycle_manager

    engines = {
        "tts": {
            "label": "Text-to-Speech",
            "available": _safe_available(get_tts_backend),
            "always_on": is_engine_always_on("tts"),
        },
        "whisper": {
            "label": "Speech-to-Text (Whisper.cpp)",
            "available": _safe_available(get_stt_backend),
            "always_on": is_engine_always_on("whisper"),
        },
        "gguf_llm": {
            "label": "Local Planner LLM (GGUF / llama.cpp)",
            "available": _safe_available(lambda: get_llm_backend_for_engine("gguf_llm")),
            "always_on": is_engine_always_on("gguf_llm"),
        },
        "rvc": {
            "label": "Voice Conversion — RVC",
            "available": _safe_available(lambda: get_vc_backend("rvc")),
            "always_on": is_engine_always_on("rvc"),
        },
        "seed_vc": {
            "label": "Voice Conversion — Seed-VC",
            "available": _safe_available(lambda: get_vc_backend("seed_vc")),
            "always_on": is_engine_always_on("seed_vc"),
        },
        "stable_audio": {
            "label": "Sound Effects — Stable Audio Open",
            "available": _safe_available(lambda: stable_audio_backend),
            "always_on": is_engine_always_on("stable_audio"),
        },
        "sanitization": {
            "label": "Neural Sanitization — DeepFilterNet",
            "available": callable(reduce_noise_deepfilternet),
            "always_on": False,
            "note": "Lazy-loaded only on explicit import/cleanup request.",
        },
    }

    loaded = {name: handle.is_loaded() for name, handle in lifecycle_manager._engines.items()}

    from ...backends.gguf_server_backend import DEFAULT_MODEL_SIZE
    from ...utils.llm_context import (
        DEFAULT_MAX_CTX,
        MIN_CTX,
        compute_llm_context,
        get_model_max_ctx,
    )

    default_llm_ctx = compute_llm_context(DEFAULT_MODEL_SIZE)
    planner_sizes = ["2B", "0.8B", "4B-v3", "3B-Reasoning", "2.6B"]
    llm_context_by_size = {size: compute_llm_context(f"{size}-Q4_K_M") for size in planner_sizes}
    llm_max_by_size = {size: get_model_max_ctx(f"{size}-Q4_K_M") for size in planner_sizes}

    from ...services.settings import get_assistant_kv_quant

    kv_quant_options = ["f16", "q8_0", "q5_0", "q4_0", "q4_1"]
    kv_quant = get_assistant_kv_quant()

    return {
        "product": "otoyin",
        "offline_only": True,
        "idle_unload_seconds": lifecycle_manager.idle_timeout,
        "engines": engines,
        "loaded_now": loaded,
        "llm_context": {
            "default_model_size": DEFAULT_MODEL_SIZE,
            "current_n_ctx": default_llm_ctx,
            "min_n_ctx": MIN_CTX,
            "max_n_ctx": DEFAULT_MAX_CTX,
            "by_size": llm_context_by_size,
            "max_by_size": llm_max_by_size,
            "note": "Context window is chosen from total RAM and model size; "
            "a user override always wins and is clamped to the per-model ceiling. "
            "LFM2.5-2.6B caps at 128K; other planners can reach 256K. "
            "Generation max_tokens is capped at the active n_ctx.",
        },
        "kv_quant": {
            "current": kv_quant,
            "options": kv_quant_options,
            "note": "KV-cache quantization for the GGUF planner. Lower precision "
            "(q4_0) saves RAM at a small quality cost; f16 is highest fidelity. "
            "Applies on next model load.",
        },
    }
