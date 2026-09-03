"""Speaker diarization service.

Torch-free stack replacing pyannote.audio (which needed a ~1-2 GB torch model
and a HF token). Total footprint ~7 MB:

  - Resemblyzer (d-vector speaker embeddings, ~5 MB, Apache-2.0)
  - Silero VAD (voice activity detection, ~2 MB, ONNX, MIT)
  - scikit-learn SpectralClustering (speaker assignment)

Pipeline: load audio → Silero VAD finds speech turns → one d-vector per turn
via Resemblyzer → SpectralClustering on the cosine-similarity matrix assigns
each turn a speaker label. Speaker count is auto-detected with silhouette
scoring when ``num_speakers`` is not given.

All heavy imports are lazy and cached, so the module is safe to import even
when the optional deps are missing — callers must check :func:`is_available`
first and degrade gracefully.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Resemblyzer / Silero expect 16 kHz mono.
_SAMPLE_RATE = 16000

# Min/max clusters tried during speaker-count auto-detection.
_MIN_SPEAKERS = 2
_MAX_SPEAKERS = 6

_available: bool | None = None


def is_available() -> bool:
    """Return True when all diarization deps are importable (cached)."""
    global _available
    if _available is None:
        try:
            import resemblyzer  # noqa: F401
            import silero_vad  # noqa: F401
            from sklearn.cluster import SpectralClustering  # noqa: F401

            _available = True
        except ImportError:
            _available = False
    return _available


@dataclass
class SpeakerTurn:
    """One contiguous speech turn assigned to a speaker."""

    start: float
    end: float
    speaker: str


def _load_encoder():
    """Load (and cache) the Resemblyzer voice encoder on CPU."""
    from resemblyzer import VoiceEncoder

    return VoiceEncoder("cpu")


def _detect_speaker_count(embeddings) -> int:
    """Pick the speaker count with the best silhouette score.

    Falls back to 2 when there are too few turns to score.
    """
    import numpy as np
    from sklearn.metrics import silhouette_score

    n_turns = len(embeddings)
    candidates = range(_MIN_SPEAKERS, min(_MAX_SPEAKERS, n_turns - 1) + 1)
    best_k = _MIN_SPEAKERS
    best_score = -1.0
    for k in candidates:
        from sklearn.cluster import SpectralClustering
        from sklearn.metrics.pairwise import cosine_similarity

        sim = cosine_similarity(embeddings)
        np.fill_diagonal(sim, 1.0)
        labels = SpectralClustering(
            n_clusters=k,
            affinity="precomputed",
            random_state=42,
            assign_labels="kmeans",
        ).fit_predict(sim)
        try:
            score = float(silhouette_score(embeddings, labels, metric="cosine"))
        except ValueError:
            score = -1.0
        if score > best_score:
            best_score = score
            best_k = k
    if best_score < 0.1:
        # Weak separation — a single speaker is more honest than a forced split.
        return 1
    return best_k


def diarize_turns(
    audio_path: str,
    num_speakers: int | None = None,
) -> list[SpeakerTurn]:
    """Split ``audio_path`` into speaker-tagged speech turns.

    Args:
        audio_path: Path to the audio file (any format soundfile reads).
        num_speakers: Known speaker count, or None to auto-detect.

    Returns:
        List of :class:`SpeakerTurn` in time order. Empty when diarization
        deps are unavailable or the file contains no usable speech.
    """
    if not is_available():
        logger.info("Diarization deps not available — skipping")
        return []

    import numpy as np
    import soundfile as sf
    import torch
    from resemblyzer import preprocess_wav
    from silero_vad import get_speech_timestamps, load_silero_vad

    try:
        audio, sr = sf.read(audio_path, dtype="float32")
    except Exception as exc:
        logger.warning("Diarization could not read %s: %s", audio_path, exc)
        return []
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    if sr != _SAMPLE_RATE:
        import librosa

        audio = librosa.resample(audio, orig_sr=sr, target_sr=_SAMPLE_RATE)

    vad = load_silero_vad(onnx=True)
    tensor = torch.from_numpy(audio.astype(np.float32))
    timestamps = get_speech_timestamps(
        tensor,
        vad,
        sampling_rate=_SAMPLE_RATE,
        min_speech_duration_ms=250,
        min_silence_duration_ms=300,
        speech_pad_ms=100,
        return_seconds=True,
    )

    encoder = _load_encoder()
    turns: list[SpeakerTurn] = []
    embeddings: list[np.ndarray] = []

    for ts in timestamps:
        start = float(ts["start"])
        end = float(ts["end"])
        if end - start < 0.3:
            continue
        chunk = audio[int(start * _SAMPLE_RATE) : int(end * _SAMPLE_RATE)]
        wav = preprocess_wav(chunk, source_sr=_SAMPLE_RATE)
        if len(wav) < _SAMPLE_RATE * 0.3:
            continue
        emb = encoder.embed_utterance(wav)
        turns.append(SpeakerTurn(start=start, end=end, speaker="SPEAKER_00"))
        embeddings.append(emb)

    if len(turns) < 2:
        logger.info("Fewer than 2 usable speech turns — no clustering")
        return turns

    from sklearn.cluster import SpectralClustering
    from sklearn.metrics.pairwise import cosine_similarity

    embeddings_matrix = np.vstack(embeddings)
    if num_speakers and num_speakers >= _MIN_SPEAKERS:
        n_speakers = min(num_speakers, len(turns))
    else:
        n_speakers = _detect_speaker_count(embeddings_matrix)

    if n_speakers < 2:
        return turns

    sim = cosine_similarity(embeddings_matrix)
    np.fill_diagonal(sim, 1.0)
    labels = SpectralClustering(
        n_clusters=n_speakers,
        affinity="precomputed",
        random_state=42,
        assign_labels="kmeans",
    ).fit_predict(sim)

    for turn, label in zip(turns, labels, strict=False):
        turn.speaker = f"SPEAKER_{int(label):02d}"

    logger.info("Diarization: %d speakers, %d turns", n_speakers, len(turns))
    return turns


def align_speakers(
    transcript_segments: list,
    speaker_turns: list[SpeakerTurn],
) -> list:
    """Assign each transcript segment the speaker of its best-overlap turn.

    ``transcript_segments`` items must expose ``start``/``end`` floats and a
    writable ``speaker`` attribute (mutated in place and returned).
    """
    if not speaker_turns:
        return transcript_segments

    for seg in transcript_segments:
        best_overlap = 0.0
        best_speaker = speaker_turns[0].speaker
        for turn in speaker_turns:
            overlap = max(0.0, min(seg.end, turn.end) - max(seg.start, turn.start))
            if overlap > best_overlap:
                best_overlap = overlap
                best_speaker = turn.speaker
        seg.speaker = best_speaker

    return transcript_segments
