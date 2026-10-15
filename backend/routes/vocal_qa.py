"""Vocal QA — compare transcribed audio against reference lyrics.

Uses faster-whisper for per-word transcription, then computes WER,
coverage %, and missing words.  Inspired by Resonant's vocal QA concept
(© 2026 Calesthio, AGPL-3.0-only), rebuilt on otoyin's STT stack.
"""

from __future__ import annotations

import logging
import re
from difflib import SequenceMatcher

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import config
from ..database import get_db
from ..errors import ERR_AUDIO_NOT_FOUND
from ..services import history

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Request / response models ───────────────────────────────────────────────


class VocalQARequest(BaseModel):
    generation_id: str
    lyrics: str
    language: str | None = None
    model: str | None = None


class WordAlignment(BaseModel):
    word: str
    start_ms: float
    end_ms: float
    confidence: float


class VocalQAResult(BaseModel):
    transcribed_text: str
    wer: float
    coverage_pct: float
    missing_words: list[str]
    extra_words: list[str]
    word_count_ref: int
    word_count_transcribed: int
    words: list[WordAlignment]


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _normalise(text: str) -> list[str]:
    """Lowercase, strip punctuation, split into word tokens."""
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text)
    return [w for w in text.split() if w]


def _wer(reference: list[str], hypothesis: list[str]) -> tuple[float, list[str], list[str]]:
    """Compute Word Error Rate via SequenceMatcher alignment.

    Returns (wer, missing_words, extra_words).
    WER = (S + D + I) / N  where S=substitutions, D=deletions,
    I=insertions, N=reference length.
    """
    if not reference:
        return 0.0, [], list(hypothesis)

    sm = SequenceMatcher(None, reference, hypothesis, autojunk=False)
    missing: list[str] = []
    extra: list[str] = []
    total_errors = 0

    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "replace":
            missing.extend(reference[i1:i2])
            extra.extend(hypothesis[j1:j2])
            total_errors += max(i2 - i1, j2 - j1)
        elif tag == "delete":
            missing.extend(reference[i1:i2])
            total_errors += i2 - i1
        elif tag == "insert":
            extra.extend(hypothesis[j1:j2])
            total_errors += j2 - j1

    wer = total_errors / len(reference) if reference else 0.0
    return wer, missing, extra


def _coverage(reference: list[str], hypothesis: list[str]) -> float:
    """Percentage of reference words found in hypothesis (order-insensitive)."""
    if not reference:
        return 100.0
    ref_set = list(reference)
    hyp_set = set(hypothesis)
    matched = sum(1 for w in ref_set if w in hyp_set)
    return (matched / len(ref_set)) * 100.0


# ─── Endpoint ────────────────────────────────────────────────────────────────


@router.post("/audio/vocal-qa", response_model=VocalQAResult)
async def vocal_qa(data: VocalQARequest, db: Session = Depends(get_db)):
    """Compare transcribed audio against reference lyrics.

    Returns WER, word coverage %, missing/extra words, and per-word
    timestamps with confidence scores.
    """
    generation = await history.get_generation(data.generation_id, db)
    audio_path = getattr(generation, "audio_path", None) if generation else None
    if not audio_path:
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    resolved = config.resolve_storage_path(audio_path)
    if resolved is None or not resolved.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    store_hint: str | None = None
    try:
        from ..backends.configs import get_all_model_configs
        from ..backends.registry import get_stt_backend
        from ..services.model_registry import is_downloaded
        from ..services.transcribe import transcribe_words_with_fallback
        from ..utils.model_lifecycle import lifecycle_manager

        # Manifest gate: faster-whisper must be downloaded via the Store.
        cfg = next(
            (
                c
                for c in get_all_model_configs()
                if c.engine == "faster-whisper" and c.model_size == (data.model or "tiny.en")
            ),
            None,
        )
        words_raw: list[dict] | None = None
        fw_missing = cfg is not None and not is_downloaded(cfg.model_name, cfg.model_size)
        if fw_missing and cfg is not None:
            store_hint = f"Download this model from the Store first ({cfg.model_name})"
        if not fw_missing:
            stt = get_stt_backend("faster-whisper")
            lifecycle_manager.mark_model_used("faster-whisper")
            try:
                words_raw = await stt.transcribe_with_words(
                    str(resolved), language=data.language, model_size=data.model
                )
            except Exception:
                logger.debug("suppressed exception in vocal_qa.py:153", exc_info=True)
                words_raw = None
        if not words_raw:
            # faster-whisper unavailable: fall back to whisper.cpp (segment
            # split). Timing is estimated; the transcribed words are real.
            fallback, _source = await transcribe_words_with_fallback(
                "whisper", str(resolved), language=data.language, fallback_to=()
            )
            words_raw = [
                {
                    "word": w["text"],
                    "start_ms": w["start"] * 1000.0,
                    "end_ms": w["end"] * 1000.0,
                    "confidence": 1.0,
                }
                for w in fallback
            ]
    except HTTPException:
        # The manifest gate above raises HTTPException (400) — it must
        # surface as-is, not be swallowed into 500 below.
        raise
    except RuntimeError as exc:
        if store_hint is not None:
            raise HTTPException(status_code=400, detail=store_hint) from exc
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.debug("vocal-qa transcription failed", exc_info=True)
        raise HTTPException(status_code=500, detail="Transcription failed") from exc

    ref_words = _normalise(data.lyrics)
    hyp_words = [w["word"].lower().strip() for w in words_raw if w.get("word")]

    wer_value, missing, extra = _wer(ref_words, hyp_words)
    cov = _coverage(ref_words, hyp_words)

    return VocalQAResult(
        transcribed_text=" ".join(h["word"] for h in words_raw),
        wer=round(wer_value, 4),
        coverage_pct=round(cov, 2),
        missing_words=missing,
        extra_words=extra,
        word_count_ref=len(ref_words),
        word_count_transcribed=len(hyp_words),
        words=[WordAlignment(**w) for w in words_raw],
    )
