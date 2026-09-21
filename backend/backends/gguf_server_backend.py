"""Local GGUF assistant planner backend via llama.cpp ``server`` (OpenAI-compatible).

Replaces the llama-cpp-python LFM backend. The planner stack:

    Qwopus 4B            (free default planner)
    Qwopus 4B v3         (paid planner, $20)
    Spark-X 2.5-4B       (paid planner, $20)
    LFM2.5-2.6B          (paid planner, $13)
    LFM2.5-8B-A1B        (paid MoE planner, $40)
    Ling-3.0-tiny        (paid MoE planner, $40)
    Bonsai 2 27B         (paid planner, $80, requires PrismML fork)
    Cloud Starter        (cloud subscription, $10/mo)
    Cloud Pro            (cloud subscription, $20/mo)
    Cloud Max            (cloud subscription, $50/mo)

All models are GGUF served by one native ``llama-server`` process spawned as
a sidecar on a free localhost port. The backend keeps the same public surface
as the old LFM backend (``is_loaded`` / ``load_model`` / ``unload_model`` /
``generate`` / ``load_error`` / ``_is_model_cached``) so callers did not change.

The server binary is resolved in order: ``TWENTYLABS_LLAMA_SERVER`` env,
``data/models/llama-server.exe`` (bundled sidecar), then PATH. If absent,
loads fail with a clear ``load_error`` surfaced by ``GET /llm/status``.
"""

import asyncio
import logging
import os
from pathlib import Path

from ..utils.llm_context import MIN_CTX as MIN_GEN_TOKENS
from . import DEFAULT_LLM_TEMPERATURE
from .base import BackendBase
from .gguf_runner import GGUFServerProcess

logger = logging.getLogger(__name__)

# model_size -> (HF repo, quant tag, is_moe)
GGUF_MODELS: dict[str, tuple[str, str, bool]] = {
    "4B-Q4_K_M": ("unsloth/Qwen3.5-4B-GGUF", "q4_k_m", False),
    "4B-v3-Q4_K_M": ("Jackrong/Qwopus3.5-4B-v3-GGUF", "q4_k_m", False),
    "spark-4B-Q4_K_M": ("XHToken/Spark-X2.5-4B-GGUF", "q4_k_m", False),
    "2.6B-Q4_0": ("LiquidAI/LFM2.5-2.6B-GGUF", "q4_0", False),
    "8B-A1B-Q4_K_M": ("LiquidAI/LFM2.5-8B-A1B-GGUF", "q4_k_m", True),
    "ling-tiny-Q4_K_M": ("inclusionAI/Ling-3.0-tiny-GGUF", "q4_k_m", True),
    "27B-PTQ1_0": ("prism-ml/Ternary-Bonsai-2-27B-gguf", "PTQ1_0", False),
}

DEFAULT_MODEL_SIZE = "4B-Q4_K_M"

# Extra GGUF artifacts in the repos that are not the model weights.
_EXCLUDED_GGUF_TAGS = ("mmproj", "mtp", "imatrix", "embedding", "encoder")


def _resolve_gguf_filename(repo_id: str, quant_tag: str) -> str:
    """Find the single quantized GGUF in a repo, never a whole snapshot.

    The jackrong repos carry multiple quants plus mmproj/MTP artifacts; we
    list the repo and pick the one file matching the quant tag, excluding
    non-weight artifacts.
    """
    import concurrent.futures

    from huggingface_hub import list_repo_files

    # list_repo_files has no built-in timeout; wrap it so a slow HF API
    # response doesn't block the download executor indefinitely.
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(list_repo_files, repo_id)
        try:
            files = future.result(timeout=30)
        except concurrent.futures.TimeoutError:
            raise TimeoutError(
                f"HuggingFace API timed out listing files in {repo_id} — check your network connection and retry."
            ) from None
    candidates = [
        f
        for f in files
        if f.endswith(".gguf")
        and not any(tag in f.lower() for tag in _EXCLUDED_GGUF_TAGS)
        and quant_tag.lower() in f.lower()
    ]
    if candidates:
        if len(candidates) > 1:
            logger.debug("Multiple GGUF matches in %s, using first: %s", repo_id, candidates)
        return candidates[0]
    fallback = [f for f in files if f.endswith(".gguf") and not any(tag in f.lower() for tag in _EXCLUDED_GGUF_TAGS)]
    if fallback:
        logger.warning("No %s quant in %s; falling back to %s", quant_tag, repo_id, fallback[0])
        return fallback[0]
    raise FileNotFoundError(f"No GGUF model files found in repo {repo_id}")


def _build_messages(
    prompt: str,
    system: str | None,
    examples: list[tuple[str, str]] | None = None,
) -> list[dict]:
    messages: list[dict] = []
    if system:
        messages.append({"role": "system", "content": system})
    if examples:
        for user_text, assistant_text in examples:
            messages.append({"role": "user", "content": user_text})
            messages.append({"role": "assistant", "content": assistant_text})
    messages.append({"role": "user", "content": prompt})
    return messages


def _normalize_history(chat_messages: list[dict], system: str | None) -> list[dict]:
    """Flatten a full conversation history into chat messages.

    Accepts the assistant-tool-call message shape (``role``/``content``/
    ``tool_calls``/``tool_call_id``/``name``) so the planner can see prior
    user/assistant/tool turns during a tool loop. A system prompt is
    prepended unless the first message is already a system role.
    """
    out: list[dict] = []
    if system:
        out.append({"role": "system", "content": system})
    for m in chat_messages:
        role = m.get("role")
        if role == "system" and system:
            continue
        msg = {"role": role, "content": m.get("content") or ""}
        if role == "assistant" and m.get("tool_calls"):
            msg["tool_calls"] = m["tool_calls"]
        if role == "tool":
            msg["tool_call_id"] = m.get("tool_call_id", "")
            if m.get("name"):
                msg["name"] = m["name"]
        out.append(msg)
    return out


class GGUFServerLLMBackend(BackendBase):
    """Planner LLM backend: GGUF via a spawned llama.cpp server sidecar."""

    _model_attr = "_server"

    def __init__(self, model_size: str = DEFAULT_MODEL_SIZE):
        self.model_size = model_size
        self._current_model_size: str | None = None
        self._server: GGUFServerProcess | None = None
        self._port: int | None = None
        self.n_ctx: int = 4096
        self.kv_quant: str = "q8_0"
        self.gpu_layers: int = 0
        self.load_error: str | None = None

    def is_loaded(self) -> bool:
        return self._server is not None and self._server.is_alive

    def _is_model_cached(self, model_size: str) -> bool:
        from huggingface_hub import hf_hub_download

        try:
            repo, quant, _is_moe = GGUF_MODELS[model_size]
            filename = _resolve_gguf_filename(repo, quant)
            hf_hub_download(repo_id=repo, filename=filename, local_files_only=True)
            return True
        except Exception:
            logger.debug("GGUF planner model not cached", exc_info=True)
            return False

    async def load_model(self, model_size: str | None = None, ctx_override: int | None = None) -> None:
        if model_size is None:
            model_size = self.model_size
        if model_size not in GGUF_MODELS:
            raise ValueError(f"Unknown planner model size: {model_size}")

        if self.is_loaded() and self._current_model_size == model_size:
            return
        if self.is_loaded():
            self.unload_model()

        # Check if model is cached before attempting to load (off the event
        # loop — _is_model_cached does HF network/filesystem I/O).
        if not await asyncio.to_thread(self._is_model_cached, model_size):
            raise FileNotFoundError(
                f"Planner model '{model_size}' is not cached. "
                f"Please download it first via the Models tab in the UI. "
                f"The backend only loads already-cached models and does not download models automatically."
            )

        await asyncio.to_thread(self._load_model_sync, model_size, ctx_override)

    def _load_model_sync(self, model_size: str, ctx_override: int | None = None) -> None:
        from huggingface_hub import hf_hub_download

        from ..utils.hf_offline_patch import force_offline_if_cached
        from ..utils.llm_context import compute_llm_context
        from .base import model_load_progress

        progress_model_name = f"gguf-{model_size.lower()}"
        repo, quant, is_moe = GGUF_MODELS[model_size]
        n_ctx = compute_llm_context(model_size, override=ctx_override)

        # Model is already verified as cached in load_model(), so load from local cache only
        filename = _resolve_gguf_filename(repo, quant)
        with model_load_progress(progress_model_name, True), force_offline_if_cached(True, progress_model_name):
            model_path = hf_hub_download(repo_id=repo, filename=filename, local_files_only=True)

        from ..services.settings import (
            get_assistant_gpu_layers,
            get_assistant_kv_quant,
            get_assistant_moe_stream_cache_gb,
            get_assistant_moe_stream_direct,
        )

        gpu_layers = get_assistant_gpu_layers()
        kv_quant = get_assistant_kv_quant()
        moe_cache_gb = get_assistant_moe_stream_cache_gb()
        moe_direct = get_assistant_moe_stream_direct()

        # Auto-detect: when user hasn't explicitly set a cache size but the
        # model is MoE, compute an optimal cache from available RAM.
        if moe_cache_gb == 0 and is_moe:
            import psutil

            from ..utils.llm_context import compute_moe_stream_cache_gb

            total_ram_gb = round(psutil.virtual_memory().total / (1024**3))
            # Estimate model size from the downloaded file
            model_size_mb = Path(model_path).stat().st_size // (1024 * 1024)
            moe_cache_gb = compute_moe_stream_cache_gb(model_size_mb, total_ram_gb)
            if moe_cache_gb > 0:
                logger.info(
                    "MoE model detected — auto-computed stream cache: %d GB (RAM=%d GB, model=%d MB)",
                    moe_cache_gb,
                    total_ram_gb,
                    model_size_mb,
                )

        # Format cache size for llama-server (--moe-stream-cache takes "8G")
        moe_cache_size = f"{moe_cache_gb}G" if moe_cache_gb > 0 else None

        # Resolve custom binary for models with non-stock kernels (e.g. Bonsai
        # ternary format needs PrismML-Eng/llama.cpp fork).
        from .configs.llm import get_llm_model_configs

        custom_binary = None
        for cfg in get_llm_model_configs():
            if cfg.model_size == model_size and cfg.custom_binary_env:
                env_val = os.environ.get(cfg.custom_binary_env, "")
                if env_val and Path(env_val).exists():
                    custom_binary = env_val
                    logger.info("Using custom llama-server binary from %s: %s", cfg.custom_binary_env, env_val)
                elif env_val:
                    logger.warning(
                        "Custom binary path set in %s but file not found: %s — falling back to default",
                        cfg.custom_binary_env,
                        env_val,
                    )
                break

        self._server = GGUFServerProcess(
            model_path,
            n_ctx=n_ctx,
            n_gpu_layers=gpu_layers,
            kv_cache_type=kv_quant,
            moe_stream_cache_size=moe_cache_size,
            moe_stream_direct=moe_direct,
            server_binary=custom_binary,
        )
        try:
            self._server.start()
        except Exception as exc:
            self._server = None
            self.load_error = str(exc)
            self._current_model_size = None
            logger.warning("llama-server start failed for %s: %s", model_size, exc)
            raise

        self._port = self._server.port
        self.load_error = None
        self.n_ctx = n_ctx
        self.kv_quant = kv_quant
        self.gpu_layers = gpu_layers
        self._current_model_size = model_size
        self.model_size = model_size
        logger.info("Planner %s loaded (n_ctx=%d)", model_size, n_ctx)

    def _on_unload(self) -> None:
        """Stop the llama-server sidecar before the base class deletes the ref."""
        if self._server is not None:
            logger.info("Stopping llama-server (port=%s)", self._port)
            self._server.stop()

    def _after_unload(self) -> None:
        self._port = None
        self._current_model_size = None

    async def generate(
        self,
        prompt: str,
        system: str | None = None,
        max_tokens: int | None = None,
        temperature: float = DEFAULT_LLM_TEMPERATURE,
        model_size: str | None = None,
        examples: list[tuple[str, str]] | None = None,
        chat_messages: list[dict] | None = None,
        ctx_override: int | None = None,
        grammar: str | None = None,
        repeat_penalty: float = 1.1,
        frequency_penalty: float = 0.0,
        presence_penalty: float = 0.0,
    ) -> str:
        await self.load_model(model_size, ctx_override=ctx_override)
        if max_tokens is None:
            max_tokens = 2048
        max_tokens = max(MIN_GEN_TOKENS, min(int(max_tokens), self.n_ctx))

        if chat_messages:
            messages = _normalize_history(chat_messages, system)
        else:
            messages = _build_messages(prompt, system, examples)
        do_sample = temperature > 0

        choice = await asyncio.to_thread(
            self._server.chat_completion,
            messages,
            max_tokens=int(max_tokens),
            temperature=temperature if do_sample else 0.0,
            top_p=0.9 if do_sample else 1.0,
            repeat_penalty=repeat_penalty,
            frequency_penalty=frequency_penalty,
            presence_penalty=presence_penalty,
            grammar=grammar,
        )

        message = choice.get("message", {})
        content = message.get("content")
        if content:
            return content.strip()

        # Thinking models (jackrong Opus-Distilled) emit chain-of-thought into
        # ``reasoning_content`` and leave ``content`` empty until thinking is
        # done. If the run finished, the reasoning IS the model's answer;
        # if it hit the token budget mid-think, tell the caller to retry with
        # a larger max_tokens instead of surfacing a silent empty string.
        reasoning = message.get("reasoning_content")
        finish = choice.get("finish_reason")
        if reasoning:
            if finish == "length":
                raise RuntimeError("Model spent its token budget thinking; retry with a larger max_tokens")
            return reasoning.strip()
        raise RuntimeError("LLM returned empty content")
