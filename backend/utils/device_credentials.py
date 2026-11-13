"""BYOK keys in the OS credential store — the single credential store.

The frontend writes provider keys through the Rust ``keyring = 4`` crate
(``tauri/src-tauri/src/settings.rs``, ``credential_set``) with service
``otoyin`` and username = the provider domain (``llm``, ``tts`` …). On
Windows that crate stores the credential under TargetName
``"<username>.<service>"`` (verified 2026-11-13 with a throwaway Rust probe
against keyring 4.2.0 and confirmed with ``cmdkey /list``). Python's
``keyring`` package can read the same entry with
``get_password("<domain>.otoyin", "<domain>")`` — no extra dependencies; it is
already installed (``WinVaultKeyring``).

This deliberately couples to keyring-4's Windows TargetName construction. It
is pinned by ``backend/tests/test_device_credentials.py`` and belongs squarely
with any keyring crate upgrade in ``tauri/src-tauri/Cargo.toml``.

Everything here fails closed: a locked vault, a missing entry or a backend
error all yield ``None``. Cloud engines then see "no usable key" and fall
back to a local model (or raise a clear ``LookupError`` where cloud is
mandatory) — never an empty ``Authorization`` header.
"""

from __future__ import annotations

import logging

import keyring

logger = logging.getLogger(__name__)

_SERVICE = "otoyin"


def read_byok_key(domain: str) -> str | None:
    """Read the BYOK key for ``domain`` from the OS credential store.

    Returns ``None`` when no key is stored or the vault cannot be read.
    """
    target = f"{domain}.{_SERVICE}"
    try:
        value = keyring.get_password(target, domain)
    except Exception:
        logger.warning("OS credential store read failed for domain %r", domain, exc_info=True)
        return None
    return value or None
