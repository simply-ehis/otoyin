"""
Local secret storage for user-supplied credentials (BYOK API keys).

otoyin is offline/on-device, so secrets are encrypted at rest with
Fernet using a per-install key. The key comes from the ``TWENTYLABS_SECRET``
env var, or is auto-generated once and persisted to a local file inside the
app data dir (never committed, never sent anywhere).

This is intentionally simple: a single symmetric key for the whole install.
It is NOT a multi-user KMS — otoyin is a single-user local app.
"""

from __future__ import annotations

import base64
import contextlib
import logging
import os
from pathlib import Path

from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

_SECRET_ENV = "TWENTYLABS_SECRET"
_KEY_FILE_NAME = "twentylabs_secret.key"


def _app_data_dir() -> Path:
    base = os.environ.get("TWENTYLABS_DATA_DIR") or os.path.join(os.path.expanduser("~"), ".cache", "twentylabs")
    Path(base).mkdir(parents=True, exist_ok=True, mode=0o700)
    return Path(base)


def _load_or_create_key() -> bytes:
    env_key = os.environ.get(_SECRET_ENV)
    if env_key:
        try:
            return base64.urlsafe_b64decode(env_key.encode())
        except Exception:
            # An invalid secret means existing encrypted data becomes
            # undecryptable. Fail loudly instead of silently regenerating.
            raise RuntimeError(
                "TWENTYLABS_SECRET is set but invalid. "
                "Remove it or set it to a valid Fernet key "
                "(base64-encoded 32 bytes). Existing encrypted data "
                "cannot be decrypted with a different key."
            ) from None

    key_path = _app_data_dir() / _KEY_FILE_NAME
    if key_path.exists():
        return key_path.read_bytes()
    key = Fernet.generate_key()
    # Create with owner-only permissions from the first write — no
    # world-readable window between write and a later chmod.
    fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.write(fd, key)
    finally:
        os.close(fd)
    with contextlib.suppress(OSError):
        os.chmod(key_path, 0o600)
    return key


_KEY = _load_or_create_key()
_FERNET = Fernet(_KEY)


def encrypt_secret(plaintext: str) -> str:
    """Encrypt a UTF-8 secret string; returns a portable ciphertext string."""
    if plaintext == "":
        return ""
    return _FERNET.encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_secret(ciphertext: str) -> str:
    """Decrypt a ciphertext string produced by ``encrypt_secret``."""
    if ciphertext == "":
        return ""
    return _FERNET.decrypt(ciphertext.encode("utf-8")).decode("utf-8")
