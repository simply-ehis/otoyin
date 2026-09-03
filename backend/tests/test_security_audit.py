"""Regression tests for the network-egress / license hardening.

Covers: SSRF URL guard, Freesound host allowlist, YouTube task_id
validation, and the license fail-closed-in-production behavior.
"""

import importlib

import backend.services.licensing as licensing
from backend.services.youtube_download import is_valid_task_id
from backend.utils import ssrf


# --- SSRF URL guard --------------------------------------------------------
def test_is_url_safe_rejects_private_and_loopback():
    for url in (
        "http://127.0.0.1/x",
        "https://10.0.0.5/x",
        "http://192.168.1.1/x",
        "http://172.16.0.1/x",
        "http://169.254.169.254/latest/meta-data",
        "http://localhost/x",
        "file:///etc/passwd",
        "ftp://example.com/x",
        "http://[::1]/x",
    ):
        assert ssrf.is_url_safe(url) is False, url


def test_is_url_safe_allows_public_ip_literal():
    # 8.8.8.8 is a public address and needs no DNS resolution.
    assert ssrf.is_url_safe("https://8.8.8.8/x") is True


def test_is_host_allowed_enforces_scheme_and_host():
    hosts = {"freesound.org", "cdn.freesound.org"}
    assert ssrf.is_host_allowed("https://freesound.org/data/preview.ogg", hosts) is True
    assert ssrf.is_host_allowed("https://cdn.freesound.org/p.ogg", hosts) is True
    assert ssrf.is_host_allowed("http://freesound.org/p.ogg", hosts) is False
    assert ssrf.is_host_allowed("https://evil.com/p.ogg", hosts) is False


# --- YouTube task_id validation --------------------------------------------
def test_is_valid_task_id():
    assert is_valid_task_id("abc123def456") is True
    assert is_valid_task_id("..") is False
    assert is_valid_task_id("ab/../cd") is False
    assert is_valid_task_id("") is False
    assert is_valid_task_id("ABC123DEF456") is False  # uppercase not generated


# --- License fail-closed in production -------------------------------------
def test_license_verification_refuses_dev_key_in_production(monkeypatch):
    lic = licensing.sign_license(
        {
            "product": "qwen3-tts-1.7b",
            "device_id": "*",
            "purchaser": "order_x",
            "entitlements": ["models:qwen3-tts-1.7b"],
            "issued_at": "2026-08-18T00:00:00+00:00",
            "expires_at": None,
        }
    )
    assert licensing.verify_license(lic) is True  # dev mode trusts dev key

    monkeypatch.setenv("TWENTYLABS_ENV", "production")
    importlib.reload(licensing)  # re-read env-driven module state
    try:
        # Public key still the dev placeholder -> verification must refuse.
        assert licensing.verify_license_signature(lic) is False
        assert licensing.verify_license(lic) is False
    finally:
        monkeypatch.undo()
        importlib.reload(licensing)
