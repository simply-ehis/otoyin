"""E2E: Tauri updater artifact set verified against the configured pubkey.

Proves the release pipeline's crypto actually works, using REAL tools (no mocks
of the signing itself):

    tauri signer sign (subprocess, real CLI, real dev key)
        signs a fake NSIS installer  ->  <artifact>.sig (minisign box, base64)
    build_update_manifest.py (subprocess, the real CI script)
        inspects triple-prefixed artifacts  ->  latest.json (static manifest)
    fake update server (in-process ThreadingHTTPServer)
        serves GET /latest.json and mirrors the installer download

The verification step is an INDEPENDENT reimplementation of what
``minisign-verify`` (the Rust crate inside tauri-plugin-updater) does:
stdlib ``hashlib.blake2b`` (prehashed mode) + ``cryptography`` Ed25519. It
decodes the pubkey straight from ``tauri.conf.json``, so a key/conf mismatch,
a bad key format, or a broken manifest signature all fail here.

Requires the dev signing key at ``tauri/src-tauri/.tauri-updater.key``
(gitignored; see DEPLOY.md). The module skips if it is absent — the point is
to verify the *configured* key, not an ephemeral one.

CI gating: marked ``e2e`` and excluded from the default run via
``addopts = -m "not e2e"``; opt in with
``python -m pytest backend/tests/test_updater_e2e.py -m e2e``.
"""

from __future__ import annotations

import base64
import hashlib
import http.server
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import urllib.request
from pathlib import Path

import pytest
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

REPO_ROOT = Path(__file__).resolve().parents[2]
CONF_PATH = REPO_ROOT / "tauri" / "src-tauri" / "tauri.conf.json"
MANIFEST_SCRIPT = REPO_ROOT / ".github" / "scripts" / "build_update_manifest.py"
DEV_KEY = REPO_ROOT / "tauri" / "src-tauri" / ".tauri-updater.key"

TRIPLE = "x86_64-pc-windows-msvc"
ARTIFACT_NAME = f"{TRIPLE}-otoyin_0.0.1_x64-setup.exe"
PAYLOAD = b"OTOYIN-SETUP-DUMMY-PAYLOAD-0.0.1" * 64

pytestmark = [pytest.mark.e2e, pytest.mark.timeout(420)]

pytest.importorskip("cryptography")


# --------------------------------------------------------------------------
# Independent minisign verification (mirrors rust-minisign-verify semantics)
# --------------------------------------------------------------------------


def _configured_pubkey_bytes() -> tuple[bytes, bytes]:
    """Decode tauri.conf.json's pubkey into (key_id, ed25519_key).

    The conf value is base64 of the *textual* minisign public-key box:
    line 0 is the untrusted comment, line 1 is base64 of the 42-byte binary
    box: 2-byte algorithm ("Ed") + 8-byte key id + 32-byte Ed25519 public
    key. ``PublicKey::from_base64`` expects exactly those 42 bytes; the
    plugin decodes the conf string the same way.
    """
    conf = json.loads(CONF_PATH.read_text(encoding="utf-8"))
    pubkey_b64 = conf["plugins"]["updater"]["pubkey"]
    box = base64.b64decode(pubkey_b64).decode("utf-8")
    lines = box.splitlines()
    assert len(lines) == 2, f"unexpected pubkey box shape: {lines!r}"
    bin_key = base64.b64decode(lines[1])
    assert len(bin_key) == 42, f"pubkey box must decode to 42 bytes, got {len(bin_key)}"
    assert bin_key[0:2] in (b"Ed", b"ED"), f"unexpected key algorithm {bin_key[0:2]!r}"
    return bin_key[2:10], bin_key[10:42]


def minisign_verify(payload: bytes, sig_b64: str, key_id: bytes, key: bytes) -> bool:
    """Verify a base64 minisign signature box the way the updater plugin does.

    Reproduces ``minisign_verify::PublicKey::verify`` for prehashed ("ED")
    signatures: BLAKE2b-512 of the payload is the Ed25519 message, and the
    global signature covers ``signature || trusted_comment`` bytes.
    """
    box = base64.b64decode(sig_b64).decode("utf-8")
    lines = box.splitlines()
    if len(lines) != 4 or not lines[2].startswith("trusted comment: "):
        return False
    bin1 = base64.b64decode(lines[1])
    bin2 = base64.b64decode(lines[3])
    if len(bin1) != 74 or len(bin2) != 64:
        return False
    if bin1[2:10] != key_id:
        return False
    if bin1[0:2] != b"ED":  # plugin never allows legacy mode
        return False
    ed = Ed25519PublicKey.from_public_bytes(key)
    digest = hashlib.blake2b(payload, digest_size=64).digest()
    trusted = lines[2][len("trusted comment: ") :].encode("utf-8")
    try:
        ed.verify(bin1[10:74], digest)
        ed.verify(bin2, bin1[10:74] + trusted)
    except InvalidSignature:
        return False
    return True


# --------------------------------------------------------------------------
# Real pipeline steps
# --------------------------------------------------------------------------


def _sign_artifact(payload_path: Path) -> str:
    """Sign with the real ``tauri signer sign`` CLI, as CI's build does."""
    # Windows: npx is a .cmd shim; resolve it so CreateProcess can launch it.
    npx = shutil.which("npx") or shutil.which("npx.cmd")
    assert npx, "npx not found on PATH - tauri-cli required for this test"
    result = subprocess.run(
        [npx, "--no-install", "tauri", "signer", "sign", "-f", str(DEV_KEY), "--password", "", str(payload_path)],
        cwd=REPO_ROOT / "tauri" / "src-tauri",
        capture_output=True,
        text=True,
        check=True,
    )
    sig_path = payload_path.with_name(payload_path.name + ".sig")
    assert sig_path.exists(), f"signer produced no .sig: {result.stdout} {result.stderr}"
    return sig_path.read_text(encoding="utf-8").strip()


def _build_manifest(artifacts_dir: Path) -> dict:
    """Run the real CI manifest generator (it reads conf version itself)."""
    result = subprocess.run(
        [sys.executable, "-X", "utf8", str(MANIFEST_SCRIPT), str(artifacts_dir)],
        cwd=REPO_ROOT,
        env=dict(
            os.environ,
            GITHUB_REPOSITORY="anomalyco/otoyin",
            GITHUB_REF_NAME="v0.0.1",
            PYTHONIOENCODING="utf-8",
        ),
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"manifest generator failed: {result.stderr}"
    return json.loads((artifacts_dir / "latest.json").read_text(encoding="utf-8"))


# --------------------------------------------------------------------------
# Fake update server (endpoint + mirrored release asset)
# --------------------------------------------------------------------------


def _make_handler(manifest: dict, payload: bytes):
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            if self.path == "/latest.json":
                body = json.dumps(manifest).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
            elif self.path.startswith("/download/"):
                # Mirrors the GitHub Releases asset the manifest URL points at.
                body = payload
                self.send_response(200)
                self.send_header("Content-Type", "application/octet-stream")
            else:
                self.send_response(404)
                body = b"not found"
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args) -> None:
            pass

    return Handler


# --------------------------------------------------------------------------
# Fixture: one artifact set + one fake server for the whole module
# --------------------------------------------------------------------------


@pytest.fixture(scope="module")
def updater_stack():
    if not DEV_KEY.exists():
        pytest.skip(f"dev signing key missing: {DEV_KEY} (see DEPLOY.md)")

    work = Path(tempfile.mkdtemp(prefix="otoyin-updater-e2e-"))
    artifacts = work / "artifacts"
    artifacts.mkdir()

    installer = artifacts / ARTIFACT_NAME
    installer.write_bytes(PAYLOAD)
    signature = _sign_artifact(installer)

    manifest = _build_manifest(artifacts)

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _make_handler(manifest, PAYLOAD))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield {
            "artifacts": artifacts,
            "installer": installer,
            "signature": signature,
            "manifest": manifest,
            "base": f"http://127.0.0.1:{server.server_address[1]}",
        }
    finally:
        server.shutdown()
        shutil.rmtree(work, ignore_errors=True)


# --------------------------------------------------------------------------
# Tests
# --------------------------------------------------------------------------


def test_signed_artifact_round_trips_against_configured_pubkey(updater_stack) -> None:
    """Plugin flow: fetch endpoint JSON -> download asset -> verify signature."""
    base = updater_stack["base"]
    conf = json.loads(CONF_PATH.read_text(encoding="utf-8"))

    # 1. The updater endpoint (fake mirrors GitHub Releases) serves latest.json.
    with urllib.request.urlopen(f"{base}/latest.json") as resp:
        served = json.loads(resp.read().decode("utf-8"))
    assert served == updater_stack["manifest"]

    # 2. Manifest is a valid static release: version from conf, real platform entry.
    assert served["version"] == conf["version"]
    platform = served["platforms"]["windows-x86_64"]
    assert platform["signature"] == updater_stack["signature"], (
        "manifest must embed the exact .sig the signer CLI produced"
    )

    # 3. Download the installer from the manifest's URL (rewritten to the fake
    #    release mirror; in production it points at GitHub Releases).
    asset_url = platform["url"].replace(
        "https://github.com/anomalyco/otoyin/releases/download/v0.0.1/",
        f"{base}/download/",
    )
    with urllib.request.urlopen(asset_url) as resp:
        payload = resp.read()
    assert payload == PAYLOAD

    # 4. Verify against the CONFIGURED pubkey — the whole point of the round trip.
    key_id, key = _configured_pubkey_bytes()
    assert minisign_verify(payload, platform["signature"], key_id, key), (
        "configured pubkey rejected a freshly signed release artifact"
    )


def test_tampered_payload_is_rejected(updater_stack) -> None:
    """A flipped byte must fail verification — the check is not a rubber stamp."""
    key_id, key = _configured_pubkey_bytes()
    sig = updater_stack["signature"]
    assert minisign_verify(PAYLOAD, sig, key_id, key)
    tampered = bytearray(PAYLOAD)
    tampered[len(tampered) // 2] ^= 0xFF
    assert not minisign_verify(bytes(tampered), sig, key_id, key)


def test_manifest_generator_fails_without_signature(updater_stack) -> None:
    """CI guard: a leg missing its .sig must fail the manifest step loudly."""
    artifacts = updater_stack["artifacts"]
    sig = artifacts / (ARTIFACT_NAME + ".sig")
    moved = artifacts / (ARTIFACT_NAME + ".sig.hidden")
    sig.rename(moved)
    try:
        result = subprocess.run(
            [sys.executable, "-X", "utf8", str(MANIFEST_SCRIPT), str(artifacts)],
            cwd=REPO_ROOT,
            env=dict(
                os.environ, GITHUB_REPOSITORY="anomalyco/otoyin", GITHUB_REF_NAME="v0.0.1", PYTHONIOENCODING="utf-8"
            ),
            capture_output=True,
            text=True,
        )
    finally:
        moved.rename(sig)
    assert result.returncode != 0, "generator must fail when the .sig sidecar is missing"
    assert "missing signature" in (result.stderr + result.stdout)
