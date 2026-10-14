"""MiniMax Music 3 backend via the diffusers ModularPipeline.

MiniMax Music 3 (MiniMaxAI/MiniMax-Music3) is a hierarchical hybrid LM for
text-to-music generation. It produces 32 kHz stereo WAV audio from a structured
music caption plus optional lyrics. The model is gated on Hugging Face — users
must accept the MiniMax-Music3 Community License before downloading.

We use the diffusers ModularPipeline, which runs on CPU (no CUDA required) but
with slower real-time factor (approximately 5-10x). The model is approximately
15 GB total; the backend loads only the required components via the modular
pipeline so that memory pressure is reduced.

License: MiniMax-Music3 Community License — free for commercial use while the
whole organization makes less than $20 M/yr in aggregate revenue, with mandatory
"MiniMax-Music3" attribution in the UI and content-safeguards if the model is
exposed to end users.

Model card: https://huggingface.co/MiniMaxAI/MiniMax-Music3
"""

import logging

import numpy as np

from .base import BackendBase

logger = logging.getLogger(__name__)

# HF repo for the official MiniMax Music 3 model.
MINIMAX_REPO_ID = "MiniMaxAI/MiniMax-Music3"

# --------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------- #


def _import_diffusers():
    """Lazy import of diffusers / torch so that the backend can be imported
    even when diffusers is not installed — the route will raise a clear error
    if the user tries to generate without the dependency."""
    import importlib

    if importlib.util.find_spec("diffusers") is None:
        raise ImportError(
            "diffusers is not installed. Install with: "
            'pip install "diffusers>=1.0.0" "transformers>=5.0.0" '
            "`accelerate`"
        )
    import diffusers
    import torch

    return diffusers, torch


# --------------------------------------------------------------------- #
# Backend class
# --------------------------------------------------------------------- #


class MiniMaxMusic3Backend(BackendBase):
    _model_attr = "pipe"
    """Music backend driving the MiniMax Music 3 ModularPipeline."""

    repo_id = MINIMAX_REPO_ID
    sample_rate = 32000

    def __init__(self) -> None:
        self.load_error: str | None = None
        self.pipe = None

    # ----------------------------------------------------------------- #
    # Cache / model availability
    # ----------------------------------------------------------------- #

    def _is_model_cached(self) -> bool:
        """Check that the model files exist in the app folder (installed
        via the Models tab; the HF cache is never read as a fallback)."""
        from ..services.model_files import is_snapshot_installed

        return is_snapshot_installed(self.repo_id)

    def _local_pipe(self) -> object:
        """Load the diffusers ModularPipeline from the app folder."""
        from ..services.model_files import app_snapshot_dir

        diffusers, _torch = _import_diffusers()

        local_dir = app_snapshot_dir(self.repo_id)
        pipe = diffusers.ModularPipeline.from_pretrained(str(local_dir), device="cpu", offload_text_encoder=True)
        return pipe

    # ----------------------------------------------------------------- #
    # Lifecycle
    # ----------------------------------------------------------------- #

    def load_model(self) -> None:
        """Load the MiniMax Music 3 model into the ModularPipeline.

        Raises:
            RuntimeError: if the model is not cached (license not accepted on HF)
                        or diffusers/torch are not available.
        """
        if self.pipe is not None:
            return  # already loaded

        if not self._is_model_cached():
            raise RuntimeError(
                "MiniMax Music 3 is not downloaded. Accept the license on "
                'Hugging Face first: go to the model card page, click "Accept '
                'license", then re-run the download or ensure the model files are '
                "present."
            )

        try:
            self.pipe = self._local_pipe()
        except Exception as exc:
            self.pipe = None
            self.load_error = f"Failed to load MiniMax Music 3 pipeline: {exc}"
            raise RuntimeError(self.load_error) from exc

    # unload_model() inherited from BackendBase

    def is_loaded(self) -> bool:
        return self.pipe is not None

    def is_available(self) -> bool:
        """True if diffusers+torch are importable and the model is cached."""
        try:
            _import_diffusers()
            return self._is_model_cached()
        except ImportError:
            return False

    # ----------------------------------------------------------------- #
    # Generation
    # ----------------------------------------------------------------- #

    def generate(
        self,
        caption: str,
        duration_seconds: float = 30.0,
        lyrics: str = "",
    ) -> tuple:
        """Generate a music track from a structured caption.

        The ``caption`` should follow the MiniMax Music 3 structured-caption
        format (see the model card for the exact schema). A minimal example is:

            "uplifting house music with bright synths and festival drums, 120 BPM"

        Lyrics are optional; if provided they should be plain text without
        special section tags (the model handles internal tagging).

        Args:
            caption: structured music description (required).
            duration_seconds: target length in seconds (max approximately 300 s / 5 min).
            lyrics: optional lyrics text.

        Returns:
            (audio, sample_rate) — audio is a 1-D float32 numpy array normalized
            to [-1, 1]; sample_rate is always 32000.
        """
        if self.pipe is None:
            self.load_model()

        if self.pipe is None:
            raise RuntimeError(self.load_error)

        _diffusers, _torch = _import_diffusers()

        try:
            # The newer diffusers ModularPipeline API:
            output = self.pipe.generate(
                caption=caption,
                duration=duration_seconds,
                lyrics=lyrics if lyrics else None,
                sample_rate=self.sample_rate,
            )
        except TypeError:
            # Fallback for older diffusers versions that use a different kwarg
            # name or signature.
            output = self.pipe.generate(
                prompt=caption,
                duration=duration_seconds,
                sample_rate=self.sample_rate,
            )

        # Normalise output to (audio_1d, sample_rate).
        if isinstance(output, dict):
            audio = output.get("audio") or output.get("waveform")
            _sr = output.get("sample_rate", self.sample_rate)
        elif isinstance(output, tuple):
            audio, _sr = output[0], output[1] if len(output) > 1 else self.sample_rate
        else:
            audio, _sr = output, self.sample_rate

        # Ensure audio is 1-D float32.
        audio = np.asarray(audio, dtype=np.float32).flatten()

        # The model outputs 32 kHz stereo; convert to mono by averaging channels.
        if audio.ndim == 2:
            audio = audio.mean(axis=1)

        # Trim or pad to the requested duration.
        target_len = self.sample_rate * int(duration_seconds)
        if len(audio) > target_len:
            audio = audio[:target_len]
        elif len(audio) < target_len:
            audio = np.pad(audio, (0, target_len - len(audio)))

        return audio, int(_sr)


minimax_music3_backend = MiniMaxMusic3Backend()
