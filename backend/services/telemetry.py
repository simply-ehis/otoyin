"""Opt-in telemetry — anonymous usage analytics."""

import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

logger = logging.getLogger(__name__)

TELEMETRY_ENDPOINT = "https://telemetry.otoyin.app/events"


@dataclass
class TelemetryConfig:
    enabled: bool = False
    anonymous_id: str = ""
    last_sent: str = ""
    endpoint: str = field(default_factory=lambda: TELEMETRY_ENDPOINT)
    events_sent_total: int = 0


_config = TelemetryConfig()


def enable_telemetry():
    global _config
    _config.enabled = True
    if not _config.anonymous_id:
        _config.anonymous_id = str(uuid.uuid4())


def disable_telemetry():
    global _config
    _config.enabled = False


def is_enabled() -> bool:
    return _config.enabled


def get_anonymous_id() -> str:
    if not _config.anonymous_id:
        _config.anonymous_id = str(uuid.uuid4())
    return _config.anonymous_id


_events = []


def _queue_event(event: dict):
    _events.append(event)
    if len(_events) >= 10:
        _flush_events()


def _flush_events():
    global _events
    if not _events:
        return
    batch = list(_events)
    _events = []
    try:
        import httpx

        resp = httpx.post(
            _config.endpoint,
            json={"events": batch},
            timeout=5.0,
        )
        resp.raise_for_status()
        _config.last_sent = datetime.now(UTC).isoformat()
        _config.events_sent_total += len(batch)
    except Exception as e:
        logger.debug("Telemetry flush failed (events lost): %s", e)
        # Re-queue on failure so events aren't silently dropped
        _events.extend(batch)


def get_telemetry_status() -> dict:
    return {
        "enabled": _config.enabled,
        "anonymous_id": get_anonymous_id() if _config.enabled else None,
        "events_queued": len(_events),
        "events_sent_total": _config.events_sent_total,
        "last_sent": _config.last_sent,
    }


def track_event(name: str, properties: dict | None = None) -> None:
    """Record a single anonymous usage event, if the user has opted in.

    No-op when telemetry is disabled (the default) — nothing is recorded or
    queued. When enabled, the event is queued locally via _queue_event and
    only leaves the device once 10 events have accumulated (or a future
    manual flush), so a user who enables telemetry and generates a couple
    of clips before disabling it again never actually sends anything.
    """

    if not _config.enabled:
        return
    event = {
        "name": name,
        "properties": properties or {},
        "timestamp": datetime.now(UTC).isoformat(),
    }
    _append_to_log(event)
    _queue_event(event)


def get_events_sent() -> int:
    """Count of events sent successfully, plus any still queued locally."""

    return _config.events_sent_total + len(_events)


# ---------------------------------------------------------------------------
# Local event log — every tracked event is appended to a JSONL file so it
# survives restarts and can be queried by the dashboard.
# ---------------------------------------------------------------------------


def _get_log_path() -> Path:
    from ..config import get_data_dir

    return get_data_dir() / "telemetry.jsonl"


def _append_to_log(event: dict) -> None:
    """Append a single event dict to the local JSONL log file."""
    try:
        log_path = _get_log_path()
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")
    except Exception as e:
        logger.debug("Telemetry log write failed: %s", e)


def _read_log() -> list[dict]:
    """Read all events from the local JSONL log file."""
    log_path = _get_log_path()
    if not log_path.exists():
        return []
    events = []
    try:
        with open(log_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        events.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
    except Exception as e:
        logger.debug("Telemetry log read failed: %s", e)
    return events


def query_events(
    event_type: str | None = None,
    since: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict:
    """Query events from the local log with optional type filter and time range."""
    events = _read_log()

    if event_type:
        events = [e for e in events if e.get("name") == event_type]

    if since:
        try:
            since_dt = datetime.fromisoformat(since)
            events = [e for e in events if datetime.fromisoformat(e.get("timestamp", "")) >= since_dt]
        except (ValueError, TypeError):
            pass

    total = len(events)
    events = events[::-1]  # newest first
    page = events[offset : offset + limit]

    return {
        "events": page,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


def get_summary() -> dict:
    """Aggregate event counts by type and compute key metrics."""
    events = _read_log()
    by_type: dict[str, int] = {}
    active_days_set: set[str] = set()
    for e in events:
        name = e.get("name", "unknown")
        by_type[name] = by_type.get(name, 0) + 1
        ts = e.get("timestamp", "")
        if ts:
            try:
                dt = datetime.fromisoformat(ts)
                active_days_set.add(dt.date().isoformat())
            except Exception:
                pass

    generation_ok = by_type.get("generation_completed", 0)
    generation_fail = by_type.get("generation_failed", 0)
    generation_total = generation_ok + generation_fail
    success_rate = round(generation_ok / generation_total * 100, 1) if generation_total > 0 else 0

    return {
        "total_events": len(events),
        "events_by_type": by_type,
        "active_days": len(active_days_set),
        "generation_total": generation_total,
        "generation_success_rate": success_rate,
        "profiles_created": by_type.get("profile_created", 0),
        "models_downloaded": by_type.get("model_downloaded", 0),
        "effects_applied": by_type.get("effects_applied", 0),
    }


def get_timeline(since: str | None = None, bucket: str = "hour") -> list[dict]:
    """Return event counts bucketed by time interval for charting."""
    events = _read_log()

    if since:
        try:
            since_dt = datetime.fromisoformat(since)
            events = [e for e in events if datetime.fromisoformat(e.get("timestamp", "")) >= since_dt]
        except (ValueError, TypeError):
            pass

    buckets: dict[str, int] = {}
    for e in events:
        ts = e.get("timestamp", "")
        if not ts:
            continue
        try:
            dt = datetime.fromisoformat(ts)
        except (ValueError, TypeError):
            continue
        if bucket == "day":
            key = dt.strftime("%Y-%m-%d")
        elif bucket == "week":
            key = dt.strftime("%Y-W%W")
        else:
            key = dt.strftime("%Y-%m-%d %H:00")
        buckets[key] = buckets.get(key, 0) + 1

    timeline = [{"bucket": k, "count": v} for k, v in sorted(buckets.items())]
    return timeline
