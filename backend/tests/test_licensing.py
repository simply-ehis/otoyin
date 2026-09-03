"""Tests for the offline licensing module (docs/MARKETPLACE_PLAN.md §3)."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import backend.services.licensing as licensing
from backend.database.models import Base


def _make_license(product="qwen3-tts-1.7b", entitlements=None, device_id="*", expires_at=None):
    lic = {
        "product": product,
        "device_id": device_id,
        "purchaser": "order_abc",
        "entitlements": entitlements if entitlements is not None else [f"models:{product}"],
        "issued_at": datetime.now(UTC).isoformat(),
        "expires_at": expires_at,
    }
    return licensing.sign_license(lic)


def test_sign_verify_roundtrip():
    lic = _make_license()
    assert licensing.verify_license_signature(lic) is True
    assert licensing.verify_license(lic) is True


def test_tampered_signature_fails():
    lic = _make_license()
    lic["product"] = "tampered"
    assert licensing.verify_license_signature(lic) is False


def test_device_binding_rejects_wrong_device():
    lic = _make_license(device_id="some-other-device-id")
    assert licensing.verify_license(lic) is False


def test_expired_license_rejected():
    past = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    lic = _make_license(expires_at=past)
    assert licensing.verify_license(lic) is False


def test_wildcard_entitlement_match():
    lic = _make_license(entitlements=["plugins:*"])
    assert licensing.license_grants(lic, "plugins:my-plugin") is True
    assert licensing.license_grants(lic, "models:qwen3-tts-1.7b") is False


def test_exact_entitlement_match():
    lic = _make_license(entitlements=["models:qwen3-tts-1.7b"])
    assert licensing.license_grants(lic, "models:qwen3-tts-1.7b") is True


def test_marketplace_public_key_present():
    assert licensing.MARKETPLACE_PUBLIC_KEY
    # Dev private key signs, embedded public key verifies.
    lic = _make_license()
    assert licensing.verify_license_signature(lic) is True


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine)
    return SessionLocal()


def test_install_and_list_license(db_session):
    lic = _make_license()
    row = licensing.install_license(db_session, lic)
    assert row.id
    listed = licensing.list_licenses(db_session)
    assert len(listed) == 1
    assert listed[0]["valid"] is True
    assert "models:qwen3-tts-1.7b" in listed[0]["entitlements"]


def test_reject_unverifiable_license(db_session):
    bad = {"product": "x", "entitlements": ["models:x"], "sig": "ed25519:AAAA"}
    with pytest.raises(ValueError):
        licensing.install_license(db_session, bad)


def test_has_entitlement(db_session):
    licensing.install_license(db_session, _make_license(entitlements=["models:orpheus"]))
    assert licensing.has_entitlement(db_session, "models:orpheus") is True
    assert licensing.has_entitlement(db_session, "models:zonos") is False


def test_delete_license(db_session):
    row = licensing.install_license(db_session, _make_license())
    assert licensing.delete_license(db_session, row.id) is True
    assert licensing.list_licenses(db_session) == []


def test_catalog_self_verifies():
    from backend.services.marketplace_catalog import build_catalog, verify_catalog

    catalog = build_catalog()
    assert verify_catalog(catalog) is True
    assert any(p["id"] == "qwen3-tts-1.7b" and p["paid"] for p in catalog["products"])
