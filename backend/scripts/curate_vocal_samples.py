"""Curate vocal burst samples from TTS-AGI/vocal-bursts.

Downloads per-category tar.gz files from HuggingFace, extracts FLAC files,
scores quality, and saves the best samples as 24kHz mono WAV.

Usage:
    python -m backend.scripts.curate_vocal_samples --per-tag 10 --output data/vocal_samples
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import ssl
import tarfile
import tempfile
import urllib.request
from pathlib import Path

import numpy as np
import soundfile as sf

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

# TTS-AGI categories we need → our tags
CATEGORY_TO_TAG: dict[str, list[str]] = {
    "Laughter": ["laughs", "chuckles", "giggles"],
    "Sigh": ["sigh"],
    "Cough": ["cough"],
    "Yawn": ["yawn"],
    "Breath": ["breath", "breaths"],
    "Tongue Clicking": ["tsk"],
    "Sniff": ["gasp"],
}

# All categories we'll download
CATEGORIES = list(CATEGORY_TO_TAG.keys())

HF_BASE = "https://huggingface.co/datasets/TTS-AGI/vocal-bursts/resolve/main/data"


def compute_rms(audio: np.ndarray) -> float:
    return float(np.sqrt(np.mean(audio**2)))


def score_sample(audio: np.ndarray, sr: int) -> float:
    """Score 0-100 based on duration, loudness, and clarity."""
    duration_s = len(audio) / sr
    rms = compute_rms(audio)

    score = 0.0

    # Duration: 200ms-2s ideal
    if 0.2 <= duration_s <= 2.0:
        score += 40
    elif 0.1 <= duration_s <= 3.0:
        score += 20
    else:
        score += 5

    # RMS: 0.02-0.3 good
    if 0.02 <= rms <= 0.3:
        score += 30
    elif 0.01 <= rms <= 0.5:
        score += 15
    else:
        score += 5

    # Not silent, not clipped
    if rms > 0.005 and np.abs(audio).max() < 0.99:
        score += 30
    elif rms > 0.001:
        score += 10

    return score


def classify_variant(rms: float) -> str:
    if rms < 0.04:
        return "soft"
    if rms > 0.12:
        return "loud"
    return "normal"


def download_category(category: str, tmp_dir: Path) -> list[dict]:
    """Download a category tar.gz and extract metadata + audio paths."""
    url = f"{HF_BASE}/{category}.tar.gz"
    logger.info("Downloading %s...", category)

    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=60, context=ssl.create_default_context()) as resp:
            data = resp.read()
    except Exception as e:
        logger.warning("Failed to download %s: %s", category, e)
        return []

    samples = []
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        members = [m for m in tar.getmembers() if m.isfile()]
        json_member = None
        flac_members = {}

        for m in members:
            if m.name.endswith(".json"):
                json_member = m
            elif m.name.endswith(".flac") or m.name.endswith(".wav"):
                # Extract filename without path
                basename = Path(m.name).name
                flac_members[basename] = m

        # Parse metadata
        meta = {}
        if json_member:
            f = tar.extractfile(json_member)
            if f:
                raw = json.loads(f.read().decode("utf-8"))
                # Can be a dict or list
                if isinstance(raw, dict):
                    meta = raw
                elif isinstance(raw, list):
                    meta = {item.get("original_filename", ""): item for item in raw if isinstance(item, dict)}

        # Extract and decode audio files
        for basename, member in flac_members.items():
            try:
                f = tar.extractfile(member)
                if f:
                    audio_bytes = f.read()
                    audio_data, sr = sf.read(io.BytesIO(audio_bytes), dtype="float32")
                    if audio_data.ndim > 1:
                        audio_data = audio_data[:, 0]

                    # Resample to 24kHz
                    if sr != 24000:
                        from scipy.signal import resample

                        n_samples = int(len(audio_data) * 24000 / sr)
                        audio_data = resample(audio_data, n_samples).astype(np.float32)

                    info_meta = meta.get(basename, {})
                    samples.append(
                        {
                            "audio": audio_data,
                            "sr": 24000,
                            "label": info_meta.get("label", category),
                            "text": info_meta.get("text", ""),
                            "filename": basename,
                        }
                    )
            except Exception as e:
                logger.debug("Failed to decode %s/%s: %s", category, basename, e)
                continue

    logger.info("  %s: decoded %d samples", category, len(samples))
    return samples


def curate_samples(output_dir: Path, per_tag: int = 10) -> dict[str, int]:
    """Download, score, and save best samples per tag."""
    output_dir.mkdir(parents=True, exist_ok=True)

    all_samples: dict[str, list[dict]] = {}

    for category in CATEGORIES:
        with tempfile.TemporaryDirectory() as tmp_dir:
            samples = download_category(category, Path(tmp_dir))
            tags = CATEGORY_TO_TAG.get(category, [])

            for sample in samples:
                score = score_sample(sample["audio"], sample["sr"])
                if score < 30:
                    continue

                rms = compute_rms(sample["audio"])
                variant = classify_variant(rms)

                for tag in tags:
                    if tag not in all_samples:
                        all_samples[tag] = []
                    all_samples[tag].append(
                        {
                            "audio": sample["audio"],
                            "sr": sample["sr"],
                            "score": score,
                            "variant": variant,
                            "filename": sample["filename"],
                        }
                    )

    # Save best per tag
    saved: dict[str, int] = {}
    for tag, candidates in all_samples.items():
        if not candidates:
            saved[tag] = 0
            continue

        # Sort by score
        candidates.sort(key=lambda x: x["score"], reverse=True)

        # Split by variant
        by_variant: dict[str, list] = {"normal": [], "soft": [], "loud": []}
        for c in candidates:
            by_variant.setdefault(c["variant"], []).append(c)

        tag_dir = output_dir / tag
        count = 0

        for variant, variant_samples in by_variant.items():
            if not variant_samples:
                continue

            variant_dir = tag_dir / variant
            variant_dir.mkdir(parents=True, exist_ok=True)

            n_save = min(max(1, per_tag // 3), len(variant_samples))
            for i, c in enumerate(variant_samples[:n_save]):
                filename = f"{tag}_{variant}_{i:02d}.wav"
                filepath = variant_dir / filename
                sf.write(str(filepath), c["audio"], c["sr"])
                count += 1

        saved[tag] = count
        logger.info("Tag '%s': saved %d samples", tag, count)

    return saved


def main():
    parser = argparse.ArgumentParser(description="Curate vocal burst samples")
    parser.add_argument("--output", type=str, default="data/vocal_samples")
    parser.add_argument("--per-tag", type=int, default=10)
    args = parser.parse_args()

    output_dir = Path(args.output)
    logger.info("Curating vocal samples → %s (per-tag=%d)", output_dir, args.per_tag)

    counts = curate_samples(output_dir, args.per_tag)

    total = sum(counts.values())
    logger.info("\n=== Done ===")
    logger.info("Total: %d samples across %d tags", total, len(counts))
    for tag, count in sorted(counts.items()):
        logger.info("  %s: %d", tag, count)


if __name__ == "__main__":
    main()
