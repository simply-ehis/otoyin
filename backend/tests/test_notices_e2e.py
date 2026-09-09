"""E2E: remote-notices push flow (08-notifications-backend), same topology as
``test_marketplace_e2e.py`` — real processes, no mocks:

    fake notices service (in-process ThreadingHTTPServer)
        serves GET /v1/notices -> {"notices": [Announcement, ...]}
      ↑ fetched by
    real otoyin backend (subprocess, ``python -m backend.main``)
        OTOYIN_NOTICES_URL       -> points at the fake
        OTOYIN_NOTICES_TIMEOUT_S=2   fast failure for the offline flow

Flow A (push at startup): the fake serves a remote notice with a NEW id plus
one REPLACING the bundled ``offline-promise`` id; the backend's startup merge
must deliver both via ``GET /content/announcements`` — bundled items keep
their order, the replacement carries the remote text, and remote-only items
append last — while ``/content/offers`` proves the other content surfaces
stay untouched. This is "ship a message without shipping an app release".

Flow B (silent offline degradation): a second backend boots with the notices
URL pointing at a dead port. The app must boot healthy, serve exactly the
bundled announcements, and record the failure at debug level (the
offline-first contract) — no crash, no user-visible error.

Flow C (mid-run publish via poll): the 08 decision — a periodic poll
(NOTICES_POLL_S, mirroring 07's REMOTE_CATALOG_POLL_S) re-merges remote
notices while the app runs, so a notice published mid-session arrives
without a restart. A backend booted against an EMPTY fake publishes a
notice after boot; the poll must deliver it on a later tick (real second
HTTP fetch, same process).

CI gating: marked ``e2e`` and excluded from the default run via
``addopts = -m "not e2e"`` in pyproject; opt in with
``python -m pytest backend/tests/test_notices_e2e.py -m e2e``.
"""

from __future__ import annotations

import http.server
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]

APP_PORT = 18497
FAKE_PORT = 8795
APP_PORT_OFFLINE = 18498
POLL_APP_PORT = 18499
DEAD_PORT = 8799  # nothing listens here: connection refused
BOOT_TIMEOUT_S = 240.0

BUNDLED_ID = "offline-promise"

REMOTE_NEW = {
    "id": "e2e-remote-notice-001",
    "kind": "warning",
    "message": "Scheduled maintenance tonight — exports may be slow.",
    "dismissible": True,
    "scope": "global",
}
REMOTE_REPLACEMENT = {
    "id": BUNDLED_ID,
    "kind": "info",
    "message": "REMOTE OVERRIDE: replaced without shipping an app update.",
    "dismissible": True,
    "scope": "global",
}
# Published only AFTER boot in the poll flow — the startup merge never sees it.
REMOTE_POLL = {
    "id": "e2e-midrun-notice-002",
    "kind": "info",
    "message": "Published while the app was running — delivered by the poll tick.",
    "dismissible": True,
    "scope": "global",
}


class FakeNotices:
    """Mutable notices payload: the test flips what the server serves."""

    def __init__(self) -> None:
        self.notices: list[dict] = []
        self.served = 0

    def payload(self) -> bytes:
        return json.dumps({"notices": self.notices}).encode("utf-8")


def _make_handler(fake: FakeNotices):
    class _Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path.split("?")[0] != "/v1/notices":
                self.send_response(404)
                self.end_headers()
                return
            body = fake.payload()
            fake.served += 1
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args) -> None:
            pass

    return _Handler


def _http_get_json(url: str) -> dict | list:
    with urllib.request.urlopen(url, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _wait_content(port: int, timeout_s: float) -> None:
    """Wait until the content endpoint answers (backend fully booted)."""
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        try:
            _http_get_json(f"http://127.0.0.1:{port}/content/announcements")
            return
        except Exception:
            time.sleep(1)
    raise RuntimeError(f"content endpoint did not answer on :{port} within {timeout_s}s")


def _boot_backend(app_port: int, notices_url: str, label: str) -> dict:
    """Boot the real backend with OTOYIN_NOTICES_URL set. Returns stack dict."""
    data_dir = tempfile.mkdtemp(prefix=f"otoyin-notices-{label}-")
    env = dict(os.environ)
    env.update(
        {
            "OTOYIN_NOTICES_URL": notices_url,
            "OTOYIN_NOTICES_TIMEOUT_S": "2",
            # E2E-only: the fake lives on loopback; without this the SSRF
            # guard rejects the URL before any fetch (see utils/ssrf.py).
            "OTOYIN_SSRF_ALLOW_LOOPBACK": "1",
            "PYTHONIOENCODING": "utf-8",
        }
    )
    return _spawn_backend(app_port, notices_url, label, data_dir, env)


def _boot_polling_backend(app_port: int, notices_url: str, label: str) -> dict:
    """Boot the real backend with a SHORT notices poll tick (Flow C)."""
    data_dir = tempfile.mkdtemp(prefix=f"otoyin-notices-{label}-")
    env = dict(os.environ)
    env.update(
        {
            "OTOYIN_NOTICES_URL": notices_url,
            "OTOYIN_NOTICES_TIMEOUT_S": "2",
            "OTOYIN_NOTICES_POLL_S": "3",
            # E2E-only: the fake lives on loopback; without this the SSRF
            # guard rejects the URL before any fetch (see utils/ssrf.py).
            "OTOYIN_SSRF_ALLOW_LOOPBACK": "1",
            "PYTHONIOENCODING": "utf-8",
        }
    )
    return _spawn_backend(app_port, notices_url, label, data_dir, env)


def _spawn_backend(app_port: int, notices_url: str, label: str, data_dir: str, env: dict) -> dict:
    log_path = Path(data_dir) / "app.log"
    log = log_path.open("wb")
    app = subprocess.Popen(
        [sys.executable, "-X", "utf8", "-m", "backend.main", "--port", str(app_port), "--data-dir", data_dir],
        cwd=REPO_ROOT,
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
    )

    def teardown() -> None:
        app.terminate()
        try:
            app.wait(timeout=10)
        except subprocess.TimeoutExpired:
            app.kill()
            app.wait(timeout=5)
        log.close()

    _wait_content(app_port, BOOT_TIMEOUT_S)
    return {
        "app": app,
        "base": f"http://127.0.0.1:{app_port}",
        "log_path": log_path,
        "teardown": teardown,
    }


@pytest.fixture(scope="module")
def notices_stack():
    """Fake notices server + real backend; the fake is populated BEFORE boot
    so the startup merge (the only refresher) observes the remote payload."""
    fake = FakeNotices()
    fake.notices = [dict(REMOTE_NEW), dict(REMOTE_REPLACEMENT)]
    server = http.server.ThreadingHTTPServer(("127.0.0.1", FAKE_PORT), _make_handler(fake))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    stack = _boot_backend(APP_PORT, f"http://127.0.0.1:{FAKE_PORT}/v1/notices", "push")
    stack["fake"] = fake
    yield stack
    stack["teardown"]()
    server.shutdown()


@pytest.fixture(scope="module")
def offline_stack():
    """Real backend pointed at a dead port: the offline-degradation flow."""
    stack = _boot_backend(APP_PORT_OFFLINE, f"http://127.0.0.1:{DEAD_PORT}/v1/notices", "offline")
    yield stack
    stack["teardown"]()


@pytest.fixture(scope="module")
def poll_stack():
    """Backend with a 3s poll tick, booted against an EMPTY fake: the fake is
    populated only AFTER boot, so only the periodic poll can observe it."""
    fake = FakeNotices()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", FAKE_PORT + 1), _make_handler(fake))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    stack = _boot_polling_backend(POLL_APP_PORT, f"http://127.0.0.1:{FAKE_PORT + 1}/v1/notices", "poll")
    stack["fake"] = fake
    yield stack
    stack["teardown"]()
    server.shutdown()


def _get_announcements(base: str) -> list[dict]:
    """GET /content/announcements, unwrapped ({"announcements": [...]})."""
    resp = _http_get_json(f"{base}/content/announcements")
    return resp.get("announcements", []) if isinstance(resp, dict) else []


def _wait_for_merge(base: str, notice_id: str, timeout_s: float = 30.0) -> list[dict]:
    """The merge runs in a startup background task; poll until it lands."""
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        items = _get_announcements(base)
        if any(a.get("id") == notice_id for a in items):
            return items
        time.sleep(1)
    pytest.fail(f"remote notice {notice_id!r} never appeared within {timeout_s}s")


@pytest.mark.timeout(420)
@pytest.mark.e2e
class TestRemoteNoticePushE2E:
    def test_remote_notices_reach_app_at_startup_without_release(self, notices_stack):
        fake = notices_stack["fake"]
        base = notices_stack["base"]

        items = _wait_for_merge(base, REMOTE_NEW["id"])
        by_id = {a["id"]: a for a in items}

        # New remote id delivered.
        assert REMOTE_NEW["id"] in by_id, f"remote notice missing: {[a['id'] for a in items]}"
        assert by_id[REMOTE_NEW["id"]]["message"] == REMOTE_NEW["message"]

        # Same-id replacement: remote text wins in place.
        assert by_id[BUNDLED_ID]["message"] == REMOTE_REPLACEMENT["message"], (
            "remote item with a bundled id must replace it in place"
        )

        # Merge ordering contract: bundled-order items first, remote-only appended.
        assert items[-1]["id"] == REMOTE_NEW["id"], (
            f"remote-only notice should append last, got order {[a['id'] for a in items]}"
        )

        # Other content surfaces untouched by the merge.
        offers = _http_get_json(f"{base}/content/offers").get("offers", [])
        assert any(o.get("id") == "free-starter" for o in offers)
        whats_new = _http_get_json(f"{base}/content/whats-new").get("entries", [])
        assert len(whats_new) >= 1

        # The fake actually served the fetch (real HTTP, not a shortcut).
        assert fake.served >= 1
        assert notices_stack["app"].poll() is None, "backend must still be running"

        # Evidence in the log: the merge is logged at info with the count.
        log_text = Path(notices_stack["log_path"]).read_text(encoding="utf-8", errors="replace")
        assert "remote notice" in log_text.lower(), "expected 'Merged N remote notice(s)' info log in app.log"

    def test_merge_is_idempotent_on_content_surfaces(self, notices_stack):
        """Repeat reads are stable — the merge happened once, reads are pure."""
        base = notices_stack["base"]
        first = _http_get_json(f"{base}/content/announcements")
        second = _http_get_json(f"{base}/content/announcements")
        assert first == second


@pytest.mark.timeout(420)
@pytest.mark.e2e
class TestOfflineSilenceE2E:
    def test_dead_notices_url_boots_clean_with_bundled_content(self, offline_stack):
        base = offline_stack["base"]

        # Bundled content is served exactly — the failure stayed invisible.
        items = _get_announcements(base)
        assert isinstance(items, list) and items, "bundled announcements must still serve"
        assert BUNDLED_ID in [a["id"] for a in items]
        assert REMOTE_NEW["id"] not in [a["id"] for a in items]

        offers = _http_get_json(f"{base}/content/offers").get("offers", [])
        assert any(o.get("id") == "free-starter" for o in offers)

        # The app is healthy, not crash-looping.
        assert offline_stack["app"].poll() is None, "backend must survive the dead notices URL"

        # Offline-first contract: the failure is recorded ONLY at debug level
        # (announcements.py logs with logger.debug + exc_info), so at the
        # default INFO console level the outage is completely invisible —
        # no traceback, no ERROR line, no scary output. That silence IS the
        # contract: an offline app or notices outage is undetectable to the
        # user in the logs.
        log_text = Path(offline_stack["log_path"]).read_text(encoding="utf-8", errors="replace")
        assert "Remote notices fetch failed" not in log_text, (
            "debug-level breadcrumb must be invisible at the default INFO level"
        )
        assert "Traceback" not in log_text, "no crash may reach the log"
        notice_errors = [line for line in log_text.splitlines() if "ERROR" in line and "notice" in line.lower()]
        assert not notice_errors, f"no user-visible error for the outage: {notice_errors}"


@pytest.mark.timeout(420)
@pytest.mark.e2e
class TestMidRunPublishPollE2E:
    def test_notice_published_midrun_arrives_via_poll_without_restart(self, poll_stack):
        """The 08-decision flow: publish AFTER boot, assert the periodic poll
        delivers it in the SAME process — no restart, no nudge."""
        fake = poll_stack["fake"]
        base = poll_stack["base"]

        # Boot-time baseline: bundled content only — the fake was empty and
        # both the startup merge and every poll so far fetched nothing.
        baseline = _get_announcements(base)
        assert BUNDLED_ID in [a["id"] for a in baseline]
        assert REMOTE_POLL["id"] not in [a["id"] for a in baseline]
        startup_served = fake.served
        assert startup_served >= 1, "startup merge must have fetched the (empty) payload"

        # Publish mid-run: only a background poll can discover this.
        fake.notices = [dict(REMOTE_POLL)]

        # Same-process convergence via the 3s tick (no restart, no nudge).
        deadline = time.monotonic() + 90
        delivered = baseline
        while time.monotonic() < deadline:
            delivered = _get_announcements(base)
            if any(a.get("id") == REMOTE_POLL["id"] for a in delivered):
                break
            time.sleep(2)
        by_id = {a["id"]: a for a in delivered}
        assert REMOTE_POLL["id"] in by_id, (
            f"poll never delivered the mid-run notice; served={fake.served} "
            f"(startup only = {fake.served == startup_served}), got {[a['id'] for a in delivered]}"
        )

        # The merge contract holds for poll-delivered items too: remote-only
        # id appends after bundled content; bundled content is intact.
        assert delivered[-1]["id"] == REMOTE_POLL["id"]
        baseline_by_id = {a["id"]: a for a in baseline}
        assert by_id[BUNDLED_ID]["message"] == baseline_by_id[BUNDLED_ID]["message"], (
            "the poll merge must not alter bundled items"
        )

        # Real HTTP: the fake served multiple fetches (startup + >=1 poll tick).
        assert fake.served > startup_served, "at least one poll tick must have fetched after startup"
        assert poll_stack["app"].poll() is None, "backend must still be running (no restart)"

        # The other content surfaces stay untouched by the poll merge.
        offers = _http_get_json(f"{base}/content/offers").get("offers", [])
        assert any(o.get("id") == "free-starter" for o in offers)

    def test_poll_with_unchanged_payload_is_a_stable_noop(self, poll_stack):
        """Idempotency across ticks: repeated polls of the same payload leave
        the served list byte-identical (same-id replace in place, no dupes)."""
        base = poll_stack["base"]
        first = _http_get_json(f"{base}/content/announcements")
        time.sleep(7)  # > 2 poll ticks at 3s
        second = _http_get_json(f"{base}/content/announcements")
        assert first == second, "repeated polls must not duplicate or reorder notices"
