"""Voice Profile capability catalog -- the single source for the profiles slice.

Each ``ToolDef`` names the service handler and the request/response models. The
generated HTTP route and the generated MCP tool both derive from these
definitions, so the two surfaces cannot drift.
"""

from __future__ import annotations

from ..models import VoiceProfileCreate, VoiceProfileResponse
from ..services import profiles
from ..tool_registry import ToolDef

PROFILE_TOOLS: list[ToolDef] = [
    ToolDef(
        name="21labs.profiles.create_profile",
        description="Create a new voice profile.",
        handler=profiles.create_profile,
        request_model=VoiceProfileCreate,
        response_model=VoiceProfileResponse,
        endpoint="/profiles",
        method="POST",
        surfaces=["mcp"],
    ),
    ToolDef(
        name="21labs.profiles.list_profiles",
        description="List all voice profiles with generation and sample counts.",
        handler=profiles.list_profiles,
        response_model=list[VoiceProfileResponse],
        endpoint="/profiles",
        method="GET",
        surfaces=["mcp"],
    ),
]
