"""
LLM model configs — GGUF planner models + cloud LLM subscription.
"""

from ..protocols import ModelConfig


def _get_gguf_llm_configs() -> list[ModelConfig]:
    """Return GGUF planner LLM configs.

    Lineup: Qwopus 4B (free default), Qwopus 4B v3 ($20, premium),
    LFM2.5-2.6B (free, multilingual), Spark-X 2.5-4B ($20, agentic),
    LFM2.5-8B-A1B ($40, MoE), Ling-3.0-tiny ($40, MoE),
    Bonsai 2 27B ($80, ternary quantized, requires custom llama.cpp fork).
    All run via llama.cpp server.exe (or custom fork for Bonsai).
    """
    planner_languages = [
        "en",
        "zh",
        "ja",
        "ko",
        "de",
        "fr",
        "es",
        "it",
        "pt",
        "ru",
    ]

    return [
        ModelConfig(
            model_name="planner-4b",
            display_name="Qwopus 4B (Free)",
            engine="gguf_llm",
            hf_repo_id="bartowski/Qwen3.5-4B-125B-16EF-GGUF",
            model_size="Qwen_Qwen3.5-4B-125B-16EF-Q4_K_M",
            size_mb=2740,
            min_ram_mb=3000,
            quant="Q4_K_M",
            languages=planner_languages,
            category="llm",
        ),
        ModelConfig(
            model_name="planner-4b-v3",
            display_name="Qwopus 4B v3 ($20)",
            engine="gguf_llm",
            hf_repo_id="bartowski/Qwen3.5-4B-125B-40EF-GGUF",
            model_size="Qwen_Qwen3.5-4B-125B-40EF-Q4_K_M",
            size_mb=2800,
            min_ram_mb=3000,
            quant="Q4_K_M",
            languages=planner_languages,
            category="llm",
            supports_instruct=True,
            supported_tags=["thinking", "tool_call", "json_mode"],
        ),
        ModelConfig(
            model_name="planner-spark-x-2.5-4b",
            display_name="Spark-X 2.5-4B ($20)",
            engine="gguf_llm",
            hf_repo_id="bartowski/Spark-2.5B-A3B-GGUF",
            model_size="Spark-2.5B-A3B-Q4_K_M",
            size_mb=2500,
            min_ram_mb=2800,
            quant="Q4_K_M",
            languages=planner_languages,
            category="llm",
        ),
        ModelConfig(
            model_name="planner-lfm2-2.6b",
            display_name="LFM2.5-2.6B (Free)",
            engine="gguf_llm",
            hf_repo_id="LiquidAI/LFM2.5-2.6B-GGUF",
            model_size="2.6B-Q4_0",
            size_mb=1590,
            min_ram_mb=1800,
            quant="Q4_0",
            languages=[
                *planner_languages,
                "ar",
                "hi",
                "tr",
                "vi",
                "th",
                "id",
                "ms",
                "fa",
                "he",
                "pl",
                "nl",
                "sv",
                "da",
                "no",
                "fi",
            ],
            category="llm",
            supports_instruct=True,
            supported_tags=["thinking", "tool_call", "json_mode"],
        ),
        ModelConfig(
            model_name="planner-lfm2-8b-a1b",
            display_name="LFM2.5-8B-A1B ($40)",
            engine="gguf_llm",
            hf_repo_id="LiquidAI/LFM2.5-8B-A1B-GGUF",
            model_size="8B-A1B-Q4_K_M",
            size_mb=4500,
            min_ram_mb=2000,
            quant="Q4_K_M",
            languages=[
                *planner_languages,
                "ar",
                "hi",
                "tr",
                "vi",
                "th",
                "id",
                "ms",
                "fa",
                "he",
                "pl",
                "nl",
                "sv",
                "da",
                "no",
                "fi",
            ],
            category="llm",
            supports_instruct=True,
            supported_tags=["thinking", "tool_call", "json_mode"],
            is_moe=True,
            paid=True,
        ),
        ModelConfig(
            model_name="planner-ling-tiny",
            display_name="Ling-3.0-tiny ($40)",
            engine="gguf_llm",
            hf_repo_id="inclusionAI/Ling-3.0-tiny-GGUF",
            model_size="ling-tiny-Q4_K_M",
            size_mb=4820,
            min_ram_mb=2000,
            quant="Q4_K_M",
            languages=[
                *planner_languages,
                "ar",
                "hi",
                "tr",
                "vi",
                "th",
                "id",
                "ms",
                "fa",
                "he",
                "pl",
                "nl",
                "sv",
                "da",
                "no",
                "fi",
            ],
            category="llm",
            supports_instruct=True,
            supported_tags=["thinking", "tool_call", "json_mode"],
            is_moe=True,
            paid=True,
        ),
        ModelConfig(
            model_name="planner-bonsai-2-27b",
            display_name="Bonsai 2 27B ($80)",
            engine="gguf_llm",
            hf_repo_id="prism-ml/Ternary-Bonsai-2-27B-gguf",
            model_size="27B-PTQ1_0",
            size_mb=6090,
            min_ram_mb=6500,
            quant="PTQ1_0",
            languages=[
                *planner_languages,
                "ar",
                "hi",
                "tr",
                "vi",
                "th",
                "id",
                "ms",
                "fa",
                "he",
                "pl",
                "nl",
                "sv",
                "da",
                "no",
                "fi",
            ],
            category="llm",
            supports_instruct=True,
            supported_tags=["thinking", "tool_call", "json_mode"],
            paid=True,
            custom_binary_env="TWENTYLABS_LLAMA_SERVER_BONSAI",
        ),
    ]


def _get_cloud_llm_configs() -> list[ModelConfig]:
    """Cloud LLM — coming soon, third-party routed.

    Planned tiers ($10/$20/$50) with increasing capability. Users pick a tier,
    not a specific model. Access will be gated by active subscription license.
    """
    planner_languages = [
        "en",
        "zh",
        "ja",
        "ko",
        "de",
        "fr",
        "es",
        "it",
        "pt",
        "ru",
    ]
    return [
        ModelConfig(
            model_name="llm-cloud-starter",
            display_name="Cloud Starter — Coming Soon ($10/mo)",
            engine="cloud",
            hf_repo_id="",
            model_size="cloud",
            size_mb=0,
            min_ram_mb=0,
            quant="",
            paid=False,
            category="llm",
            supports_instruct=True,
            supported_tags=["thinking", "tool_call", "json_mode"],
            languages=["*"],
        ),
        ModelConfig(
            model_name="llm-cloud-pro",
            display_name="Cloud Pro — Coming Soon ($20/mo)",
            engine="cloud",
            hf_repo_id="",
            model_size="cloud",
            size_mb=0,
            min_ram_mb=0,
            quant="",
            paid=False,
            category="llm",
            supports_instruct=True,
            supported_tags=["thinking", "tool_call", "json_mode"],
            languages=["*"],
        ),
        ModelConfig(
            model_name="llm-cloud-max",
            display_name="Cloud Max — Coming Soon ($50/mo)",
            engine="cloud",
            hf_repo_id="",
            model_size="cloud",
            size_mb=0,
            min_ram_mb=0,
            quant="",
            paid=False,
            category="llm",
            supports_instruct=True,
            supported_tags=["thinking", "tool_call", "json_mode"],
            languages=["*"],
        ),
        ModelConfig(
            model_name="planner-lfm2-24b-a2b",
            display_name="LFM2.5-24B-A2B ($80, MoE)",
            engine="gguf_llm",
            hf_repo_id="LiquidAI/LFM2.5-24B-A2B-GGUF",
            model_size="LFM2.5-24B-A2B-Q4_K_M",
            size_mb=14000,
            min_ram_mb=8000,
            min_vram_mb=4096,
            quant="Q4_K_M",
            languages=planner_languages,
            category="llm",
            supports_instruct=True,
            supported_tags=["thinking", "tool_call", "json_mode"],
            is_moe=True,
            paid=True,
        ),
    ]


def get_llm_model_configs() -> list[ModelConfig]:
    """Return all LLM model configs (GGUF + cloud)."""
    return _get_gguf_llm_configs() + _get_cloud_llm_configs()


def get_planner_configs() -> list[ModelConfig]:
    """Return local GGUF planner configs only."""
    return _get_gguf_llm_configs()


def planner_config_for_size(model_size: str) -> ModelConfig | None:
    """Return the local planner config for a resolved model size."""
    return next((c for c in _get_gguf_llm_configs() if c.model_size == model_size), None)


# Default planner size: the free Qwopus 4B. Single source of truth — every
# route, default, and pattern below must reference this, never a literal.
DEFAULT_PLANNER_SIZE = "Qwen_Qwen3.5-4B-125B-16EF-Q4_K_M"

# Pre-catalog size ids (DB rows, saved settings, old clients) mapped to their
# current catalog size. Applied at every LLM entry point so renames never
# strand stored values again.
LEGACY_PLANNER_SIZE_ALIASES: dict[str, str] = {
    "4B-Q4_K_M": DEFAULT_PLANNER_SIZE,
    "4B-v3-Q4_K_M": "Qwen_Qwen3.5-4B-125B-40EF-Q4_K_M",
    "spark-4B-Q4_K_M": "Spark-2.5B-A3B-Q4_K_M",
}


def resolve_planner_size(model_size: str | None) -> str:
    """Map a requested size through legacy aliases to its catalog size."""
    if not model_size:
        return DEFAULT_PLANNER_SIZE
    return LEGACY_PLANNER_SIZE_ALIASES.get(model_size, model_size)


def planner_size_pattern() -> str:
    """Pydantic ``pattern`` accepting catalog sizes, legacy ids, and cloud.

    Legacy ids are accepted so pre-catalog clients validate, then resolve to
    their catalog size at the route layer (``resolve_planner_size``).
    """
    import re

    sizes = (
        [c.model_size for c in _get_gguf_llm_configs() if c.model_size] + list(LEGACY_PLANNER_SIZE_ALIASES) + ["cloud"]
    )
    return "^(" + "|".join(re.escape(s) for s in sizes) + ")$"
