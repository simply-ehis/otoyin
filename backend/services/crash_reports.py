"""Crash reporting — backend exceptions + forwarded client reports.

Deliberately NOT a third-party SaaS (Sentry etc.): this app is
offline-first and privacy-forward, and a crash-reporting SaaS would be a
new data flow to disclose and justify. Instead this mirrors the telemetry
service in this same package with one deliberate difference:

- Local capture is ALWAYS on: crashes are appended to an on-device JSONL
  log (scrubbed first) so a dead backend is diagnosable after the fact.
- Remote forwarding is OPT-IN via the toggle below (and requires
  OTOYIN_CRASH_URL to be configured — otherwise there is nowhere to send).

Separate toggle from usage telemetry (``telemetry.py``): a crash report is
"the app broke, here's a stack trace", not "the user clicked X". A user
can allow one and not the other.

Redaction (``scrub``) runs BEFORE anything is stored or sent: emails, API
keys/tokens, credentialed URLs, and OS user-home paths are replaced. See
``REDACTED`` patterns below for the exact list.
"""

from __future__ import annotations

import json
import logging
import os
import re
import traceback
import uuid
from collections import deque
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Remote ingest: POST {url}/v1/crashes. Unset (default) = local log only.
CRASH_URL = os.environ.get("OTOYIN_CRASH_URL", "").strip()
CRASH_TIMEOUT_S = float(os.environ.get("OTOYIN_CRASH_TIMEOUT_S", "5"))

MAX_MESSAGE_CHARS = 2000
MAX_STACK_CHARS = 20000
MAX_CONTEXT_CHARS = 4000

# (compiled pattern, replacement) — applied in order to every string that
# enters a crash record. Add new secrets here, never at call sites.
_REDACTIONS: list[tuple[re.Pattern, str]] = [
    # Email addresses (receipts, login names in messages).
    (re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"), "<email>"),
    # API keys / tokens: sk-..., Bearer ..., api_key=/apikey= values.
    (re.compile(r"\bsk-[A-Za-z0-9_-]{8,}"), "<redacted-key>"),
    (re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/-]+=*"), "Bearer <redacted-key>"),
    (re.compile(r"(?i)(api[_-]?key\s*[:=]\s*['\"]?)[^'\"\s,}]+"), r"\1<redacted-key>"),
    # Credentialed URLs: scheme://user:pass@host.
    (re.compile(r"(://)[^/\s:@]+:[^/\s@]+@"), r"\1<credentials>@"),
    # OS user-home paths (Windows / macOS / Linux usernames).
    (re.compile(r"[A-Za-z]:\\Users\\[^\\/:*?\"<>|]+"), "<home>"),
    (re.compile(r"/Users/[^/\s]+"), "<home>"),
    (re.compile(r"/home/[^/\s]+"), "<home>"),
]


def scrub_text(text: str) -> str:
    """Redact sensitive content from a free-form string."""
    if not text:
        return ""
    for pattern, replacement in _REDACTIONS:
        text = pattern.sub(replacement, text)
    return text


def scrub_value(value: Any, _depth: int = 0) -> Any:
    """Recursively redact strings inside dicts/lists (context payloads)."""
    if _depth > 4:
        return "<truncated>"
    if isinstance(value, str):
        return scrub_text(value)
    if isinstance(value, dict):
        return {str(k): scrub_value(v, _depth + 1) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [scrub_value(v, _depth + 1) for v in value]
    return value


@dataclass
class CrashConfig:
    # Remote FORWARDING toggle (Settings → Support). Local capture below is
    # always on — this flag only controls the POST to OTOYIN_CRASH_URL.
    enabled: bool = False
    last_sent: str = ""
    reports_stored_total: int = 0
    reports_forwarded_total: int = 0


_config = CrashConfig()

# Recent request trail ("last actions"): appended per request by the crash
# middleware, attached to every record. Bounded — never grows.
_recent_requests: deque[dict] = deque(maxlen=20)


def record_action(method: str, path: str, request_id: str | None = None) -> None:
    """Note one handled request for the next crash record. Never raises."""
    try:
        _recent_requests.append(
            {
                "ts": datetime.now(UTC).isoformat(),
                "method": method,
                "path": path[:200],
                "request_id": request_id,
            }
        )
    except Exception:
        pass


def collect_diagnostics() -> dict:
    """Snapshot memory + model residency + queue depths. Never raises."""
    diag: dict[str, Any] = {}
    try:
        from ..utils.memory import available_mb, get_system_total_mb

        diag["ram_free_mb"] = available_mb()
        diag["ram_total_mb"] = get_system_total_mb()
    except Exception as e:
        diag["ram_error"] = str(e)[:120]
    try:
        from ..utils.vram_pressure import get_vram_status

        vram = get_vram_status()
        diag["vram"] = {
            "available": bool(getattr(vram, "available", False)),
            "used_mb": getattr(vram, "used_mb", None),
            "total_mb": getattr(vram, "total_mb", None),
            "pressure": str(getattr(vram, "pressure", ""))[:40],
        }
    except Exception as e:
        diag["vram_error"] = str(e)[:120]
    try:
        from ..utils.model_lifecycle import lifecycle_manager

        loaded = []
        for name, handle in lifecycle_manager._engines.items():
            try:
                if handle.is_loaded():
                    loaded.append(name)
            except Exception:
                continue
        diag["loaded_engines"] = sorted(loaded)
    except Exception as e:
        diag["engines_error"] = str(e)[:120]
    try:
        from ..utils.tasks import get_task_manager

        tm = get_task_manager()
        diag["active_downloads"] = len(tm.get_active_downloads())
        diag["active_generations"] = len(tm.get_active_generations())
    except Exception as e:
        diag["queue_error"] = str(e)[:120]
    return diag


def enable_crash_reporting() -> None:
    global _config
    _config.enabled = True


def disable_crash_reporting() -> None:
    global _config
    _config.enabled = False


def is_enabled() -> bool:
    return _config.enabled


def get_status() -> dict:
    return {
        # "enabled" = remote forwarding toggle. Local capture is always on.
        "enabled": _config.enabled,
        "local_capture": True,
        "reports_stored_total": _config.reports_stored_total,
        "reports_forwarded_total": _config.reports_forwarded_total,
        "last_sent": _config.last_sent,
        "remote_configured": bool(CRASH_URL),
    }


def _get_log_path() -> Path:
    from ..config import get_data_dir

    return get_data_dir() / "crashes.jsonl"


def _append_to_log(record: dict) -> None:
    try:
        log_path = _get_log_path()
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception as e:
        logger.debug("Crash log write failed: %s", e)


def _forward(record: dict) -> bool:
    """POST a scrubbed record to the remote ingest. Never raises."""
    if not CRASH_URL:
        return False
    try:
        import httpx

        resp = httpx.post(
            CRASH_URL.rstrip("/") + "/v1/crashes",
            json={"report": record},
            timeout=CRASH_TIMEOUT_S,
        )
        resp.raise_for_status()
        _config.last_sent = datetime.now(UTC).isoformat()
        _config.reports_forwarded_total += 1
        return True
    except Exception as e:
        logger.debug("Crash forward failed (kept locally): %s", e)
        return False


def _build_record(
    *,
    layer: str,
    kind: str,
    message: str,
    stack: str = "",
    context: dict | None = None,
) -> dict:
    return {
        "id": uuid.uuid4().hex[:16],
        "timestamp": datetime.now(UTC).isoformat(),
        "layer": layer,
        "kind": kind,
        "message": scrub_text(message)[:MAX_MESSAGE_CHARS],
        "stack": scrub_text(stack)[:MAX_STACK_CHARS],
        "context": json.loads(json.dumps(scrub_value(context or {}), default=str)[:MAX_CONTEXT_CHARS]),
    }


def store_report(record: dict) -> dict:
    """Persist an already-built record locally; forward only if opted in."""
    _append_to_log(record)
    _config.reports_stored_total += 1
    record = {**record, "forwarded": _forward(record) if _config.enabled else False}
    return record


def _with_diagnostics(context: dict | None) -> dict:
    """Merge recent requests + machine state into a capture's context."""
    merged = dict(context or {})
    try:
        merged.setdefault("recent_requests", list(_recent_requests)[-20:])
    except Exception:
        pass
    try:
        merged.setdefault("diagnostics", collect_diagnostics())
    except Exception:
        pass
    return merged


def capture_exception(
    exc: BaseException,
    *,
    context: dict | None = None,
) -> dict | None:
    """Capture a backend exception. Always stored locally (scrubbed first)."""
    stack = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    return store_report(
        _build_record(
            layer="backend",
            kind=type(exc).__name__,
            message=str(exc) or repr(exc),
            stack=stack,
            context=_with_diagnostics(context),
        )
    )


def capture_report(
    *,
    layer: str,
    kind: str,
    message: str,
    stack: str = "",
    context: dict | None = None,
) -> dict | None:
    """Capture a client-built report (frontend/Rust via POST /crashes/report).

    Scrubbed again server-side — never trust the sender to have redacted.
    Always stored locally; forwarded only when opted in.
    """
    if layer not in ("frontend", "rust", "backend"):
        layer = "frontend"
    return store_report(
        _build_record(
            layer=layer, kind=kind[:120], message=message, stack=stack, context=_with_diagnostics(context)
        )
    )


def read_reports(limit: int = 100) -> list[dict]:
    """Newest-first local crash records (for the settings/diagnostics UI)."""
    log_path = _get_log_path()
    if not log_path.exists():
        return []
    records = []
    try:
        with open(log_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    except Exception as e:
        logger.debug("Crash log read failed: %s", e)
    records.reverse()
    return records[: max(0, limit)]


def clear_reports() -> int:
    """Delete the local crash log. Returns the number of records removed."""
    records = read_reports(limit=1000000)
    try:
        _get_log_path().unlink(missing_ok=True)
    except Exception as e:
        logger.debug("Crash log clear failed: %s", e)
        return 0
    return len(records)
