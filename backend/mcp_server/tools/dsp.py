"""Offline DSP / Synthesizer MCP tools (audio-dsp library — no AI, no API)."""

from __future__ import annotations

from typing import Any

from fastmcp import FastMCP

from ._common import _rest


def register_dsp_tools(mcp: FastMCP) -> None:
    @mcp.tool(
        name="21labs.dsp_capabilities",
        description="List available offline synthesizers and DSP effects. No network, no AI models.",
    )
    async def twentylabs_dsp_capabilities() -> dict[str, Any]:
        return await _rest("GET", "/dsp/capabilities")

    @mcp.tool(
        name="21labs.dsp_synth",
        description=(
            "Generate a synthesized sound using offline DSP (no AI, no network). "
            "Engines: subtractive, fm, drum, chiptone, pluck, dialup, robot_speech. "
            "Returns base64 WAV audio."
        ),
    )
    async def twentylabs_dsp_synth(
        synth_type: str = "subtractive",
        freq: float = 220.0,
        duration: float = 1.0,
        note: str = "C4",
        wave: str = "saw",
        cutoff: float = 1200.0,
        resonance: float = 1.5,
        attack: float = 0.02,
        decay: float = 0.1,
        sustain: float = 0.7,
        release: float = 0.2,
        kind: str = "kick",
        text: str = "hello world",
        algorithm: int = 1,
        feedback: float = 0.0,
    ) -> dict[str, Any]:
        return await _rest(
            "POST",
            "/dsp/synth",
            json={
                "type": synth_type,
                "freq": freq,
                "duration": duration,
                "note": note,
                "wave": wave,
                "cutoff": cutoff,
                "resonance": resonance,
                "attack": attack,
                "decay": decay,
                "sustain": sustain,
                "release": release,
                "kind": kind,
                "text": text,
                "algorithm": algorithm,
                "feedback": feedback,
            },
        )

    @mcp.tool(
        name="21labs.dsp_effect",
        description=(
            "Apply a classical DSP effect to a stored audio file (offline, no AI). "
            "Effects: vocoder, bitcrush, distortion, tape, filter, delay, phaser, pitch, "
            "ringmod, reverb, robotize. Requires audio_path from /dsp/upload or any captured file. "
            "Returns base64 WAV audio. "
            "Effect-specific params: carrier_freq (vocoder), bits (bitcrush), "
            "drive (distortion/tape), kind (distortion flavor: fuzz/overdrive/softclip), "
            "cutoff/ftype (filter), time/feedback (delay), rate/depth (phaser), "
            "mod_freq (ringmod), decay/wet (reverb)."
        ),
    )
    async def twentylabs_dsp_effect(
        audio_path: str,
        effect_type: str = "robotize",
        carrier_freq: float = 120.0,
        bits: int = 8,
        drive: float = 3.0,
        kind: str = "fuzz",
        cutoff: float = 1500.0,
        ftype: str = "lowpass",
        time: float = 0.25,
        feedback: float = 0.5,
        rate: float = 0.5,
        depth: float = 0.8,
        decay: float = 1.2,
        wet: float = 0.3,
        mod_freq: float = 100.0,
    ) -> dict[str, Any]:
        if not audio_path:
            raise ValueError("audio_path is required (use an existing capture path)")
        return await _rest(
            "POST",
            "/dsp/effect",
            json={
                "type": effect_type,
                "audio_path": audio_path,
                "carrier_freq": carrier_freq,
                "bits": bits,
                "drive": drive,
                "kind": kind,
                "cutoff": cutoff,
                "ftype": ftype,
                "time": time,
                "feedback": feedback,
                "rate": rate,
                "depth": depth,
                "decay": decay,
                "wet": wet,
                "mod_freq": mod_freq,
            },
        )
