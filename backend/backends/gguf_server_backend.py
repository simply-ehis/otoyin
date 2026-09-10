"""Local GGUF assistant planner backend via llama.cpp ``server`` (OpenAI-compatible).

Replaces the llama-cpp-python LFM backend. The planner stack (see
docs/ASSISTANT_ARCHITECTURE.md):

    jackrong Qwen3.5-2B Opus-Distilled   (free default planner)
    jackrong Qwen3.5-0.8B Opus-Distilled (free low-RAM fallback)
    Unsloth Qwen3.5-4B                   (free premium planner)
    LiquidAI LFM2-2.6B                   (free latest planner)
    Qwopus3.5-4B-v3                      (paid planner, $40)
    Spark-X 2.5-4B                       (paid planner, $40)
    LiquidAI LFM2.5-2.6B QAD             (paid planner, $13 special offer)
    MiniCPM5-2B                          (paid planner, $5 PROMO)
    Qwen3.8-27B                          (paid planner, $5)

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

from ..utils.llm_context import MIN_CTX as MIN_GEN_TOKENS
from . import DEFAULT_LLM_TEMPERATURE
from .base import BackendBase
from .gguf_runner import GGUFServerProcess

logger = logging.getLogger(__name__)

# model_size -> (HF repo, quant tag as it appears in the GGUF filename)
GGUF_MODELS: dict[str, tuple[str, str]] = {
    "2B-Q4_K_M": ("Jackrong/Qwen3.5-2B-Claude-4.6-Opus-Reasoning-Distilled-GGUF", "q4_k_m"),
    "0.8B-Q5_K_M": ("Jackrong/Qwen3.5-0.8B-Claude-4.6-Opus-Reasoning-Distilled-GGUF", "q5_k_m"),
    "4B-Q4_K_M": ("unsloth/Qwen3.5-4B-GGUF", "q4_k_m"),
    "4B-v3-Q4_K_M": ("Jackrong/Qwopus3.5-4B-v3-GGUF", "q4_k_m"),
    "2.6B-Q4_K_M": ("LiquidAI/LFM2-2.6B-GGUF", "q4_k_m"),
    "2.6B-QAD-Q4_0": ("LiquidAI/LFM2.5-2.6B-GGUF", "q4_0"),
    "minicpm5-2B-Q4_K_M": ("openbmb/MiniCPM5-2B-GGUF", "q4_k_m"),
    "spark-4B-Q4_K_M": ("XHToken/Spark-X2.5-4B-GGUF", "q4_k_m"),
    "27B-UD-Q2_K_XL": ("unsloth/Qwen3.8-27B-GGUF", "q2_k_xl"),
}

DEFAULT_MODEL_SIZE = "2B-Q4_K_M"

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
                f"HuggingFace API timed out listing files in {repo_id} — "
                "check your network connection and retry."
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
        self.load_error: str | None = None

    def is_loaded(self) -> bool:
        return self._server is not None and self._server.is_alive

    def _is_model_cached(self, model_size: str) -> bool:
        from huggingface_hub import hf_hub_download

        try:
            repo, quant = GGUF_MODELS[model_size]
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

        # Check if model is cached before attempting to load
        if not self._is_model_cached(model_size):
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
        repo, quant = GGUF_MODELS[model_size]
        n_ctx = compute_llm_context(model_size, override=ctx_override)

        # Model is already verified as cached in load_model(), so load from local cache only
        filename = _resolve_gguf_filename(repo, quant)
        with model_load_progress(progress_model_name, True), force_offline_if_cached(True, progress_model_name):
            model_path = hf_hub_download(repo_id=repo, filename=filename, local_files_only=True)

        gpu_layers = int(os.environ.get("TWENTYLABS_LLAMA_GPU_LAYERS", "0"))
        from ..services.settings import get_assistant_kv_quant

        kv_quant = get_assistant_kv_quant()
        self._server = GGUFServerProcess(
            model_path,
            n_ctx=n_ctx,
            n_gpu_layers=gpu_layers,
            kv_cache_type=kv_quant,
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
