"""RAM-aware LLM context-window budget for the GGUF planner backend.

The context window (n_ctx) is chosen from total system RAM and the loaded
model size so the model never over-allocates KV cache on small machines. The
user may override the result; an override always wins and is clamped to the
supported per-model range.

The per-model ceiling comes from ``MODEL_MAX_CTX`` (the model's true context
limit). For example, LiquidAI LFM2.5-2.6B tops out at 128K, while the other
planner sizes can be pushed to 256K on capable hardware. The RAM tiers below
only decide the *default* n_ctx; the slider is allowed up to the model ceiling.

Table (model_size -> n_ctx by total RAM tier, in GB):
  2B:      >=32 -> 32768 | 16-31 -> 24576 | 8-15 -> 16384 | 4-7 -> 8192
  4B/3B:   >=32 -> 24576 | 16-31 -> 16384 | 8-15  -> 8192 | 4-7 -> 4096
  0.8B:    >=16 -> 32768 | 8-15  -> 24576 | 4-7  -> 16384
  <4GB:    extrapolate (2GB -> 4096, floor 4096)
"""

from __future__ import annotations

MIN_CTX = 4096
DEFAULT_MAX_CTX = 32768

# Per-size context ceilings (model_size prefix -> tokens). Override the global
# 32K cap so models with larger native windows can be pushed further by the
# user. LFM2.5-2.6B caps at its 128K native window; the rest reach 256K.
MODEL_MAX_CTX: dict[str, int] = {
    "2.6B": 131072,  # LiquidAI LFM2.5-2.6B native window
    "2B": 262144,
    "4B": 262144,
    "3B": 262144,
    "0.8B": 262144,
    "8B-A1B": 131072,  # LiquidAI LFM2.5-8B-A1B native window
    "ling-tiny": 131072,  # inclusionAI Ling-3.0-tiny native window
    "27B": 262144,  # PrismML Bonsai 2 27B (Qwen3.8-27B base, 262K native)
}

# Per-size RAM tiers: (size_label, [(min_ram_gb, n_ctx), ...]) in ascending
# RAM order; the first tier whose min_ram_gb <= total is used.
_SIZE_RAM_TIERS: dict[str, list[tuple[int, int]]] = {
    "2B": [(4, 8192), (8, 16384), (16, 24576), (32, 32768)],
    "2.6B": [(4, 8192), (8, 16384), (16, 24576), (32, 32768)],
    "0.8B": [(4, 16384), (8, 24576), (16, 32768)],
    "4B": [(4, 4096), (8, 8192), (16, 16384), (32, 24576)],
    "3B": [(4, 4096), (8, 8192), (16, 16384), (32, 24576)],
    "8B-A1B": [(8, 8192), (16, 16384), (32, 32768)],
    "ling-tiny": [(8, 8192), (16, 16384), (32, 32768)],
    "27B": [(8, 4096), (16, 8192), (32, 16384), (64, 32768)],
}


def _total_ram_gb() -> int:
    import psutil

    return round(psutil.virtual_memory().total / (1024**3))


def _sub_4gb_tier(total_gb: int) -> int:
    """Extrapolate for machines with <4GB RAM: 2GB -> 4096, floor 4096."""
    if total_gb <= 0:
        return MIN_CTX
    if total_gb >= 2:
        return 4096
    return MIN_CTX


def _resolve_size_label(model_size: str) -> str:
    """Extract the bare size label from a model size id.

    Handles both legacy ids (``4B-Q4_K_M`` → ``4B``) and catalog ids
    (``Qwen_Qwen3.5-4B-125B-16EF-Q4_K_M`` → ``4B``). Longer, more specific
    labels match first so ``8B-A1B`` wins over ``4B``-style fragments.
    """
    for label in (
        "8B-A1B",
        "ling-tiny",
        "2.6B",
        "27B",
        "0.8B",
        "4B",
        "3B",
        "2B",
    ):
        if label in model_size:
            return label
    return model_size.split("-")[0]


def get_model_max_ctx(model_size: str) -> int:
    """Return the per-model context ceiling in tokens.

    Falls back to ``DEFAULT_MAX_CTX`` for unknown sizes so existing models keep
    their historical 32K slider ceiling.
    """
    return MODEL_MAX_CTX.get(_resolve_size_label(model_size), DEFAULT_MAX_CTX)


def clamp_n_ctx(value: int, model_size: str = "") -> int:
    """Clamp an n_ctx to [MIN_CTX, model_max] for the given model."""
    return max(MIN_CTX, min(get_model_max_ctx(model_size), int(value)))


def compute_llm_context(
    model_size: str,
    total_ram_gb: int | None = None,
    override: int | None = None,
) -> int:
    """Return the n_ctx to load for a model, RAM-aware.

    ``override`` (user setting) always wins after clamping to the per-model
    range. The default (no override) is chosen from total RAM via the size
    tiers, then clamped to the model ceiling.
    """
    if override is not None:
        return clamp_n_ctx(override, model_size)

    total = total_ram_gb if total_ram_gb is not None else _total_ram_gb()
    if total < 4:
        return clamp_n_ctx(_sub_4gb_tier(total), model_size)

    size = _resolve_size_label(model_size)
    tiers = _SIZE_RAM_TIERS.get(size)
    if not tiers:
        return clamp_n_ctx(8192, model_size)
    chosen = tiers[0][1]
    for min_ram, n_ctx in tiers:
        if total >= min_ram:
            chosen = n_ctx
    return clamp_n_ctx(chosen, model_size)


def compute_moe_stream_cache_gb(
    model_size_mb: int,
    total_ram_gb: int | None = None,
) -> int:
    """Suggest an MoE expert-streaming cache size in GB.

    Returns 0 when streaming is not needed (dense model or insufficient RAM).

    Strategy: reserve half the surplus RAM (total minus model footprint) for
    the expert cache, capped at 16 GB.  On a 32 GB machine loading a 14 GB
    MoE model the surplus is 18 GB → cache = 9 GB.  On 16 GB with a 4 GB
    model the surplus is 12 GB → cache = 6 GB.  Below 4 GB surplus the
    feature is disabled because the OS page cache alone handles the working
    set.
    """
    total = total_ram_gb if total_ram_gb is not None else _total_ram_gb()
    model_gb = model_size_mb / 1024
    surplus = total - model_gb
    if surplus < 4:
        return 0
    suggested = int(surplus // 2)
    return min(suggested, 16)
