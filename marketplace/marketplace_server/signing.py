"""Ed25519 license signing — the core of the offline licensing system.

The server holds the PRIVATE key and signs licenses.
Clients hold only the PUBLIC key and verify locally.
"""

from __future__ import annotations

import base64
import datetime as dt
import json

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    PublicFormat,
)


class LicenseSigner:
    """Ed25519 license signer — holds the private key for signing."""

    def __init__(self, private_key_b64: str = ""):
        if private_key_b64:
            raw = base64.b64decode(private_key_b64)
            self._private_key = Ed25519PrivateKey.from_private_bytes(raw)
        else:
            # Dev ephemeral key — generates a new one each startup.
            # In production, always set MARKETPLACE_LICENSE_PRIVATE_KEY.
            self._private_key = Ed25519PrivateKey.generate()

        self._public_key = self._private_key.public_key()
        self._public_key_b64 = base64.b64encode(self._public_key.public_bytes(Encoding.Raw, PublicFormat.Raw)).decode()

    @property
    def public_key_b64(self) -> str:
        return self._public_key_b64

    def sign_license(
        self,
        product_id: str,
        device_id: str,
        purchaser: str,
        entitlements: list[str],
        expires_at: dt.datetime | None = None,
    ) -> str:
        """Sign a license document and return the full JSON string."""
        now = dt.datetime.now(dt.UTC)
        doc = {
            "product": product_id,
            "device_id": device_id,
            "purchaser": purchaser,
            "entitlements": entitlements,
            "issued_at": now.isoformat(),
            "expires_at": expires_at.isoformat() if expires_at else None,
        }
        # Canonical JSON: sorted keys, no whitespace
        canonical = json.dumps(doc, sort_keys=True, separators=(",", ":"))
        sig_bytes = self._private_key.sign(canonical.encode())
        doc["sig"] = f"ed25519:{base64.b64encode(sig_bytes).decode()}"
        return json.dumps(doc, indent=2)


# Module-level signer — initialized on first import
_signer: LicenseSigner | None = None


def get_signer() -> LicenseSigner:
    global _signer
    if _signer is None:
        from .config import settings

        _signer = LicenseSigner(settings.license_private_key)
    return _signer
