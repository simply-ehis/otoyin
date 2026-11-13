"""
BYOK model provider storage + lookup.

True BYOK: users register an arbitrary base URL + API key for any domain
(tts, music, sfx, vc, llm). No curated provider list. Keys are NEVER stored
here — they live in the OS credential store (Windows Credential Manager,
macOS Keychain, Linux Secret Service), written by the frontend through the
Rust keyring commands. This module holds the provider config (name, base
URL, model, default) and reads the key from the vault at call time; callers
that need to actually call the cloud endpoint use ``get_provider`` plus
``provider_credentials``.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from ..database.models import ModelProvider as DBModelProvider
from ..utils import device_credentials

logger = logging.getLogger(__name__)


def _to_dict(row: DBModelProvider) -> dict[str, Any]:
    return {
        "id": row.id,
        "domain": row.domain,
        "name": row.name,
        "base_url": row.base_url,
        "model": row.model,
        "is_default": row.is_default,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        # API key is intentionally NOT returned in plaintext; the client only
        # needs to know whether one is stored in the OS credential store.
        "has_api_key": device_credentials.read_byok_key(row.domain) is not None,
    }


def list_providers(db: Session, domain: str | None = None) -> list[dict[str, Any]]:
    q = db.query(DBModelProvider)
    if domain:
        q = q.filter(DBModelProvider.domain == domain)
    return [_to_dict(r) for r in q.order_by(DBModelProvider.created_at).all()]


def get_provider(db: Session, provider_id: str) -> DBModelProvider | None:
    return db.query(DBModelProvider).filter(DBModelProvider.id == provider_id).first()


def get_default_provider(db: Session, domain: str) -> DBModelProvider | None:
    """Return the default provider for a domain (or None)."""
    return (
        db.query(DBModelProvider).filter(DBModelProvider.domain == domain, DBModelProvider.is_default == True).first()
    )


def create_provider(
    db: Session,
    *,
    domain: str,
    name: str,
    base_url: str,
    api_key: str | None = None,
    model: str | None = None,
    is_default: bool = False,
) -> dict[str, Any]:
    if api_key:
        # Keys never land here. The frontend stores them in the OS credential
        # store via its Rust keyring commands. The parameter stays for API
        # compatibility and is deliberately ignored.
        logger.warning(
            "api_key in create_provider is ignored — keys are stored only in the OS credential store via the frontend"
        )
    if is_default:
        _clear_defaults(db, domain)
    row = DBModelProvider(
        domain=domain,
        name=name,
        base_url=base_url,
        model=model,
        encrypted_api_key="",
        is_default=is_default,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_dict(row)


def update_provider(
    db: Session,
    provider_id: str,
    patch: dict[str, Any],
) -> dict[str, Any] | None:
    row = get_provider(db, provider_id)
    if row is None:
        return None
    if patch.get("is_default"):
        _clear_defaults(db, row.domain)
    for key in ("domain", "name", "base_url", "model", "is_default"):
        if key in patch:
            setattr(row, key, patch[key])
    if "api_key" in patch:
        # Same deal: keys live only in the OS credential store. Ignored on
        # purpose so a stray caller cannot re-create the at-rest secret.
        logger.warning(
            "api_key in update_provider is ignored — keys are stored only in the OS credential store via the frontend"
        )
    db.commit()
    db.refresh(row)
    return _to_dict(row)


def delete_provider(db: Session, provider_id: str) -> bool:
    row = get_provider(db, provider_id)
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True


def _clear_defaults(db: Session, domain: str) -> None:
    for r in db.query(DBModelProvider).filter(DBModelProvider.domain == domain, DBModelProvider.is_default == True):
        r.is_default = False


def provider_credentials(row: DBModelProvider) -> dict[str, str]:
    """Return ``{base_url, api_key, model}`` for actually calling the cloud.

    The key is read from the OS credential store at call time; ``api_key`` is
    ``""`` when no key is stored. Callers that talk to a provider must
    treat an empty key as "not configured" (see cloud_provider).
    """
    return {
        "base_url": row.base_url,
        "api_key": device_credentials.read_byok_key(row.domain) or "",
        "model": row.model or "",
    }
