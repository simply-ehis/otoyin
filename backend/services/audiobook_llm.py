"""LLM-powered character → voice casting for audiobooks."""

from __future__ import annotations

import json
import logging
import re

logger = logging.getLogger(__name__)

CHARACTER_RE = re.compile(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b")
DIALOGUE_RE = re.compile(r'"([^"]{3,})"|\'([^\']{3,})\'|—\s*([^\n]{3,})')


def heuristic_characters(text: str, max_chars: int = 12) -> list[dict]:
    """Fallback when LLM unavailable: extract likely characters from dialogue attribution."""
    # Look for `Alice said` / `Bob:` patterns
    said_pat = re.compile(r"([A-Z][a-z]+)\s+(?:said|asked|replied|whispered|shouted|murmured|exclaimed|answered)\b")
    colon_pat = re.compile(r"^([A-Z][a-z]+)\s*:\s*", re.M)
    names: dict[str, int] = {}
    for m in said_pat.finditer(text):
        names[m.group(1)] = names.get(m.group(1), 0) + 1
    for m in colon_pat.finditer(text):
        names[m.group(1)] = names.get(m.group(1), 0) + 2
    # Filter: at least 2 mentions, not common words
    stop = {"The", "This", "That", "There", "Then", "When", "What", "Chapter", "Page"}
    ranked = [(n, c) for n, c in names.items() if n not in stop and c >= 2]
    ranked.sort(key=lambda x: -x[1])
    return [{"character": n, "mentions": c, "confidence": 0.6} for n, c in ranked[:max_chars]]


async def llm_extract_characters(chapters: list[dict], sample_chars: int = 6000) -> list[dict]:
    """Call local GGUF planner LLM to extract characters with traits."""
    # Build sample from first chapters
    sample = ""
    for ch in chapters[:3]:
        sample += f"\n{ch['title']}\n{ch['text'][:2000]}\n"
        if len(sample) > sample_chars:
            break
    sample = sample[:sample_chars]

    prompt = (
        "Extract the distinct speaking characters from this book excerpt. "
        'Return ONLY valid JSON array: [{"character": "Name", "traits": "brief description", "gender": "male|female|unknown", "age": "child|young|adult|elder|unknown"}]. '
        "Max 12 characters. No markdown, no explanation.\n\nExcerpt:\n" + sample
    )

    try:
        from ..backends import get_llm_backend_for_engine
        from ..backends.configs import get_all_model_configs
        from ..services.model_registry import is_downloaded
        from ..utils.model_lifecycle import lifecycle_manager

        backend = get_llm_backend_for_engine("gguf_llm")
        lifecycle_manager.mark_model_used("gguf_llm")
        # Manifest gate: planner must be downloaded via the Store.
        cfg = next((c for c in get_all_model_configs() if c.engine == "gguf_llm"), None)
        if cfg is not None and not is_downloaded(cfg.model_name, cfg.model_size):
            return heuristic_characters(sample)
        # Respect model_size None handling — use backend default
        size = getattr(backend, "model_size", None)
        try:
            cached = backend._is_model_cached(size) if size else backend._is_model_cached(backend.model_size)  # type: ignore
        except Exception:
            logger.debug("suppressed exception in audiobook_llm.py:64", exc_info=True)
            cached = False
        if not cached:
            return heuristic_characters(sample)
        result = await backend.generate(prompt, max_tokens=800, temperature=0.3)  # type: ignore[attr-defined]
        text = result if isinstance(result, str) else str(result)
        # Extract JSON array
        start = text.find("[")
        end = text.rfind("]") + 1
        if start == -1 or end == 0:
            return heuristic_characters(sample)
        data = json.loads(text[start:end])
        out = []
        for item in data[:12]:
            if isinstance(item, dict) and item.get("character"):
                out.append(
                    {
                        "character": str(item["character"]).strip()[:40],
                        "traits": str(item.get("traits", "")).strip()[:120],
                        "gender": str(item.get("gender", "unknown")).lower(),
                        "age": str(item.get("age", "unknown")).lower(),
                        "confidence": 0.85,
                    }
                )
        return out if out else heuristic_characters(sample)
    except Exception:
        logger.debug("suppressed exception in audiobook_llm.py:89", exc_info=True)
        return heuristic_characters(sample)


def suggest_voice_for_character(
    character_info: dict,
    profiles: list[dict],
) -> dict | None:
    """Heuristic voice matcher: pick best profile for character."""
    if not profiles:
        return None
    gender = character_info.get("gender", "unknown")
    # Score profiles by gender/name match
    best = None
    best_score = -1
    for p in profiles:
        score = 0
        pg = (p.get("gender") or "").lower()
        if gender != "unknown" and pg == gender:
            score += 10
        # Preset voices often encode gender in id/name
        preset = (p.get("preset_voice_id") or p.get("name") or "").lower()
        if gender == "female" and any(k in preset for k in ("female", "woman", "girl", "af_", "heart")):
            score += 5
        if gender == "male" and any(k in preset for k in ("male", "man", "boy", "am_")):
            score += 5
        if score > best_score:
            best_score = score
            best = p
    return best
