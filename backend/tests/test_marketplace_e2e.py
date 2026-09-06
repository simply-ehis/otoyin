"""E2E: publish-then-nudge marketplace flow, promoted from the 07 Part C probe.

Topology (real processes, no mocks):

    fake marketplace (in-process ThreadingHTTPServer)
        serves GET /v1/catalog signed with the dev Ed25519 keypair
      ↑ fetched by
    real otoyin backend (subprocess, ``python -m backend.main``)
        OTOYIN_CATALOG_URL        -> points at the fake
        OTOYIN_CATALOG_REFRESH_S=2    staleness threshold: 2 seconds
        OTOYIN_CATALOG_POLL_S=3600    background poll effectively off, so the
                                      ONLY refresher under test is the
                                      POST /marketplace/catalog/refresh nudge

Flow A (nudge): catalog v1 (new product absent) -> the fake flips to v2
(product published while the app is running) -> wait past the stale
threshold -> POST the Store-open nudge -> GET /marketplace/catalog must
contain the new product, in the SAME app process (no restart).

Flow B (background poll): a second backend boots with
OTOYIN_CATALOG_POLL_S=1 so app.py's periodic poll loop fires every second;
the fake flips to v2 with no nudge sent, and the catalog must converge via
the tick alone — a product published between Store visits appears without
the Store being opened or the app restarted.

Flow C (outage → hint → recovery): with the real backend running, the fake
marketplace is killed outright (connection refused) → POST /refresh must
report ``{refreshed: false, reason: "failed"}`` (the exact payload the Store
maps to its dismissible failure hint) while the last catalog stays served →
the fake is resurrected and publishes a new product → the next nudge must
report ``refreshed: true`` and the catalog must contain it, all in the SAME
backend process — proving recovery without an app restart.

CI gating: marked ``e2e`` and excluded from the default run via
``addopts = -m "not e2e"`` in pyproject; opt in with
``python -m pytest backend/tests/test_marketplace_e2e.py -m e2e``.
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

APP_PORT = 18493
FAKE_PORT = 8791
APP_PORT_POLL = 18494
FAKE_PORT_POLL = 8792
APP_PORT_OUTAGE = 18496
FAKE_PORT_OUTAGE = 8794
NEW_PRODUCT_ID = "e2e-new-product-001"
STALE_WAIT_S = 4.0  # > OTOYIN_CATALOG_REFRESH_S=2
BOOT_TIMEOUT_S = 240.0

BASE_PRODUCTS: list[dict] = [
    {
        "id": "kokoro-onnx",
        "name": "Kokoro 82M",
        "category": "tts",
        "price_usd": 0,
        "paid": False,
        "quality_score": 10,
    },
    {
        "id": "whisper-small-en",
        "name": "Whisper Small EN",
        "category": "stt",
        "price_usd": 5,
        "paid": True,
        "quality_score": 7,
    },
]

NEW_PRODUCT: dict = {
    "id": NEW_PRODUCT_ID,
    "name": "E2E Brand-New Engine",
    "category": "tts",
    "price_usd": 9,
    "paid": True,
    "quality_score": 6,
    "note": "published while the app was running",
}


class FakeMarketplace:
    """Stateful fake: v1 (bundled) or v2 (+ published product), always signed."""

    def __init__(self) -> None:
        self.products = list(BASE_PRODUCTS)
        self.served = 0

    def serve_v1(self) -> None:
        self.products = list(BASE_PRODUCTS)

    def serve_v2(self) -> None:
        assert NEW_PRODUCT_ID not in [p["id"] for p in self.products]
        self.products = [*list(BASE_PRODUCTS), dict(NEW_PRODUCT)]

    def catalog_json(self) -> bytes:
        from backend.services import licensing  # dev keypair lives here

        payload = {
            "schema_version": "1.0",
            "signed_at": time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime()),
            "currency": "usd",
            "products": self.products,
        }
        signed = licensing.sign_license(payload)  # dev private key by default
        return json.dumps(signed).encode("utf-8")


class FlakyMarketplaceServer:
    """Outage-simulation wrapper around the fake's ThreadingHTTPServer.

    ``kill()`` shuts the real socket down (connection refused — a genuinely
    dead server, not an error response), ``resurrect()`` rebinds the same
    port. The backend's remote-catalog fetch must survive both directions:
    failure surfaces as ``reason="failed"`` (the Store's hint trigger) and
    recovery swaps the catalog in-place.
    """

    def __init__(self, fake: FakeMarketplace, port: int) -> None:
        self._fake = fake
        self._port = port
        self._server: http.server.ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None
        self._start()

    def _start(self) -> None:
        self._server = http.server.ThreadingHTTPServer(("127.0.0.1", self._port), _make_handler(self._fake))
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    def kill(self) -> None:
        assert self._server is not None and self._thread is not None
        self._server.shutdown()
        self._server.server_close()  # release the socket: port is truly dead
        self._thread.join(timeout=5)
        self._server = None
        self._thread = None

    def resurrect(self) -> None:
        assert self._server is None, "resurrect() requires a killed server"
        self._start()


def _make_handler(fake: FakeMarketplace):
    class _Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path.split("?")[0] != "/v1/catalog":
                self.send_response(404)
                self.end_headers()
                return
            body = fake.catalog_json()
            fake.served += 1
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args) -> None:
            pass

    return _Handler


def _http_get_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _http_post_json(url: str) -> dict:
    req = urllib.request.Request(url, method="POST")
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _wait_catalog(port: int, timeout_s: float) -> None:
    """Wait until the catalog endpoint answers (health needs a TTS engine)."""
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        try:
            _http_get_json(f"http://127.0.0.1:{port}/marketplace/catalog")
            return
        except Exception:
            time.sleep(1)
    raise RuntimeError(f"catalog endpoint did not answer on :{port} within {timeout_s}s")


def _boot_stack(fake_port: int, app_port: int, poll_s: str):
    """Boot a fake marketplace + real backend subprocess with a short
    staleness threshold and the given poll tick. Returns a teardown callback
    plus handles; the caller wraps this in a fixture."""
    fake = FakeMarketplace()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", fake_port), _make_handler(fake))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    data_dir = tempfile.mkdtemp(prefix="otoyin-e2e-")
    env = dict(os.environ)
    env.update(
        {
            "OTOYIN_CATALOG_URL": f"http://127.0.0.1:{fake_port}/v1/catalog",
            "OTOYIN_CATALOG_REFRESH_S": "2",
            "OTOYIN_CATALOG_POLL_S": poll_s,
            "PYTHONIOENCODING": "utf-8",
        }
    )
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
        server.shutdown()
        log.close()

    _wait_catalog(app_port, BOOT_TIMEOUT_S)
    return {
        "fake": fake,
        "app": app,
        "log_path": log_path,
        "base": f"http://127.0.0.1:{app_port}",
        "teardown": teardown,
    }


@pytest.fixture(scope="module")
def e2e_stack():
    """Fake marketplace + real backend shared by the nudge-path tests.
    POLL_S=3600 disables the background poll so the nudge is the only
    refresher under test."""
    stack = _boot_stack(FAKE_PORT, APP_PORT, poll_s="3600")
    yield stack
    stack["teardown"]()


@pytest.fixture(scope="module")
def e2e_stack_poll():
    """Separate stack with a 1s background poll tick: exercises the periodic
    poll loop (app.py ``_bg_refresh_remote_catalog``) end-to-end."""
    stack = _boot_stack(FAKE_PORT_POLL, APP_PORT_POLL, poll_s="1")
    yield stack
    stack["teardown"]()


@pytest.fixture(scope="module")
def e2e_stack_outage():
    """Separate stack for Flow C: POLL_S=3600 (the nudge is the only
    refresher, so a refresh result always reflects an explicit check) and
    the fake served through ``FlakyMarketplaceServer`` so the test can kill
    and resurrect it mid-run."""
    fake = FakeMarketplace()
    flaky = FlakyMarketplaceServer(fake, FAKE_PORT_OUTAGE)
    data_dir = tempfile.mkdtemp(prefix="otoyin-e2e-outage-")
    env = dict(os.environ)
    env.update(
        {
            "OTOYIN_CATALOG_URL": f"http://127.0.0.1:{FAKE_PORT_OUTAGE}/v1/catalog",
            "OTOYIN_CATALOG_REFRESH_S": "2",
            "OTOYIN_CATALOG_POLL_S": "3600",
            "PYTHONIOENCODING": "utf-8",
        }
    )
    log_path = Path(data_dir) / "app.log"
    log = log_path.open("wb")
    app = subprocess.Popen(
        [sys.executable, "-X", "utf8", "-m", "backend.main", "--port", str(APP_PORT_OUTAGE), "--data-dir", data_dir],
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
        flaky.kill()
        log.close()

    # Boot-time fetches race the app's startup; a transient connection
    # refusal is fine (offline-first keeps the bundled catalog), but wait
    # until the catalog API itself is live before handing the test the stack.
    _wait_catalog(APP_PORT_OUTAGE, BOOT_TIMEOUT_S)
    yield {"fake": fake, "flaky": flaky, "app": app, "base": f"http://127.0.0.1:{APP_PORT_OUTAGE}"}
    teardown()


@pytest.mark.timeout(420)
@pytest.mark.e2e
class TestPublishThenNudgeE2E:
    def test_published_product_appears_after_nudge_without_restart(self, e2e_stack):
        fake = e2e_stack["fake"]
        app = e2e_stack["app"]
        base = e2e_stack["base"]

        # v1: bundled product present, new product absent.
        cat1 = _http_get_json(f"{base}/marketplace/catalog")
        ids1 = [p["id"] for p in cat1["products"]]
        assert "kokoro-onnx" in ids1, f"expected bundled product, got {ids1}"
        assert NEW_PRODUCT_ID not in ids1, "new product must not exist yet"

        # Publish: flip the fake to v2 and wait past the stale threshold.
        fake.serve_v2()
        time.sleep(STALE_WAIT_S)

        # The Store-open nudge (stale-gated) must fetch + swap.
        nudge = _http_post_json(f"{base}/marketplace/catalog/refresh")
        assert nudge == {"refreshed": True, "reason": None}, f"nudge should have refreshed, got {nudge}"

        # Same process, new catalog.
        cat2 = _http_get_json(f"{base}/marketplace/catalog")
        ids2 = [p["id"] for p in cat2["products"]]
        assert NEW_PRODUCT_ID in ids2, f"new product missing after nudge: {ids2}"
        prod = next(p for p in cat2["products"] if p["id"] == NEW_PRODUCT_ID)
        assert prod["name"] == NEW_PRODUCT["name"]
        assert prod["price_usd"] == NEW_PRODUCT["price_usd"]
        assert app.poll() is None, "backend must still be running (no restart)"
        assert fake.served >= 2, "fake must have served startup + refresh fetches"

    def test_force_refresh_bypasses_freshness(self, e2e_stack):
        """The manual Check-for-updates nudge refetches even when fresh."""
        fake = e2e_stack["fake"]
        base = e2e_stack["base"]
        served_before = fake.served

        resp = _http_post_json(f"{base}/marketplace/catalog/refresh?force=true")
        assert resp == {"refreshed": True, "reason": None}
        assert fake.served > served_before, "force must hit the fake marketplace"

        cat = _http_get_json(f"{base}/marketplace/catalog")
        assert NEW_PRODUCT_ID in [p["id"] for p in cat["products"]]

    def test_background_poll_picks_up_publication(self, e2e_stack_poll):
        """Poll path: a product published between Store visits appears via the
        periodic tick alone — no nudge, no restart. OTOYIN_CATALOG_POLL_S=1
        makes the app.py poll loop fire every second; the fake flips to v2
        and the catalog must converge without any POST /refresh call."""
        fake = e2e_stack_poll["fake"]
        app = e2e_stack_poll["app"]
        base = e2e_stack_poll["base"]

        # v1 only at boot.
        cat1 = _http_get_json(f"{base}/marketplace/catalog")
        assert NEW_PRODUCT_ID not in [p["id"] for p in cat1["products"]]

        served_at_v1 = fake.served
        fake.serve_v2()  # publish while the app is running

        # Wait for the poll loop: tick (1s) + staleness threshold (2s) + slack.
        deadline = time.monotonic() + 45.0
        while time.monotonic() < deadline:
            cat = _http_get_json(f"{base}/marketplace/catalog")
            if NEW_PRODUCT_ID in [p["id"] for p in cat["products"]]:
                break
            time.sleep(1)
        else:
            pytest.fail(
                f"background poll never picked up the new product within 45s "
                f"(fake served {fake.served}x, was {served_at_v1}x at publish)"
            )

        assert app.poll() is None, "backend must still be running (no restart)"
        assert fake.served > served_at_v1, "poll loop must have refetched after publish"
        # The poll path is the only refresher in this stack: no nudge was sent.
        prod = next(p for p in cat["products"] if p["id"] == NEW_PRODUCT_ID)
        assert prod["name"] == NEW_PRODUCT["name"]


@pytest.mark.timeout(420)
@pytest.mark.e2e
class TestMarketplaceOutageE2E:
    def test_outage_reports_failed_then_recovers_on_next_check(self, e2e_stack_outage):
        """Flow C: kill the fake mid-run → refresh reports reason="failed"
        (the Store's hint trigger) while the last catalog stays served →
        resurrect with a new product published → the next check swaps it in.
        Same backend process throughout: no restart ever happens."""
        fake = e2e_stack_outage["fake"]
        flaky = e2e_stack_outage["flaky"]
        app = e2e_stack_outage["app"]
        base = e2e_stack_outage["base"]

        # Baseline: catalog live with the bundled products.
        cat0 = _http_get_json(f"{base}/marketplace/catalog")
        assert "kokoro-onnx" in [p["id"] for p in cat0["products"]]

        # Kill the marketplace outright: the port is closed, so the backend's
        # fetch fails with a connection error, not an HTTP error status.
        flaky.kill()
        time.sleep(STALE_WAIT_S)  # ensure the stale gate would allow a fetch
        nudge = _http_post_json(f"{base}/marketplace/catalog/refresh")
        assert nudge == {"refreshed": False, "reason": "failed"}, (
            f"dead marketplace must surface as the Store hint trigger, got {nudge}"
        )

        # The Store keeps showing the last synced catalog while degraded.
        cat_stale = _http_get_json(f"{base}/marketplace/catalog")
        assert "kokoro-onnx" in [p["id"] for p in cat_stale["products"]]
        assert NEW_PRODUCT_ID not in [p["id"] for p in cat_stale["products"]]

        # Resurrect with the new product published, then check again.
        fake.serve_v2()
        flaky.resurrect()
        recovered = _http_post_json(f"{base}/marketplace/catalog/refresh?force=true")
        assert recovered == {"refreshed": True, "reason": None}, (
            f"recovery nudge should have swapped the catalog in, got {recovered}"
        )

        cat2 = _http_get_json(f"{base}/marketplace/catalog")
        ids2 = [p["id"] for p in cat2["products"]]
        assert NEW_PRODUCT_ID in ids2, f"new product missing after recovery: {ids2}"
        assert app.poll() is None, "backend must still be running (no restart)"
