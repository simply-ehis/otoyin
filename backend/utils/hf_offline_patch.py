"""Monkey-patch huggingface_hub to force offline mode with cached models.

Prevents transformers / huggingface_hub from making network requests when
models are already downloaded.
"""

import logging
import os
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Union

logger = logging.getLogger(__name__)


# huggingface_hub reads ``HF_HUB_OFFLINE`` once at import time into
# ``huggingface_hub.constants.HF_HUB_OFFLINE``; transformers mirrors that into
# ``transformers.utils.hub._is_offline_mode`` at *its* import time. Toggling
# ``os.environ`` after either module is imported does not flip those cached
# bools, and the hot paths (``_http._default_backend_factory``,
# ``transformers.utils.hub.is_offline_mode``) read the bools — not the env.
# We mutate the cached constants directly, guarded by a refcount so
# concurrent inference threads share a single offline window safely.

_offline_lock = threading.RLock()
_offline_refcount = 0
_saved_env: str | None = None
_saved_hf_const: bool | None = None
_saved_transformers_const: bool | None = None


@contextmanager
def force_offline_if_cached(is_cached: bool, model_label: str = ""):
    """Force offline mode for the duration of a cached-model operation.

    Flips ``HF_HUB_OFFLINE`` in the process env **and** in the cached bools
    inside ``huggingface_hub.constants`` / ``transformers.utils.hub`` so HTTP
    adapters and offline-mode checks actually see the change. Uses a refcount
    so multiple concurrent inference threads share a single offline window
    and the last one to exit restores state.

    If *is_cached* is ``False`` the block runs normally (network allowed).

    Args:
        is_cached: Whether the model weights are already on disk.
        model_label: Human-readable name used in log messages.
    """
    if not is_cached:
        yield
        return

    global _offline_refcount, _saved_env, _saved_hf_const, _saved_transformers_const

    with _offline_lock:
        if _offline_refcount == 0:
            # Snapshot prior state, apply new state, roll back on *any*
            # failure. Catching only ImportError here would let a partially
            # broken install (RuntimeError, AttributeError from a half-init
            # module, etc.) leave the cached HF constants mutated without
            # bumping the refcount — a persistent offline leak that outlives
            # the process and is miserable to debug.
            prev_env = os.environ.get("HF_HUB_OFFLINE")
            prev_hf: bool | None = None
            prev_tf: bool | None = None
            try:
                try:
                    import huggingface_hub.constants as hf_const

                    prev_hf = hf_const.HF_HUB_OFFLINE
                    hf_const.HF_HUB_OFFLINE = True
                except ImportError:
                    prev_hf = None

                try:
                    import transformers.utils.hub as tf_hub

                    prev_tf = getattr(tf_hub, "_is_offline_mode", None)
                    if prev_tf is not None:
                        tf_hub._is_offline_mode = True
                except ImportError:
                    prev_tf = None

                os.environ["HF_HUB_OFFLINE"] = "1"
            except BaseException:
                # Roll back whatever we already changed, then re-raise so
                # the caller sees the real failure.
                if prev_hf is not None:
                    try:
                        import huggingface_hub.constants as hf_const

                        hf_const.HF_HUB_OFFLINE = prev_hf
                    except ImportError:
                        pass
                if prev_tf is not None:
                    try:
                        import transformers.utils.hub as tf_hub

                        if hasattr(tf_hub, "_is_offline_mode"):
                            tf_hub._is_offline_mode = prev_tf
                    except ImportError:
                        pass
                if prev_env is not None:
                    os.environ["HF_HUB_OFFLINE"] = prev_env
                else:
                    os.environ.pop("HF_HUB_OFFLINE", None)
                raise

            _saved_env = prev_env
            _saved_hf_const = prev_hf
            _saved_transformers_const = prev_tf
            logger.info(
                "[offline-guard] %s is cached — forcing offline mode",
                model_label or "model",
            )
        _offline_refcount += 1

    try:
        yield
    finally:
        with _offline_lock:
            _offline_refcount -= 1
            if _offline_refcount == 0:
                if _saved_env is not None:
                    os.environ["HF_HUB_OFFLINE"] = _saved_env
                else:
                    os.environ.pop("HF_HUB_OFFLINE", None)
                if _saved_hf_const is not None:
                    try:
                        import huggingface_hub.constants as hf_const

                        hf_const.HF_HUB_OFFLINE = _saved_hf_const
                    except ImportError:
                        pass
                if _saved_transformers_const is not None:
                    try:
                        import transformers.utils.hub as tf_hub

                        if hasattr(tf_hub, "_is_offline_mode"):
                            tf_hub._is_offline_mode = _saved_transformers_const
                    except ImportError:
                        pass
                _saved_env = None
                _saved_hf_const = None
                _saved_transformers_const = None


_mistral_regex_patched = False
_mistral_regex_attempted = False


def patch_transformers_mistral_regex():
    """Make transformers' tokenizer load robust to HuggingFace metadata failures.

    transformers 4.57.x added ``PreTrainedTokenizerBase._patch_mistral_regex``
    which unconditionally calls ``huggingface_hub.model_info(repo_id)`` during
    every non-local tokenizer load to check whether the model is a Mistral
    variant. That call raises on ``HF_HUB_OFFLINE=1`` and on plain network
    failures, killing unrelated loads (kokoro, fish_speech, etc.).

    otoyin never loads Mistral models, so the rewrite the function would
    apply is a no-op for us anyway. Wrap the method so any exception from the
    metadata lookup returns the tokenizer unchanged — matching the success-path
    behavior for non-Mistral repos (transformers 4.57.3,
    ``tokenization_utils_base.py:2503``).
    """
    global _mistral_regex_patched, _mistral_regex_attempted
    # Recursion guard: the transformers import below re-enters our __import__
    # hook, which calls this function again. Set the "attempted" flag before the
    # import so the re-entrant call returns immediately and no infinite loop
    # occurs. This is distinct from ``_mistral_regex_patched``, which must stay
    # False until the patch is actually applied (e.g. when the method is absent).
    if _mistral_regex_attempted:
        return
    _mistral_regex_attempted = True

    try:
        from transformers.tokenization_utils_base import PreTrainedTokenizerBase
    except ImportError:
        logger.debug("transformers not available, skipping mistral-regex patch")
        return

    original = getattr(PreTrainedTokenizerBase, "_patch_mistral_regex", None)
    if original is None:
        logger.debug(
            "transformers has no _patch_mistral_regex attribute, skipping patch",
        )
        return

    _mistral_regex_patched = True

    def safe_patch_mistral_regex(cls, tokenizer, pretrained_model_name_or_path, *args, **kwargs):
        try:
            return original(tokenizer, pretrained_model_name_or_path, *args, **kwargs)
        except Exception as exc:
            logger.debug(
                "[mistral-regex-patch] suppressed %s for %r, returning tokenizer as-is",
                type(exc).__name__,
                pretrained_model_name_or_path,
            )
            return tokenizer

    PreTrainedTokenizerBase._patch_mistral_regex = classmethod(safe_patch_mistral_regex)
    logger.debug("installed _patch_mistral_regex wrapper")


def patch_huggingface_hub_offline():
    """Monkey-patch huggingface_hub to force offline mode."""
    try:
        import huggingface_hub
        from huggingface_hub import constants as hf_constants
        from huggingface_hub.file_download import _try_to_load_from_cache

        original_try_load = _try_to_load_from_cache

        def _patched_try_to_load_from_cache(
            repo_id: str,
            filename: str,
            cache_dir: Union[str, Path, None] = None,
            revision: str | None = None,
            repo_type: str | None = None,
        ):
            result = original_try_load(
                repo_id=repo_id,
                filename=filename,
                cache_dir=cache_dir,
                revision=revision,
                repo_type=repo_type,
            )

            if result is None:
                cache_path = Path(hf_constants.HF_HUB_CACHE) / f"models--{repo_id.replace('/', '--')}"
                logger.debug("file not cached: %s/%s (expected at %s)", repo_id, filename, cache_path)
            else:
                logger.debug("cache hit: %s/%s", repo_id, filename)

            return result

        import huggingface_hub.file_download as fd

        fd._try_to_load_from_cache = _patched_try_to_load_from_cache
        logger.debug("huggingface_hub patched for offline mode")

    except ImportError:
        logger.debug("huggingface_hub not available, skipping offline patch")
    except Exception:
        logger.exception("failed to patch huggingface_hub for offline mode")


_import_hook_installed = False


def _install_transformers_patch_hook() -> None:
    """Apply the mistral-regex patch lazily on first transformers import."""
    global _import_hook_installed
    if _import_hook_installed:
        return
    _import_hook_installed = True

    import builtins

    _orig_import = builtins.__import__

    def _patched_import(name, *args, **kwargs):
        module = _orig_import(name, *args, **kwargs)
        if name == "transformers" or name.startswith("transformers."):
            patch_transformers_mistral_regex()
        return module

    builtins.__import__ = _patched_import


if os.environ.get("TWENTYONE_LABS_OFFLINE_PATCH", "1") != "0":
    patch_huggingface_hub_offline()
    # The mistral-regex patch wraps a transformers tokenizer method. Applying
    # it eagerly imports transformers → torch, which would defeat the goal of
    # keeping torch out of the app boot path. Instead install a one-shot hook
    # that applies the patch the first time ``transformers`` is imported by app
    # code (i.e. at model load, where torch is already needed).
    _install_transformers_patch_hook()
