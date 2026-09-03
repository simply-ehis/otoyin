"""Spatial audio, channels, stories, projects, plugins, scripting REST MCP tools."""

from __future__ import annotations

from typing import Any, Literal

from fastmcp import FastMCP

from ._common import _encode_path_param, _rest


def register_spatial_tools(mcp: FastMCP) -> None:
    @mcp.tool(
        name="21labs.list_spatial_presets",
        description="List binaural/convolution spatializer presets available for spatial audio.",
    )
    async def twentylabs_list_spatial_presets() -> dict[str, Any]:
        return await _rest("GET", "/spatial/presets")

    @mcp.tool(
        name="21labs.list_convolution_presets",
        description="List convolution reverb environment presets (car, coffee shop, bedroom, church, studio booth).",
    )
    async def twentylabs_list_convolution_presets() -> dict[str, Any]:
        return await _rest("GET", "/spatial/convolution-presets")

    @mcp.tool(
        name="21labs.spatial_status",
        description="Check if Steam Audio SDK is available or falling back to NumPy DSP.",
    )
    async def twentylabs_spatial_status() -> dict[str, Any]:
        return await _rest("GET", "/spatial/status")

    @mcp.tool(
        name="21labs.spatial_binaural",
        description="Apply binaural panning to audio based on a 3D position.",
    )
    async def twentylabs_spatial_binaural(
        audio_path: str,
        x: float = 0.0,
        y: float = 0.0,
        z: float = 0.0,
        distance: float = 1.0,
        gain_db: float = 0.0,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/spatial/apply-binaural",
            json={"audio_path": audio_path, "x": x, "y": y, "z": z, "distance": distance, "gain_db": gain_db},
        )

    @mcp.tool(
        name="21labs.spatial_convolution",
        description="Apply environmental convolution reverb to audio.",
    )
    async def twentylabs_spatial_convolution(
        audio_path: str,
        environment: Literal["car_interior", "coffee_shop", "bedroom", "church", "studio_booth"] = "studio_booth",
        wet_dry_mix: float = 0.3,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/spatial/apply-convolution",
            params={"audio_path": audio_path, "environment": environment, "wet_dry_mix": wet_dry_mix},
        )

    @mcp.tool(
        name="21labs.spatial_doppler",
        description="Apply a Doppler pitch effect to a moving sound source.",
    )
    async def twentylabs_spatial_doppler(
        audio_path: str,
        speed: float = 1.0,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/spatial/apply-doppler",
            params={"audio_path": audio_path, "speed": speed},
        )

    @mcp.tool(
        name="21labs.spatial_render",
        description="Full spatial render: binaural + convolution in one pass. x/y/z range -1..1, distance 0.1..10, gain_db -30..12.",
    )
    async def twentylabs_spatial_render(
        audio_path: str,
        x: float = 0.0,
        y: float = 0.0,
        z: float = 0.0,
        distance: float = 1.0,
        gain_db: float = 0.0,
        environment: Literal["car_interior", "coffee_shop", "bedroom", "church", "studio_booth"] = "studio_booth",
        wet_dry_mix: float = 0.3,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/spatial/render",
            params={"environment": environment, "wet_dry_mix": wet_dry_mix},
            json={
                "audio_path": audio_path,
                "x": x,
                "y": y,
                "z": z,
                "distance": distance,
                "gain_db": gain_db,
            },
        )


def register_channel_tools(mcp: FastMCP) -> None:
    @mcp.tool(
        name="21labs.list_channels",
        description="List audio channels used to group voices for shared processing.",
    )
    async def twentylabs_list_channels() -> dict[str, Any]:
        return await _rest("GET", "/channels")

    @mcp.tool(
        name="21labs.get_channel",
        description="Get a single audio channel by id.",
    )
    async def twentylabs_get_channel(channel_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/channels/{_encode_path_param(channel_id)}")

    @mcp.tool(
        name="21labs.get_channel_voices",
        description="List the voices assigned to an audio channel.",
    )
    async def twentylabs_get_channel_voices(channel_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/channels/{_encode_path_param(channel_id)}/voices")

    @mcp.tool(
        name="21labs.create_channel",
        description="Create an audio channel grouping voices by device/role.",
    )
    async def twentylabs_create_channel(name: str, device_ids: list[str] | None = None) -> dict[str, Any]:
        device_ids = device_ids or []
        return await _rest("POST", "/channels", json={"name": name, "device_ids": device_ids})


def register_story_tools(mcp: FastMCP) -> None:
    @mcp.tool(
        name="21labs.list_stories",
        description="List story sequences.",
    )
    async def twentylabs_list_stories() -> dict[str, Any]:
        return await _rest("GET", "/stories")

    @mcp.tool(
        name="21labs.get_story",
        description="Get a story with its items.",
    )
    async def twentylabs_get_story(story_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/stories/{_encode_path_param(story_id)}")

    @mcp.tool(
        name="21labs.create_story",
        description="Create a new story sequence.",
    )
    async def twentylabs_create_story(name: str, description: str | None = None) -> dict[str, Any]:
        return await _rest("POST", "/stories", json={"name": name, "description": description})

    @mcp.tool(
        name="21labs.export_story_audio",
        description="Render and return a story's sequenced audio as base64 WAV.",
    )
    async def twentylabs_export_story_audio(story_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/stories/{_encode_path_param(story_id)}/export-audio")


def register_project_tools(mcp: FastMCP) -> None:
    @mcp.tool(
        name="21labs.list_project_templates",
        description="List project templates (blank/dialogue/podcast/audiobook/short-film).",
    )
    async def twentylabs_list_project_templates() -> dict[str, Any]:
        return await _rest("GET", "/project/templates")

    @mcp.tool(
        name="21labs.create_project",
        description="Create a standalone project. fps: frames per second (typically 23.976-60). sample_rate: audio sample rate in Hz (typically 22050, 44100, 48000, or 96000).",
    )
    async def twentylabs_create_project(
        name: str = "Untitled Project",
        description: str = "",
        fps: float = 24.0,
        sample_rate: int = 48000,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/project/create",
            json={
                "name": name,
                "description": description,
                "fps": fps,
                "sample_rate": sample_rate,
            },
        )

    @mcp.tool(
        name="21labs.save_project",
        description="Save a standalone project as JSON. project_id is the project ID; project_json is the full project data as a JSON string.",
    )
    async def twentylabs_save_project(project_id: str, project_json: str) -> dict[str, Any]:
        return await _rest("POST", "/project/save", json={"project_id": project_id, "project_json": project_json})

    @mcp.tool(
        name="21labs.load_project",
        description="Load a standalone project by ID.",
    )
    async def twentylabs_load_project(project_id: str) -> dict[str, Any]:
        return await _rest("POST", "/project/load", json={"project_id": project_id})

    @mcp.tool(
        name="21labs.import_script",
        description="Import a script (plain text or JSON) into a project. format: 'plain' for plain text, 'json' for structured JSON script.",
    )
    async def twentylabs_import_script(project_json: str, text: str, format: str = "plain") -> dict[str, Any]:
        return await _rest(
            "POST",
            "/project/import-script",
            json={"project_json": project_json, "text": text, "format": format},
        )


def register_plugin_tools(mcp: FastMCP) -> None:
    @mcp.tool(
        name="21labs.list_plugins",
        description="List discovered VST3/AU plugins.",
    )
    async def twentylabs_list_plugins() -> dict[str, Any]:
        return await _rest("GET", "/plugins/list")

    @mcp.tool(
        name="21labs.plugin_status",
        description="Get plugin hosting status.",
    )
    async def twentylabs_plugin_status() -> dict[str, Any]:
        return await _rest("GET", "/plugins/status")

    @mcp.tool(
        name="21labs.plugins_scan",
        description="Scan the system for VST3/AU plugins.",
    )
    async def twentylabs_plugins_scan() -> dict[str, Any]:
        return await _rest("POST", "/plugins/scan")

    @mcp.tool(
        name="21labs.plugins_process",
        description="Apply a plugin chain (list of dicts) to an audio file. Returns base64 WAV.",
    )
    async def twentylabs_plugins_process(audio_path: str, chain: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        chain = chain or []
        return await _rest("POST", "/plugins/process", json={"audio_path": audio_path, "chain": chain})


def register_scripting_tools(mcp: FastMCP) -> None:
    @mcp.tool(
        name="21labs.list_scripting_functions",
        description="List available scripting API functions for batch automation.",
    )
    async def twentylabs_list_scripting_functions() -> dict[str, Any]:
        return await _rest("GET", "/scripting/functions")

    @mcp.tool(
        name="21labs.scripting_execute",
        description="Execute a scripting API function by name with args.",
    )
    async def twentylabs_scripting_execute(function: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
        args = args or {}
        return await _rest("POST", "/scripting/execute", json={"function": function, "args": args})

    # ── Studio Session Tools ───────────────────────────────────────────────

    @mcp.tool(
        name="21labs.studio_add_track",
        description="Add a track to an Audio Studio session. track_type: 'audio' or 'midi'.",
    )
    async def twentylabs_studio_add_track(
        session_id: str,
        track_type: str = "audio",
        name: str | None = None,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            f"/audio-studio/sessions/{_encode_path_param(session_id)}/tracks",
            json={"track_type": track_type, "name": name} if name else {"track_type": track_type},
        )

    @mcp.tool(
        name="21labs.studio_save_session",
        description="Save an Audio Studio session.",
    )
    async def twentylabs_studio_save_session(session_id: str, name: str | None = None) -> dict[str, Any]:
        return await _rest(
            "POST", f"/audio-studio/sessions/{_encode_path_param(session_id)}/save", json={"name": name} if name else {}
        )

    @mcp.tool(
        name="21labs.studio_load_session",
        description="Load an Audio Studio session.",
    )
    async def twentylabs_studio_load_session(session_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/audio-studio/sessions/{_encode_path_param(session_id)}")

    @mcp.tool(
        name="21labs.studio_list_sessions",
        description="List all Audio Studio sessions.",
    )
    async def twentylabs_studio_list_sessions() -> dict[str, Any]:
        return await _rest("GET", "/audio-studio/sessions")

    @mcp.tool(
        name="21labs.studio_set_master_volume",
        description="Set the master volume for an Audio Studio session. volume: 0.0-1.0.",
    )
    async def twentylabs_studio_set_master_volume(session_id: str, volume: float) -> dict[str, Any]:
        return await _rest(
            "POST", f"/audio-studio/sessions/{_encode_path_param(session_id)}/master-volume", json={"volume": volume}
        )

    @mcp.tool(
        name="21labs.studio_import_session",
        description="Import a session into Audio Studio.",
    )
    async def twentylabs_studio_import_session(name: str, data: dict[str, Any]) -> dict[str, Any]:
        return await _rest("POST", "/audio-studio/sessions/import", json={"name": name, "data": data})

    # ── Project Management Tools ──────────────────────────────────────────

    @mcp.tool(
        name="21labs.list_projects",
        description="List all agent projects.",
    )
    async def twentylabs_list_projects() -> dict[str, Any]:
        return await _rest("GET", "/projects")

    @mcp.tool(
        name="21labs.create_agent_project",
        description="Create a new agent project. name: project name. description: optional description.",
    )
    async def twentylabs_create_agent_project(
        name: str,
        description: str | None = None,
    ) -> dict[str, Any]:
        return await _rest(
            "POST", "/projects", json={"name": name, "description": description} if description else {"name": name}
        )

    @mcp.tool(
        name="21labs.get_project",
        description="Get an agent project by ID.",
    )
    async def twentylabs_get_project(project_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/projects/{_encode_path_param(project_id)}")

    @mcp.tool(
        name="21labs.get_project_context",
        description="Get the context for an agent project (sources, plans, etc.).",
    )
    async def twentylabs_get_project_context(project_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/projects/{_encode_path_param(project_id)}/context")

    @mcp.tool(
        name="21labs.add_project_source",
        description="Add a source (file/URL) to an agent project.",
    )
    async def twentylabs_add_project_source(
        project_id: str,
        source_type: str,
        source_path: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            f"/projects/{_encode_path_param(project_id)}/sources",
            json={"source_type": source_type, "source_path": source_path, "metadata": metadata or {}},
        )

    @mcp.tool(
        name="21labs.list_project_sources",
        description="List sources for an agent project.",
    )
    async def twentylabs_list_project_sources(project_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/projects/{_encode_path_param(project_id)}/sources")

    @mcp.tool(
        name="21labs.list_project_plans",
        description="List plans for an agent project.",
    )
    async def twentylabs_list_project_plans(project_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/projects/{_encode_path_param(project_id)}/plans")

    @mcp.tool(
        name="21labs.create_plan",
        description="Create a plan for an agent project. description: plan description.",
    )
    async def twentylabs_create_plan(
        project_id: str,
        description: str,
    ) -> dict[str, Any]:
        return await _rest(
            "POST", f"/projects/{_encode_path_param(project_id)}/plans", json={"description": description}
        )

    @mcp.tool(
        name="21labs.get_plan",
        description="Get a plan by ID.",
    )
    async def twentylabs_get_plan(project_id: str, plan_id: str) -> dict[str, Any]:
        return await _rest("GET", f"/projects/{_encode_path_param(project_id)}/plans/{_encode_path_param(plan_id)}")
