"""POST /speak — REST wrapper around 21labs.speak for non-MCP callers.

Shell scripts, ACP, A2A, or any agent that doesn't speak MCP can hit this
endpoint to play text through a cloned voice. Uses the same profile
resolution and generation pipeline as the MCP tool, so per-client
bindings (via X-21labs-Client-Id) work identically.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .. import models
from ..database import MCPClientBinding, get_db
from ..errors import ERR_NO_VOICE_PROFILE, ERR_PROFILE_NOT_FOUND
from ..mcp_server import events as mcp_events
from ..mcp_server.resolve import resolve_profile

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/speak", response_model=models.GenerationResponse)
async def speak(
    data: models.SpeakRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Speak text in a voice profile. Mirrors 21labs.speak (MCP).

    Response shape matches POST /generate — a ``GenerationResponse`` with
    ``status="generating"`` and an ``id`` the caller polls at
    ``GET /generate/{id}/status``.
    """
    client_id = request.headers.get("X-21labs-Client-Id")
    profile = resolve_profile(data.profile, client_id, db)
    if profile is None:
        if data.profile:
            raise HTTPException(
                status_code=404,
                detail=ERR_PROFILE_NOT_FOUND,
            )
        raise HTTPException(
            status_code=400,
            detail=ERR_NO_VOICE_PROFILE,
        )

    binding = None
    if client_id:
        binding = db.query(MCPClientBinding).filter(MCPClientBinding.client_id == client_id).first()

    # Resolve per-client personality default when the caller didn't pin it.
    personality_flag = data.personality
    if personality_flag is None and binding is not None:
        personality_flag = bool(binding.default_personality)

    engine = data.engine
    if engine is None and binding is not None:
        engine = binding.default_engine

    from .generations import generate_speech

    generation = await generate_speech(
        models.GenerationRequest(
            profile_id=profile.id,
            text=data.text,
            language=data.language or "en",
            engine=engine,
            personality=bool(personality_flag),
        ),
        db,
    )

    mcp_events.publish(
        "speak-start",
        {
            "generation_id": getattr(generation, "id", None),
            "profile_name": profile.name,
            "source": "rest",
            "client_id": client_id,
        },
    )
    return generation
