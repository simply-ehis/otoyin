"""Tests for process-level fatal handlers (backend.fatal_handlers)."""

from __future__ import annotations

import sys
import threading

import backend.fatal_handlers as fh
from backend.services import crash_reports


def _isolate_crash_log(tmp_path, monkeypatch):
    monkeypatch.setattr(crash_reports, "_get_log_path", lambda: tmp_path / "crashes.jsonl")
    monkeypatch.setattr(crash_reports, "_config", crash_reports.CrashConfig())
    monkeypatch.setattr(crash_reports, "CRASH_URL", "")
    crash_reports._recent_requests.clear()


def test_install_is_idempotent_and_sets_hooks():
    assert fh.install_fatal_handlers() is True
    assert fh.install_fatal_handlers() is True
    assert sys.excepthook is fh._excepthook
    assert threading.excepthook is fh._threading_excepthook
    assert sys.unraisablehook is fh._unraisablehook


def test_excepthook_captures_locally(tmp_path, monkeypatch):
    _isolate_crash_log(tmp_path, monkeypatch)
    try:
        raise RuntimeError("main-thread boom buyer@example.com")
    except RuntimeError:
        fh._excepthook(*sys.exc_info())
    stored = crash_reports.read_reports(limit=10)
    assert len(stored) == 1
    assert stored[0]["context"]["origin"] == "main-thread"
    assert "buyer@example.com" not in stored[0]["message"]


def test_excepthook_passes_through_keyboard_interrupt(tmp_path, monkeypatch):
    # Isolate first: _config.reports_stored_total is a process-global
    # cumulative counter, so asserting on it without isolation makes this
    # test order-dependent (fails in full-suite runs after any other test
    # captured a report). The intent is only "no record for this call".
    _isolate_crash_log(tmp_path, monkeypatch)
    fh._excepthook(KeyboardInterrupt, KeyboardInterrupt(), None)
    # Default hook prints; key point: no crash record, no raise.
    assert crash_reports._config.reports_stored_total == 0


def test_threading_excepthook_names_thread(tmp_path, monkeypatch):
    _isolate_crash_log(tmp_path, monkeypatch)
    try:
        raise ValueError("worker blew up")
    except ValueError:
        exc_type, exc_value, exc_tb = sys.exc_info()
    args = threading.ExceptHookArgs([exc_type, exc_value, exc_tb, threading.current_thread()])
    fh._threading_excepthook(args)
    stored = crash_reports.read_reports(limit=10)
    assert len(stored) == 1
    assert stored[0]["context"]["origin"].startswith("thread:")


def test_unraisablehook_ignores_none_exc():
    before = crash_reports._config.reports_stored_total
    fh._unraisablehook(type("U", (), {"exc_value": None, "object": object()})())
    assert crash_reports._config.reports_stored_total == before


def test_capture_uncaught_never_raises(monkeypatch):
    monkeypatch.setattr(fh.logger, "critical", lambda *a, **k: (_ for _ in ()).throw(OSError("log down")))
    monkeypatch.setattr(
        crash_reports, "capture_exception", lambda *a, **k: (_ for _ in ()).throw(OSError("store down"))
    )
    try:
        raise RuntimeError("x")
    except RuntimeError:
        fh._capture_uncaught(*sys.exc_info(), origin="test")  # must not raise
