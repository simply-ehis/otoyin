"""Synthesized-instrument REST MCP tools (GM, drum machine, piano, synth, noise)."""

from __future__ import annotations

from typing import Any, Literal

from fastmcp import FastMCP

from ._common import _rest


def register_instrument_tools(mcp: FastMCP) -> None:
    @mcp.tool(
        name="21labs.play_gm_instrument",
        description="Render a General-MIDI instrument note (program 0-127) via a SoundFont: piano, bass, strings, brass, pads, bells. Offline; requires a SoundFont in data/soundfonts. Returns WAV audio.",
    )
    async def twentylabs_play_gm_instrument(
        program: int,
        note: int = 60,
        duration: float = 1.0,
        velocity: float = 0.8,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/instruments/gm",
            json={"program": program, "note": note, "duration": duration, "velocity": velocity},
        )

    @mcp.tool(
        name="21labs.play_drum_machine",
        description="Render a drum pattern loop from synthesized hits (kick/snare/hihat/clap/tom). Each step is a voice name or list of names. Returns WAV audio.",
    )
    async def twentylabs_play_drum_machine(
        pattern: list[Any],
        step_duration: float = 0.125,
        bars: int = 1,
        velocity: float = 0.8,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/instruments/drum-machine",
            json={"pattern": pattern, "step_duration": step_duration, "bars": bars, "velocity": velocity},
        )

    @mcp.tool(
        name="21labs.play_piano_note",
        description="Render a piano note (additive synth) at a MIDI note. Offline. Returns WAV audio.",
    )
    async def twentylabs_play_piano_note(
        note: int,
        duration: float = 1.0,
        velocity: float = 0.8,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/instruments/piano",
            json={"note": note, "duration": duration, "velocity": velocity},
        )

    @mcp.tool(
        name="21labs.play_synth_note",
        description="Render a synth note (waveform: sine/square/sawtooth/triangle) at a MIDI note. Offline. Returns WAV audio.",
    )
    async def twentylabs_play_synth_note(
        note: int,
        duration: float = 1.0,
        waveform: Literal["sine", "square", "sawtooth", "triangle"] = "sawtooth",
        velocity: float = 0.8,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/instruments/synth",
            json={"note": note, "duration": duration, "waveform": waveform, "velocity": velocity},
        )

    @mcp.tool(
        name="21labs.play_drum_pad",
        description="Render a single synthesized drum hit (kick/snare/hihat/clap/tom). Offline. Returns WAV audio.",
    )
    async def twentylabs_play_drum_pad(
        drum_type: Literal["kick", "snare", "hihat", "clap", "tom"] = "kick",
        duration: float = 0.5,
        velocity: float = 0.8,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/instruments/drum",
            json={"drum_type": drum_type, "duration": duration, "velocity": velocity},
        )

    @mcp.tool(
        name="21labs.generate_noise",
        description="Generate procedural noise (white/pink/brown). Offline. Returns WAV audio.",
    )
    async def twentylabs_generate_noise(
        noise_type: Literal["white", "pink", "brown", "blue", "violet"] = "white",
        duration: float = 1.0,
        amplitude: float = 0.5,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/instruments/noise",
            json={"noise_type": noise_type, "duration": duration, "amplitude": amplitude},
        )
