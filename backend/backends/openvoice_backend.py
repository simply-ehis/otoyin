"""
OpenVoice backend (myshell-ai/OpenVoice, MIT licensed).

Zero-shot tone-color voice conversion: takes source audio + a short
reference clip and converts the source's timbre to match the reference —
no training, no pre-trained voice pack (unlike RVC), similar shape to
Seed-VC but a different, lighter model family.

OPTIONAL: lazy-imports `openvoice`, degrades gracefully if not installed.
Torch-based like Seed-VC — the official repo does not ship an ONNX path
(community ONNX ports exist but the specific one referenced in early
research for this feature, Hinotsuba/OpenVoice-ONNX-v2, returned 404 when
checked — it may have been renamed, deleted, or misremembered; verify
before relying on it, this backend uses the official PyTorch checkpoint).

NOTE: the checkpoint repo id (OPENVOICE_HF_REPO) is based on training
knowledge that MyShell mirrors OpenVoice V2 checkpoints on HuggingFace
Hub — huggingface.co isn't reachable from the sandbox this was written in
to confirm the exact repo id/filenames, so double-check this against the
live HF listing before first use.
"""

from __future__ import annotations

import logging
import threading

from .base import BackendBase, ModelNotCachedError

logger = logging.getLogger(__name__)

# Believed-correct but NOT verified against a live HF listing — see module
# docstring. Confirm repo id + checkpoint filenames before relying on this.
OPENVOICE_HF_REPO = "myshell-ai/OpenVoiceV2"


class OpenVoiceBackend(BackendBase):
    _model_attr = "converter"
    """Zero-shot tone-color voice conversion (reference-audio based)."""

    def __init__(self):
        self.converter = None
        self._lock = threading.Lock()
        self._device = "cuda" if self._cuda_available() else "cpu"
        self._source_se_cache: dict[str, object] = {}

    def _cuda_available(self) -> bool:
        try:
            import torch

            return torch.cuda.is_available()
        except Exception:
            logger.debug("CUDA detection failed, falling back to CPU", exc_info=True)
            return False

    def is_loaded(self) -> bool:
        return self.converter is not None

    def _get_checkpoint_paths(self) -> tuple[str, str] | None:
        """Resolve config.json + checkpoint.pth from the standard HF cache.

        The generic model-download route (routes/models/download.py) uses
        snapshot_download(repo_id=...) with no custom local_dir, so files
        land in the normal huggingface_hub cache — resolve from there via
        hf_hub_download(local_files_only=True), same as every other backend
        in this codebase, rather than a bespoke directory.
        """
        from huggingface_hub import hf_hub_download

        try:
            config_path = hf_hub_download(
                repo_id=OPENVOICE_HF_REPO,
                filename="converter/config.json",
                local_files_only=True,
            )
            checkpoint_path = hf_hub_download(
                repo_id=OPENVOICE_HF_REPO,
                filename="converter/checkpoint.pth",
                local_files_only=True,
            )
            return config_path, checkpoint_path
        except Exception:
            logger.debug("OpenVoice checkpoint not found in HF cache", exc_info=True)
            return None

    def _load_model_sync(self) -> None:
        with self._lock:
            if self.converter is not None:
                return
            try:
                from openvoice.api import ToneColorConverter
            except ImportError as e:
                raise RuntimeError(
                    "OpenVoice is not installed. Run "
                    "`pip install git+https://github.com/myshell-ai/OpenVoice.git` "
                    "(optional, not in the base install)."
                ) from e

            paths = self._get_checkpoint_paths()
            if paths is None:
                raise ModelNotCachedError(
                    "OpenVoice converter checkpoint is not downloaded. Use the Model Downloads page first."
                )
            config_path, checkpoint_path = paths

            self.converter = ToneColorConverter(config_path, device=self._device)
            self.converter.load_ckpt(checkpoint_path)
            logger.info("OpenVoice converter loaded on %s", self._device)

    def unload_model(self):
        with self._lock:
            super().unload_model()

    def _after_unload(self):
        self._source_se_cache.clear()

    def convert(
        self,
        audio_path: str,
        reference_audio_path: str,
        tau: float = 0.3,
    ) -> tuple:
        """Convert audio at audio_path to the timbre of reference_audio_path.

        tau: noise-scale for the tone-color extraction — lower is closer to
        the reference, matching the official demo's default of 0.3.
        """
        import tempfile

        import soundfile as sf

        with self._lock:
            if self.converter is None:
                self._load_model_sync()

            from openvoice import se_extractor

            # Source/target tone-color embeddings — cache by path so repeated
            # conversions against the same reference don't re-extract.
            source_se = self._source_se_cache.get(audio_path)
            if source_se is None:
                source_se, _ = se_extractor.get_se(audio_path, self.converter, vad=True)
                self._source_se_cache[audio_path] = source_se

            target_se = self._source_se_cache.get(reference_audio_path)
            if target_se is None:
                target_se, _ = se_extractor.get_se(reference_audio_path, self.converter, vad=True)
                self._source_se_cache[reference_audio_path] = target_se

            with tempfile.NamedTemporaryFile(suffix=".wav") as tmp_out:
                self.converter.convert(
                    audio_src_path=audio_path,
                    src_se=source_se,
                    tgt_se=target_se,
                    output_path=tmp_out.name,
                    tau=tau,
                )
                wav, sr = sf.read(tmp_out.name)
            return wav, int(sr)


# Singleton used by the routes/services layer.
openvoice_backend = OpenVoiceBackend()
