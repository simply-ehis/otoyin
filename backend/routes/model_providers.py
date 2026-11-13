"""
BYOK model-provider API endpoints.

True BYOK: users register an arbitrary cloud endpoint (base URL + API key)
for any domain (tts, music, sfx, vc, llm, stt). No curated provider list. Keys
are never stored here — they live in the OS credential store (written by the
frontend via the Rust keyring commands); this service holds only config.
Responses never echo a key back in plaintext.
"""

from enum import StrEnum

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..database import get_db
from ..services import model_providers as svc

router = APIRouter(prefix="/model-providers", tags=["model-providers"])


class ProviderDomain(StrEnum):
    """BYOK capability domains. Storage is open, but only these are valid."""

    tts = "tts"
    music = "music"
    sfx = "sfx"
    vc = "vc"
    llm = "llm"
    stt = "stt"


class ProviderCreate(BaseModel):
    domain: ProviderDomain = Field(..., description="tts | music | sfx | vc | llm | stt")
    name: str | None = None
    base_url: str
    api_key: str | None = None
    model: str | None = None
    is_default: bool = False


class ProviderUpdate(BaseModel):
    domain: ProviderDomain | None = None
    name: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    model: str | None = None
    is_default: bool | None = None


@router.get("")
async def list_providers(domain: str | None = None, db=Depends(get_db)):
    return svc.list_providers(db, domain=domain)


@router.post("")
async def create_provider(payload: ProviderCreate, db=Depends(get_db)):
    return svc.create_provider(
        db,
        domain=payload.domain,
        name=payload.name or f"{payload.domain} provider",
        base_url=payload.base_url,
        api_key=payload.api_key,
        model=payload.model,
        is_default=payload.is_default,
    )


@router.get("/{provider_id}")
async def get_provider(provider_id: str, db=Depends(get_db)):
    row = svc.get_provider(db, provider_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    return svc._to_dict(row)


@router.patch("/{provider_id}")
async def update_provider(provider_id: str, payload: ProviderUpdate, db=Depends(get_db)):
    patch = {k: v for k, v in payload.model_dump().items() if v is not None}
    result = svc.update_provider(db, provider_id, patch)
    if result is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    return result


@router.delete("/{provider_id}")
async def delete_provider(provider_id: str, db=Depends(get_db)):
    if not svc.delete_provider(db, provider_id):
        raise HTTPException(status_code=404, detail="Provider not found")
    return {"deleted": True}
