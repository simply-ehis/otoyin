"""HTTP tool dispatcher — calls the backend REST API for each tool.

Extracted from execution.py. This module owns the HTTP client singleton,
URL building, request dispatch, and response handling.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any

import httpx

from ... import config
from .mappings import ENDPOINT_MAP, QUERY_POST_TOOLS, TOOL_METHODS
from .url_builder import build_url
from .validator import validate_args

logger = logging.getLogger(__name__)

# Tools that can run in parallel (no side effects, read-only or independent)
PARALLEL_SAFE_TOOLS = {
    "list_voices",
    "list_effects",
    "list_captures",
    "list_models",
    "list_conversation_presets",
    "list_batch_jobs",
    "get_batch_job",
    "list_community_presets",
    "list_community_preset_categories",
    "list_builtin_presets",
    "voice_changer_capabilities",
    "list_channels",
    "get_channel",
    "get_channel_voices",
    "list_stories",
    "get_story",
    "list_project_templates",
    "list_plugins",
    "plugin_status",
    "list_scripting_functions",
    "model_cache_dir",
    "model_progress",
    "telemetry_status",
    "cuda_status",
    "list_import_formats",
    "import_info",
    "generation_version_audio",
    "list_audio_tags",
    "sample_manifest",
    "video_preview",
    "audio_preview",
    "list_projects",
    "get_project",
    "get_project_context",
    "list_project_sources",
    "list_project_plans",
    "get_plan",
}


# Singleton HTTP client reused across tool calls to avoid per-call connection overhead.
_tool_http_client: httpx.AsyncClient | None = None


def _get_tool_client() -> httpx.AsyncClient:
    global _tool_http_client
    is_closed = getattr(_tool_http_client, "is_closed", True)  # True if None or fake client
    if _tool_http_client is None or is_closed:
        _tool_http_client = httpx.AsyncClient(timeout=httpx.Timeout(connect=10, read=300, write=30, pool=10))
    return _tool_http_client


async def execute_tool(
    tool_name: str,
    tool_args: dict,
    base_url: str,
) -> str:
    """Execute a tool by calling the backend's internal HTTP API.

    Returns the complete result as a string (JSON for JSON responses,
    or audio file info for binary responses).
    """
    endpoint = ENDPOINT_MAP.get(tool_name)
    if not endpoint:
        return f"Unknown tool: {tool_name}"

    args = dict(tool_args)

    validation_error = validate_args(tool_name, args)
    if validation_error:
        return validation_error

    method = TOOL_METHODS.get(tool_name, "POST")
    path = build_url(endpoint, args)
    url = f"{base_url}{path}"

    try:
        client = _get_tool_client()
        if method == "GET":
            resp = await client.get(url, params=args or None)
        elif tool_name in QUERY_POST_TOOLS:
            resp = await client.post(url, params=args or None)
        elif args:
            resp = await client.post(url, json=args)
        else:
            resp = await client.post(url)

        if resp.status_code >= 400:
            error_body = resp.text[:500]
            try:
                error_data = resp.json()
                detail = error_data.get("detail", error_data.get("message", error_body))
            except Exception:
                detail = error_body
            # Add human-readable context based on status code
            if resp.status_code == 404:
                hint = f" Endpoint '{path}' not found. Check that the tool name is correct."
            elif resp.status_code == 422:
                hint = " Invalid arguments. Check required parameters and their types."
            elif resp.status_code == 429:
                hint = " Rate limited. Wait before retrying."
            elif resp.status_code >= 500:
                hint = " Server error. The service may be temporarily unavailable."
            else:
                hint = ""
            return f"Error {resp.status_code}: {detail}{hint}"

        content_type = resp.headers.get("content-type", "")

        if "application/json" in content_type:
            data = resp.json()
            if isinstance(data, list) and len(data) > 50:
                data = data[:50]
            result = json.dumps(data, default=str)
            return result[:2000] if len(result) > 2000 else result

        # Non-JSON — check if it's audio before saving as .wav.
        is_audio = any(t in content_type for t in ("audio/", "application/octet-stream"))
        if not is_audio:
            return f"Unexpected response type: {content_type}"
        exports_dir = config.get_exports_dir()
        exports_dir.mkdir(parents=True, exist_ok=True)
        filename = f"assistant_{tool_name}_{uuid.uuid4().hex[:8]}.wav"
        out_path = exports_dir / filename
        out_path.write_bytes(resp.content)
        return json.dumps(
            {"audio_file": filename, "bytes": len(resp.content)},
            default=str,
        )
    except httpx.TimeoutException:
        logger.exception("Tool execution timeout: %s", tool_name)
        return f"Tool execution timed out: {tool_name}"
    except Exception:
        logger.exception("Tool execution failed: %s", tool_name)
        return "Tool execution failed"


async def execute_tools_parallel(
    tool_calls: list[dict[str, Any]],
    base_url: str,
) -> list[str]:
    """Execute multiple independent tool calls in parallel.

    Only tools in PARALLEL_SAFE_TOOLS are executed in parallel.
    Other tools run sequentially to avoid race conditions.
    """
    if not tool_calls:
        return []

    parallel_calls = []
    sequential_calls = []

    for tc in tool_calls:
        name = tc.get("name", "")
        if name in PARALLEL_SAFE_TOOLS:
            parallel_calls.append(tc)
        else:
            sequential_calls.append(tc)

    results = []

    # Execute parallel batch
    if parallel_calls:

        async def run_one(tc: dict) -> str:
            return await execute_tool(tc["name"], tc.get("arguments", {}), base_url)

        parallel_results = await asyncio.gather(*[run_one(tc) for tc in parallel_calls])
        results.extend(parallel_results)

    # Execute sequential batch
    for tc in sequential_calls:
        result = await execute_tool(tc["name"], tc.get("arguments", {}), base_url)
        results.append(result)

    return results
