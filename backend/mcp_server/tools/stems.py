"""Stem separation MCP tools (Demucs ONNX)."""

from __future__ import annotations

from typing import Any

from fastmcp import FastMCP

from ._common import _encode_path_param, _rest


def register_stem_tools(mcp: FastMCP) -> None:
    @mcp.tool(
        name="21labs.stem_status",
        description="Check if Demucs stem separation is available and the model is downloaded.",
    )
    async def twentylabs_stem_status() -> dict[str, Any]:
        return await _rest("GET", "/stems/status")

    @mcp.tool(
        name="21labs.stem_vocal_split",
        description="Split the vocals stem of a separated job into lead (high-freq) and backing (low-freq) approximations.",
    )
    async def twentylabs_stem_vocal_split(job_id: str) -> dict[str, Any]:
        return await _rest("POST", f"/stems/{_encode_path_param(job_id)}/vocal-split")

    @mcp.tool(
        name="21labs.stem_mixdown",
        description="Combine all stems of a separated job into a single mix WAV.",
    )
    async def twentylabs_stem_mixdown(job_id: str) -> dict[str, Any]:
        return await _rest("POST", f"/stems/{_encode_path_param(job_id)}/mixdown")

    @mcp.tool(
        name="21labs.stem_beats",
        description="Detect beats and estimate BPM for a separated job.",
    )
    async def twentylabs_stem_beats(job_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/stems/{_encode_path_param(job_id)}/beats")

    @mcp.tool(
        name="21labs.stem_download",
        description="Download a stem file from a separated job.",
    )
    async def twentylabs_stem_download(job_id: str, name: str) -> dict[str, Any]:
        return await _rest("GET", f"/stems/{_encode_path_param(job_id)}/{_encode_path_param(name)}")