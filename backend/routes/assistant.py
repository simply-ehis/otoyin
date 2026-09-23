"""AI Assistant chat endpoints with tool-calling support."""

import json
import logging
from collections.abc import AsyncIterator

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..backends import get_llm_model_configs
from ..backends.configs.llm import DEFAULT_PLANNER_SIZE, resolve_planner_size
from ..config import get_server_host, get_server_port
from ..utils.ssrf import is_url_safe as _is_safe_url
from .assistant_stream import stream_api, stream_local

logger = logging.getLogger(__name__)
router = APIRouter()


def _local_tool_base_url() -> str:
    """Canonical loopback URL for local tool execution.

    ``request.base_url`` can resolve to the wrong host when the request
    arrives through the Tauri proxy, so tool calls always target the
    configured server address. A wildcard bind host is normalized to
    loopback because ``0.0.0.0`` is not connectable.
    """
    host = get_server_host()
    if host in ("0.0.0.0", "::"):
        host = "127.0.0.1"
    return f"http://{host}:{get_server_port()}"


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|system|tool)$")
    content: str = ""
    tool_call_id: str | None = None
    tool_calls: list | None = None
    name: str | None = None


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    model_id: str = Field(default=DEFAULT_PLANNER_SIZE)
    api_key: str | None = None
    api_base_url: str | None = None
    tools: bool = True


class ValidateKeyRequest(BaseModel):
    api_key: str
    api_base_url: str


class LocalModelInfo(BaseModel):
    id: str
    name: str
    size: str


class ApiProvider(BaseModel):
    id: str
    name: str
    base_url: str


class ModelsResponse(BaseModel):
    local: list[LocalModelInfo]
    api_providers: list[ApiProvider]


def _load_system_prompt(with_tools: bool = False, query: str | None = None) -> str:
    """Load the shared agent system prompt (canonical source: agents/manifest).

    When ``with_tools`` is set, append the local tool-call schema + format
    instruction so the on-device LFM model knows how to emit tool calls.

    ``query`` enables offline tool retrieval (top-K relevant tools only),
    replacing the unavailable Needle 2 router with a system-prompt approach.

    A user-edited base prompt (assistant settings) overrides the built-in base
    while keeping the tool schema appended on top.
    """
    from ..agents.manifest import get_agent_system_prompt
    from ..services.settings import get_assistant_system_prompt

    base_override = get_assistant_system_prompt()
    return get_agent_system_prompt(with_tools=with_tools, query=query, base_override=base_override)


@router.get("/assistant/system-prompt-default")
async def assistant_system_prompt_default():
    """Return the built-in base system prompt (for review/reset in the UI)."""
    from ..agents.manifest import _base_prompt

    return {"default": _base_prompt()}


@router.get("/assistant/models", response_model=ModelsResponse)
async def list_assistant_models():
    """List available models for the assistant."""
    llm_configs = get_llm_model_configs()
    local = [LocalModelInfo(id=cfg.model_size, name=cfg.display_name, size=cfg.model_size) for cfg in llm_configs]
    api_providers = [
        ApiProvider(id="openai", name="OpenAI", base_url="https://api.openai.com/v1"),
        ApiProvider(id="anthropic", name="Anthropic", base_url="https://api.anthropic.com/v1"),
        ApiProvider(id="groq", name="Groq", base_url="https://api.groq.com/openai/v1"),
        ApiProvider(id="together", name="Together AI", base_url="https://api.together.xyz/v1"),
        ApiProvider(id="openrouter", name="OpenRouter", base_url="https://openrouter.ai/api/v1"),
        ApiProvider(id="custom", name="Custom OpenAI-compatible", base_url=""),
    ]
    return ModelsResponse(local=local, api_providers=api_providers)


@router.post("/assistant/validate-key")
async def validate_api_key(req: ValidateKeyRequest):
    """Validate an API key against an OpenAI-compatible endpoint."""
    import asyncio

    import aiohttp

    from ..utils.ssrf import resolve_safe_redirects

    if not req.api_base_url or not _is_safe_url(req.api_base_url):
        return {"valid": False, "error": "URL blocked (private/internal network)"}
    try:
        # Resolve the redirect chain ourselves so every hop is SSRF-checked
        # before the key-bearing request leaves; the fetch below then runs
        # with redirects disabled so the Bearer key can't be replayed to an
        # unvalidated target via a 30x from the initial host.
        url = await asyncio.to_thread(resolve_safe_redirects, f"{req.api_base_url.rstrip('/')}/models")
    except (ValueError, RuntimeError) as e:
        logger.warning("API key validation URL blocked: %s", e)
        return {"valid": False, "error": "URL blocked (unsafe redirect target)"}
    headers = {"Authorization": f"Bearer {req.api_key}"}
    try:
        async with (
            aiohttp.ClientSession() as session,
            session.get(
                url,
                headers=headers,
                allow_redirects=False,
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp,
        ):
            if resp.status != 200:
                return {"valid": False}
            data = await resp.json()
            return {"valid": True, "model_count": len(data.get("data", []))}
    except Exception as e:
        logger.warning("API key validation failed for %s: %s", req.api_base_url, e)
        return {"valid": False}


@router.get("/assistant/tool-parity")
async def assistant_tool_parity():
    """Report divergence between the assistant and MCP tool surfaces.

    Both surfaces should describe the same capabilities; this endpoint makes
    any gap explicit so it can be tracked and closed. Source of truth is
    ``backend/agents/manifest.py``.
    """
    from ..agents.manifest import get_tool_parity_report

    return get_tool_parity_report()


@router.get("/assistant/skills")
async def assistant_skills(query: str | None = Query(default=None, max_length=160)):
    """Return workflow skills the in-app assistant can execute."""
    from ..agents.manifest import get_skill_catalog, validate_skill_catalog

    return {
        "surface": "assistant",
        "skills": get_skill_catalog(surface="assistant", query=query),
        "validation_errors": validate_skill_catalog(),
    }


@router.post("/assistant/chat")
async def assistant_chat(req: ChatRequest, request: Request):
    """Multi-turn chat with streaming SSE response and optional tool calling.

    API mode is used when the client supplies an ``api_key``/``api_base_url``
    directly, OR when a default ``llm`` provider is configured in the BYOK
    store (true BYOK: arbitrary endpoint + key, no curated provider list).
    """
    api_key = req.api_key
    api_base_url = req.api_base_url
    # Pre-catalog clients/DB rows may send legacy size ids — resolve before
    # anything branches on the value.
    req.model_id = resolve_planner_size(req.model_id)
    if not (api_key and api_base_url):
        # Fall back to the configured BYOK cloud provider for the llm domain.
        from ..services.cloud_provider import get_cloud_provider

        creds = get_cloud_provider("llm")
        if creds and creds.get("base_url"):
            api_key = api_key or (creds.get("api_key") or "").strip()
            api_base_url = api_base_url or creds["base_url"].strip()
            if not req.model_id or req.model_id == DEFAULT_PLANNER_SIZE:
                cloud_model = (creds.get("model") or "").strip()
                if cloud_model:
                    req.model_id = cloud_model
                elif req.model_id == DEFAULT_PLANNER_SIZE:
                    # Never send the local GGUF id to a cloud endpoint —
                    # surface the misconfiguration instead of failing oddly.
                    logger.warning("BYOK llm provider has no model set; local default not sent")
                    req.model_id = ""
    is_api = bool(api_key and api_base_url)
    base_url = _local_tool_base_url()

    # The API path strips tool turns and relies on the native function-calling
    # schema; the LOCAL path must keep the full history (including tool results
    # and tool_calls) so the on-device model can reason across the loop.
    if is_api:
        messages = [{"role": m.role, "content": m.content} for m in req.messages if m.role != "tool"]
        system_prompt = _load_system_prompt(with_tools=False)
    else:
        messages = [
            {
                "role": m.role,
                "content": m.content,
                **({"tool_calls": m.tool_calls} if m.tool_calls else {}),
                **({"tool_call_id": m.tool_call_id} if m.tool_call_id else {}),
                **({"name": m.name} if m.name else {}),
            }
            for m in req.messages
        ]
        # Offline tool retrieval: prune the tool list to the top-K relevant to
        # the user's latest request (replaces the Needle 2 router).
        last_user = next(
            (m.content for m in reversed(req.messages) if m.role == "user" and m.content),
            None,
        )
        system_prompt = _load_system_prompt(with_tools=req.tools, query=last_user)

    async def event_stream() -> AsyncIterator[str]:
        # Pace LLM calls (call pacing, not a usage quota): at most one chat
        # generation started per interval per domain.
        from ..utils.rate_limiter import get_limiter

        await get_limiter("llm").acquire()
        if is_api and not (req.model_id or "").strip():
            # A cloud LLM provider was selected but has no model configured.
            # Surface a clear error instead of forwarding an empty model id.
            yield f"data: {json.dumps({'type': 'error', 'content': 'LLM provider has no model configured. Set a model for the llm provider in API Keys.'})}\n\n"
            yield "data: [DONE]\n\n"
            return
        try:
            if is_api:
                gen = stream_api(
                    messages,
                    system_prompt,
                    api_key or "",
                    api_base_url or "",
                    req.model_id,
                    req.tools,
                    local_base_url=base_url,
                )
            else:
                gen = stream_local(
                    messages,
                    system_prompt,
                    req.tools,
                    base_url,
                    req.model_id,
                )
            async for chunk in gen:
                yield chunk
        except Exception as exc:
            logger.exception("Assistant stream failed")
            yield f"data: {json.dumps({'type': 'error', 'content': f'Stream error: {exc}'})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
