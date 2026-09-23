"""In-app content: changelog feed, announcements, and special offers.

All content is bundled offline in ``backend/data/content.json`` (no network).
If that file is missing or malformed, the module falls back to the
``_DEFAULT_CONTENT`` constant below so the endpoints never break.

Content ownership:
  - what's-new     -> changelog, newest first
  - announcements  -> top-of-app banners (info / warning / promo)
  - offers         -> special promotions shown in the bell, offers page, store

Per-item dismiss/"seen" state is tracked client-side (localStorage) and never
persisted here.
"""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.request
from pathlib import Path

logger = logging.getLogger(__name__)

# Optional remote notices source (see marketplace_server/routes/notices.py).
# When set, refresh_remote_announcements() merges remote items into the
# bundled content so messages ship without an app release. Offline-first:
# any failure keeps the bundled content untouched.
REMOTE_NOTICES_URL = os.environ.get("OTOYIN_NOTICES_URL", "").strip()
REMOTE_NOTICES_TIMEOUT_S = float(os.environ.get("OTOYIN_NOTICES_TIMEOUT_S", "5"))
# Periodic poll cadence (08 decision): the startup merge alone would keep a
# mid-session user on stale notices until relaunch, so app.py's background
# loop re-merges on this tick. Sleep-first: the startup task already fetched,
# the first poll adds nothing. Mirrors 07's REMOTE_CATALOG_POLL_S but without
# staleness/signature machinery — notices are tiny, unsigned, and idempotent.
NOTICES_POLL_S = float(os.environ.get("OTOYIN_NOTICES_POLL_S", str(60 * 60)))

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# Empty-but-valid fallback so _load_content() never raises NameError when
# content.json is missing AND this constant is the only thing standing
# between a missing data file and a dead import (frozen builds).
_DEFAULT_CONTENT: dict = {"whats_new": [], "announcements": [], "offers": []}


def _content_dir() -> Path:
    """Resolve the bundled data directory, supporting frozen PyInstaller builds.

    In a frozen build ``sys._MEIPASS`` points at the extracted bundle root and
    the data directory is copied there. In normal dev it lives next to the
    backend package. Falls back to the dev path when no bundle is present.
    """
    import sys

    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        cand = Path(meipass) / "data"
        if cand.is_dir():
            return cand
    return _DATA_DIR


def _load_content() -> dict:
    """Load content from ``content.json``; fall back to defaults on any failure."""
    path = _content_dir() / "content.json"
    try:
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        if not isinstance(data, dict):
            raise ValueError("content.json is not an object")
        return data
    except Exception:  # content must never break the app
        logger.exception("Failed to load %s; using bundled defaults", path)
        return _DEFAULT_CONTENT


# Static for the life of the process; content.json is read once at import.
_CONTENT = _load_content()


def get_whats_new() -> list[dict]:
    """Changelog entries, newest first."""
    return list(_CONTENT.get("whats_new", []))


def get_announcements() -> list[dict]:
    """Top-of-app banners. ``scope: global`` shows for everyone until dismissed."""
    return list(_CONTENT.get("announcements", []))


def get_offers() -> list[dict]:
    """Special promotions. ``expires_at`` is ISO date; frontend shows remaining time."""
    return list(_CONTENT.get("offers", []))


def refresh_remote_announcements() -> None:
    """Merge remote notices (``OTOYIN_NOTICES_URL``) into the bundled content.

    Remote items use the frontend ``Announcement`` shape (id, title, message,
    severity, cta, starts_at, ends_at). Merge rules:

    - Same ``id`` as a bundled announcement -> remote replaces it in place.
    - New ``id`` -> appended after the bundled list.
    - Any failure (no network, timeout, malformed payload) -> bundled content
      is kept untouched and the failure is logged at debug level, so an
      offline app or a notices outage is completely invisible to the user.

    Called once at app startup and then re-run by app.py's periodic poll
    (NOTICES_POLL_S, default 1h) so notices published mid-session arrive
    without a restart. Idempotent: same-id merges replace in place, so
    repeated polls are no-ops when nothing changed.
    """
    global _CONTENT
    if not REMOTE_NOTICES_URL:
        return
    try:
        from ..utils.ssrf import is_url_safe

        if not is_url_safe(REMOTE_NOTICES_URL):
            logger.warning("Remote notices URL failed SSRF check: %s", REMOTE_NOTICES_URL)
            return
        req = urllib.request.Request(
            REMOTE_NOTICES_URL,
            headers={"Accept": "application/json", "User-Agent": "otoyin/0.1"},
        )
        with urllib.request.urlopen(req, timeout=REMOTE_NOTICES_TIMEOUT_S) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        items = payload.get("notices") if isinstance(payload, dict) else payload
        if not isinstance(items, list):
            raise ValueError("remote notices payload is not a list")
        bundled = {a["id"]: a for a in _CONTENT.get("announcements", [])}
        seen: set[str] = set()
        for item in items:
            if not isinstance(item, dict) or not item.get("id"):
                continue
            item_id = item["id"]
            bundled[item_id] = item
            seen.add(item_id)
        # Preserve bundled ordering; remote-only items append at the end.
        merged = [bundled[a["id"]] for a in _CONTENT.get("announcements", []) if a.get("id") not in seen]
        merged.extend(bundled[a["id"]] for a in _CONTENT.get("announcements", []) if a.get("id") in seen)
        merged.extend(item for item in items if item.get("id") not in {a.get("id") for a in merged})
        _CONTENT = {**_CONTENT, "announcements": merged}
        logger.info("Merged %d remote notice(s) into announcements", len(items))
    except Exception:
        logger.debug("Remote notices fetch failed; keeping bundled content", exc_info=True)


def create_support_request(kind: str, subject: str, message: str, email: str | None) -> dict:
    """Accept a local support/feedback request.

    No external ticketing system is wired up yet, so the request is logged
    server-side and acknowledged. This keeps the contact/support surface
    functional offline without a network dependency.
    """
    request_id = f"local-{int(time.time() * 1000)}"
    logger.info(
        "Support request [%s] %s from %s: %s",
        kind,
        subject or "(no subject)",
        email or "anonymous",
        message[:200],
    )
    return {"status": "received", "id": request_id}


_DEFAULT_CONTENT = {
    "whats_new": [
        {
            "version": "1.0.0",
            "date": "2026-08-19",
            "title": "Welcome to Otoyin — your offline AI studio",
            "highlights": [
                "Your studio, fully offline: voice generation, transcription, neural cleanup, and the planner assistant all run on your machine. Nothing leaves the device.",
                "New in-app Marketplace: browse the model catalog, download free starter models, and redeem voice-pack licenses without leaving the studio.",
                "Smarter resource handling: the planner LLM pre-warms on launch and idle-unloads after 3 minutes; Orpheus TTS shows real download progress on first run; DeepFilter cleanup unloads automatically when idle.",
                "Offline licensing: free models need no key, and paid voice packs install from a license you redeem in-app.",
            ],
        },
        {
            "version": "1.0.0-beta.3",
            "date": "2026-08-10",
            "title": "Faster, lighter, still 100% offline",
            "highlights": [
                "Planner LLM now pre-warms on launch and idle-unloads after 3 minutes, freeing VRAM the moment you leave the assistant.",
                "Orpheus TTS streams a real download-progress bar on first run instead of hanging on a silent cold start.",
                "DeepFilter neural cleanup unloads automatically when you are not using it.",
                "New in-app Marketplace: browse the catalog, grab free models, and redeem licenses without leaving the studio.",
            ],
        },
        {
            "version": "1.0.0-beta.2",
            "date": "2026-07-22",
            "title": "Studio polish",
            "highlights": [
                "Audio Studio gained automation lanes and a MIDI piano roll.",
                "Capture dictation now supports per-segment neural cleanup.",
                "Redesigned Stories timeline with drag-to-trim clips.",
            ],
        },
        {
            "version": "1.0.0-beta.1",
            "date": "2026-06-30",
            "title": "Voice, louder",
            "highlights": [
                "Eight preset Orpheus voices with emotion tags.",
                "Voice profiles can now be cloned from a 30-second sample.",
                "Added the offline licensing module for paid voice packs.",
            ],
        },
    ],
    "announcements": [
        {
            "id": "offline-promise",
            "kind": "info",
            "message": "Everything runs on your machine — your audio never leaves the device.",
            "dismissible": True,
            "scope": "global",
        },
    ],
    "offers": [
        {
            "id": "free-starter",
            "title": "Free starter pack forever",
            "description": "The base TTS, transcription, and planner models are free — no license needed.",
            "code": None,
            "discount_pct": 0,
            "expires_at": None,
            "cta": {"label": "Download starter pack", "href": "/models"},
        },
    ],
}
