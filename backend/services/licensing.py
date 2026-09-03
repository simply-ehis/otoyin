"""Offline licensing for the otoyin marketplace.

Design (see docs/MARKETPLACE_PLAN.md §3): locally-verified signed
entitlements. A license is an Ed25519-signed JSON document. The app
ships the marketplace **public** key and verifies signatures with zero
network access — "pay once, own forever, offline forever".

License document shape::

    {
        "product": "qwen3-tts-1.7b",
        "device_id": "sha256(<machine fingerprint>)" | "*",
        "purchaser": "order_abc123",
        "entitlements": ["models:qwen3-tts-1.7b", "plugins:*"],
        "issued_at": "2026-08-18T00:00:00+00:00",
        "expires_at": null,
        "sig": "ed25519:<base64>",
    }

The public verifying key is injected at build/runtime via
``TWENTYLABS_MARKETPLACE_PUBLIC_KEY`` and falls back to a **dev
placeholder** used only for local development and tests. The matching
private signing key lives ONLY on the marketplace license server
(``TWENTYLABS_MARKETPLACE_PRIVATE_KEY``); it is never embedded in the
shipped binary. In a production build (``TWENTYLABS_ENV=production``) a
dev/unset public key is rejected, so real releases MUST inject the
production public key.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import sys
import uuid
from datetime import UTC, datetime

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

from ..database.models import Entitlement, License

logger = logging.getLogger(__name__)

# --- Keys -----------------------------------------------------------------
# Dev placeholder pair — LOCAL DEV / TESTS ONLY. The real production public
# key is injected via TWENTYLABS_MARKETPLACE_PUBLIC_KEY at build/runtime.
_DEV_PUBLIC_KEY = "kz/CSXHB6Pxhfsb+mlEgXsOXG5LlW2T3C9BRTQ8Kino="
_DEV_PRIVATE_KEY = "CX4rwSuT6vi9s3aJZWHw9zzY8hPdtQ+cR6tjB80qRX8="


def _is_production() -> bool:
    return os.environ.get("TWENTYLABS_ENV", "development").lower() == "production"


# Injected production verifying key; dev placeholder otherwise.
MARKETPLACE_PUBLIC_KEY = os.environ.get("TWENTYLABS_MARKETPLACE_PUBLIC_KEY", _DEV_PUBLIC_KEY)

_SIG_PREFIX = "ed25519:"


def _b64_decode(value: str) -> bytes:
    return base64.b64decode(value)


def _load_public() -> Ed25519PublicKey:
    return Ed25519PublicKey.from_public_bytes(_b64_decode(MARKETPLACE_PUBLIC_KEY))


def _load_private(private_key_b64: str | None = None) -> Ed25519PrivateKey:
    key = private_key_b64 or os.environ.get("TWENTYLABS_MARKETPLACE_PRIVATE_KEY")
    if not key:
        # Dev/tests only. Production builds must set the real signing key;
        # signing is never performed inside the shipped client binary.
        if _is_production():
            raise RuntimeError("Marketplace signing key not configured (set TWENTYLABS_MARKETPLACE_PRIVATE_KEY)")
        key = _DEV_PRIVATE_KEY
    return Ed25519PrivateKey.from_private_bytes(_b64_decode(key))


# --- Device fingerprint ---------------------------------------------------
def get_device_id() -> str:
    """Return a stable per-machine id (sha256 of a machine fingerprint)."""
    fingerprint = None
    if sys.platform == "win32":
        try:
            import winreg

            with winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r"SOFTWARE\Microsoft\Cryptography",
            ) as key:
                fingerprint = winreg.QueryValueEx(key, "MachineGuid")[0]
        except Exception:  # best-effort fingerprint
            fingerprint = None
    if not fingerprint and os.path.exists("/etc/machine-id"):
        try:
            with open("/etc/machine-id", encoding="utf-8") as f:
                fingerprint = f.read().strip()
        except Exception:  # best-effort fingerprint
            fingerprint = None
    if not fingerprint:
        fingerprint = str(uuid.UUID(int=uuid.getnode()))
    return hashlib.sha256(fingerprint.encode()).hexdigest()


# --- Sign / verify --------------------------------------------------------
def _canonical(payload: dict) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()


def sign_license(license_dict: dict, private_key_b64: str | None = None) -> dict:
    """Return a copy of ``license_dict`` with a ``sig`` field added."""
    payload = {k: v for k, v in license_dict.items() if k != "sig"}
    signature = _load_private(private_key_b64).sign(_canonical(payload))
    signed = dict(payload)
    signed["sig"] = _SIG_PREFIX + base64.b64encode(signature).decode()
    return signed


def verify_license_signature(license_dict: dict) -> bool:
    """Verify the Ed25519 signature of a license document.

    Fails closed in production if the verifying key is still the dev
    placeholder — a production build must inject the real public key.
    """
    if _is_production() and MARKETPLACE_PUBLIC_KEY == _DEV_PUBLIC_KEY:
        logger.error(
            "License verification refused: marketplace public key is the dev "
            "placeholder in a production build. Set TWENTYLABS_MARKETPLACE_PUBLIC_KEY."
        )
        return False
    sig = license_dict.get("sig")
    if not isinstance(sig, str) or not sig.startswith(_SIG_PREFIX):
        return False
    payload = {k: v for k, v in license_dict.items() if k != "sig"}
    try:
        raw_sig = _b64_decode(sig[len(_SIG_PREFIX) :])
        _load_public().verify(raw_sig, _canonical(payload))
    except Exception:
        logger.debug("License signature verification failed", exc_info=True)
        return False
    return True


def verify_license(license_dict: dict) -> bool:
    """Full check: signature + device binding + expiry."""
    if not verify_license_signature(license_dict):
        return False
    device_id = license_dict.get("device_id")
    if device_id not in ("*", None) and device_id != get_device_id():
        logger.debug("License device_id mismatch")
        return False
    expires_at = license_dict.get("expires_at")
    if expires_at:
        try:
            if datetime.fromisoformat(expires_at) < datetime.now(UTC):
                logger.debug("License expired")
                return False
        except ValueError:
            return False
    return True


# --- Entitlement helpers --------------------------------------------------
def entitlement_for_product(product_id: str) -> str:
    """Canonical entitlement string for a model/voice/product id."""
    return f"models:{product_id}"


def _matches(entitlement: str, required: str) -> bool:
    if entitlement == required:
        return True
    # Wildcards: "plugins:*" grants any plugin entitlement.
    if entitlement.endswith(":*"):
        prefix = entitlement[:-1]  # strip "*"
        return required.startswith(prefix)
    return False


def license_grants(license_dict: dict, required: str) -> bool:
    """True if a single valid license grants ``required`` entitlement."""
    if not verify_license(license_dict):
        return False
    return any(_matches(ent, required) for ent in license_dict.get("entitlements", []))


# --- DB-backed license store ---------------------------------------------
def install_license(db, license_dict: dict) -> License:
    """Verify then persist a license. Returns the stored ORM row."""
    if not verify_license(license_dict):
        raise ValueError("License failed signature/device/expiry verification")
    product = license_dict.get("product", "")
    device_id = license_dict.get("device_id", "")
    raw = json.dumps(license_dict, sort_keys=True)
    row = License(
        id=str(uuid.uuid4()),
        product=product,
        device_id=device_id,
        purchaser=license_dict.get("purchaser"),
        issued_at=license_dict.get("issued_at"),
        expires_at=license_dict.get("expires_at"),
        signature=license_dict.get("sig", ""),
        raw_json=raw,
    )
    db.add(row)
    db.flush()
    for ent in license_dict.get("entitlements", []):
        db.add(Entitlement(id=str(uuid.uuid4()), license_id=row.id, entitlement=ent))
    db.commit()
    db.refresh(row)
    return row


def list_licenses(db) -> list[dict]:
    """Return all stored licenses with their parsed payload + validity."""
    out = []
    for row in db.query(License).all():
        payload = json.loads(row.raw_json)
        out.append(
            {
                "id": row.id,
                "product": row.product,
                "device_id": row.device_id,
                "purchaser": row.purchaser,
                "issued_at": row.issued_at,
                "expires_at": row.expires_at,
                "valid": verify_license(payload),
                "entitlements": payload.get("entitlements", []),
            }
        )
    return out


def delete_license(db, license_id: str) -> bool:
    row = db.query(License).filter(License.id == license_id).first()
    if not row:
        return False
    db.query(Entitlement).filter(Entitlement.license_id == license_id).delete()
    db.delete(row)
    db.commit()
    return True


def active_entitlements(db) -> set[str]:
    """Set of all entitlements granted by currently-valid stored licenses."""
    granted: set[str] = set()
    for lic in list_licenses(db):
        if not lic["valid"]:
            continue
        granted.update(lic["entitlements"])
    return granted


def has_entitlement(db, required: str) -> bool:
    return any(_matches(ent, required) for ent in active_entitlements(db))
