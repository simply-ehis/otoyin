"""Tests for opt-in crash reporting (services.crash_reports + routes.crashes)."""

from __future__ import annotations

import json

import pytest

from backend.routes import crashes as crashes_routes
from backend.services import crash_reports


@pytest.fixture(autouse=True)
def isolated_log(tmp_path, monkeypatch):
    """Point the crash log at a temp dir; start each test opted out."""
    monkeypatch.setattr(crash_reports, "_get_log_path", lambda: tmp_path / "crashes.jsonl")
    monkeypatch.setattr(crash_reports, "_config", crash_reports.CrashConfig())
    monkeypatch.setattr(crash_reports, "CRASH_URL", "")
    return


def _read_all(tmp_path) -> list:
    path = tmp_path / "crashes.jsonl"
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


class FakeResponse:
    def raise_for_status(self):
        return None


def test_scrub_removes_emails_keys_and_home_paths():
    dirty = (
        "contact buyer@example.com with key sk-abc123XYZ456 and Bearer tok.en_123 "
        "api_key=supersecret file C:\\Users\\Ehis\\proj\\a.wav /Users/ehis/b.wav "
        "https://user:p4ss@host/x"
    )
    clean = crash_reports.scrub_text(dirty)
    assert "buyer@example.com" not in clean
    assert "sk-abc123XYZ456" not in clean
    assert "supersecret" not in clean
    assert "Ehis" not in clean and "ehis" not in clean
    assert "p4ss" not in clean
    assert "<email>" in clean and "<redacted-key>" in clean and "<home>" in clean


def test_scrub_recurses_into_context():
    out = crash_reports.scrub_value({"a": ["x admin@example.com"], "n": 3})
    assert out == {"a": ["x <email>"], "n": 3}


def test_capture_disabled_is_noop(tmp_path):
    with pytest.raises(ValueError):
        raise ValueError("boom buyer@example.com")
    assert crash_reports.capture_exception(ValueError("boom buyer@example.com")) is None
    assert _read_all(tmp_path) == []


def test_capture_enabled_stores_scrubbed_record(tmp_path):
    crash_reports.enable_crash_reporting()
    try:
        raise RuntimeError("failed for buyer@example.com")
    except RuntimeError as exc:
        record = crash_reports.capture_exception(exc, context={"path": "/generate"})
    assert record is not None and record["layer"] == "backend"
    assert record["kind"] == "RuntimeError"
    assert "buyer@example.com" not in record["message"]
    assert "Traceback" in record["stack"]
    stored = _read_all(tmp_path)
    assert len(stored) == 1 and stored[0]["id"] == record["id"]


def test_capture_report_rejects_unknown_layer(tmp_path):
    crash_reports.enable_crash_reporting()
    record = crash_reports.capture_report(layer="exploit", kind="X", message="m")
    assert record is not None and record["layer"] == "frontend"


def test_forward_called_when_configured(tmp_path, monkeypatch):
    calls = []

    import httpx

    def _fake_post(url, json=None, timeout=None):
        calls.append((url, json))
        return FakeResponse()

    monkeypatch.setattr(httpx, "post", _fake_post)
    monkeypatch.setattr(crash_reports, "CRASH_URL", "https://example.invalid")
    crash_reports.enable_crash_reporting()
    try:
        raise ValueError("kablam")
    except ValueError as exc:
        record = crash_reports.capture_exception(exc)
    assert record is not None and record["forwarded"] is True
    assert calls and calls[0][0].endswith("/v1/crashes")


def test_forward_failure_keeps_local(tmp_path, monkeypatch):
    import httpx

    def _boom(*a, **k):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(httpx, "post", _boom)
    monkeypatch.setattr(crash_reports, "CRASH_URL", "https://example.invalid")
    crash_reports.enable_crash_reporting()
    try:
        raise ValueError("kablam")
    except ValueError as exc:
        record = crash_reports.capture_exception(exc)
    assert record is not None and record["forwarded"] is False
    assert len(_read_all(tmp_path)) == 1


def test_toggle_route_flips_status():
    assert crashes_routes.toggle_crash_reporting(crashes_routes.ToggleRequest(enabled=True))["enabled"] is True
    assert crash_reports.is_enabled() is True
    assert crashes_routes.toggle_crash_reporting(crashes_routes.ToggleRequest(enabled=False))["enabled"] is False


def test_report_route_drops_when_disabled():
    body = crashes_routes.ClientReport(layer="frontend", kind="Error", message="m")
    assert crashes_routes.submit_crash_report(body) == {"stored": False, "id": None}


def test_report_route_stores_when_enabled(tmp_path):
    crash_reports.enable_crash_reporting()
    body = crashes_routes.ClientReport(
        layer="frontend", kind="TypeError", message="x is undefined buyer@example.com", stack="at f (a.js:1)"
    )
    out = crashes_routes.submit_crash_report(body)
    assert out["stored"] is True
    stored = _read_all(tmp_path)
    assert len(stored) == 1 and "buyer@example.com" not in stored[0]["message"]


def test_list_and_clear_routes(tmp_path):
    crash_reports.enable_crash_reporting()
    try:
        raise ValueError("one")
    except ValueError as exc:
        crash_reports.capture_exception(exc)
    assert len(crashes_routes.list_crash_reports(limit=10)["reports"]) == 1
    assert crashes_routes.clear_crash_reports() == {"removed": 1}
    assert crashes_routes.list_crash_reports()["reports"] == []


def test_forward_live_against_stub_server(tmp_path, monkeypatch):
    """End-to-end forward path (serialize → POST → counters) without prod.

    Spins a real local HTTP stub for the marketplace ingest; the only
    unverified remainder is the prod deploy + secret + admin read.
    """
    import json as _json
    import threading
    from http.server import BaseHTTPRequestHandler, HTTPServer

    received: list[dict] = []

    class _Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            length = int(self.headers.get("Content-Length", 0))
            received.append({"path": self.path, "body": _json.loads(self.rfile.read(length) or b"{}")})
            payload = _json.dumps({"status": "ok", "id": 1}).encode()
            self.send_response(201)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", 0), _Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        monkeypatch.setattr(crash_reports, "CRASH_URL", f"http://127.0.0.1:{server.server_port}")
        crash_reports.enable_crash_reporting()
        try:
            raise RuntimeError("live-forward probe buyer@example.com")
        except RuntimeError as exc:
            record = crash_reports.capture_exception(exc, context={"probe": True})
        assert record is not None and record["forwarded"] is True
        assert len(received) == 1
        assert received[0]["path"] == "/v1/crashes"
        sent = received[0]["body"]["report"]
        assert sent["id"] == record["id"]
        assert sent["layer"] == "backend" and sent["kind"] == "RuntimeError"
        assert "buyer@example.com" not in sent["message"]  # scrubbed pre-send
        assert crash_reports.get_status()["reports_forwarded_total"] == 1
        assert crash_reports.get_status()["last_sent"] != ""
    finally:
        server.shutdown()
        thread.join(timeout=5)


class TestMiddleware:
    async def test_reraises_after_capture(self, tmp_path):
        crash_reports.enable_crash_reporting()
        mw = crashes_routes.CrashCaptureMiddleware(app=None)

        class Req:
            url = type("U", (), {"path": "/boom"})()
            method = "GET"

        async def _raise(_request):
            raise RuntimeError("backend blew up")

        with pytest.raises(RuntimeError):
            await mw.dispatch(Req(), _raise)
        assert len(_read_all(tmp_path)) == 1

    async def test_passthrough_when_disabled(self):
        sentinel = object()

        async def _ok(_request):
            return sentinel

        mw = crashes_routes.CrashCaptureMiddleware(app=None)

        class Req:
            url = type("U", (), {"path": "/health"})()
            method = "GET"

        assert await mw.dispatch(Req(), _ok) is sentinel
