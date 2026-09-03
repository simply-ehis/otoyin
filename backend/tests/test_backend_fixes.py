"""
Regression tests for backend defects found in the tools/instruments/editing scan.

Covers:
- dsp_synth.effect_reverb wet/dry mix (was squaring the reverb; FIX)
- dsp_synth.synth_fm dropped-param cleanup (no longer accepts unused params)
- /dsp/synth robot_speech crash (was passing text as duration; FIX)
- /bridge/export bit_depth now applied via soundfile subtype (FIX)
- tr_dispatch generated tools now type params from the schema (not all str; FIX)
"""

import io

import numpy as np
import pytest
import soundfile as sf
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.config import get_exports_dir, to_storage_path
from backend.routes.audio_pipeline.bridge import router as bridge_router
from backend.routes.audio_pipeline.dsp import router as dsp_router
from backend.services import dsp_synth

SR = dsp_synth.SR

_dsp_app = FastAPI()
_dsp_app.include_router(dsp_router)
dsp_client = TestClient(_dsp_app)

_bridge_app = FastAPI()
_bridge_app.include_router(bridge_router)
bridge_client = TestClient(_bridge_app)


def _write(name: str, audio: np.ndarray, sr: int = SR) -> str:
    out = get_exports_dir() / name
    sf.write(str(out), audio.astype(np.float32), sr)
    return str(to_storage_path(out)).replace("\\", "/")


# ── dsp_synth.effect_reverb ──────────────────────────────────────────────────


def test_effect_reverb_wet_zero_returns_dry_signal():
    n = int(0.2 * SR)
    sig = np.zeros(n, dtype=np.float32)
    sig[n // 4 : 3 * n // 4] = 0.5
    out = dsp_synth.effect_reverb(sig, SR, decay=0.5, wet=0.0)
    # wet=0 must return the unmodified dry signal.
    assert np.allclose(out, sig, atol=1e-3)


def test_effect_reverb_wet_one_is_not_constant():
    n = int(0.2 * SR)
    rng = np.random.RandomState(0)
    sig = (rng.randn(n) * 0.1).astype(np.float32)
    wet = dsp_synth.effect_reverb(sig, SR, decay=0.5, wet=1.0)
    # The old bug produced a constant 1.0 here (wet*wet). Verify it does not.
    assert not np.allclose(wet, 1.0, atol=0.05)
    assert np.isfinite(wet).all()


# ── dsp_synth.synth_fm ───────────────────────────────────────────────────────


def test_synth_fm_runs_without_dropped_params():
    audio = dsp_synth.synth_fm(220.0, 0.3, 1)
    assert len(audio) == pytest.approx(int(0.3 * SR), rel=0.05)
    assert np.isfinite(audio).all()


# ── /dsp/synth robot_speech (was passing text where duration expected) ───────


def test_dsp_synth_robot_speech_does_not_crash():
    r = dsp_client.post("/dsp/synth", json={"type": "robot_speech", "duration": 0.3})
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("audio/")


# ── /bridge/export bit_depth applied via subtype ─────────────────────────────


def test_bridge_export_applies_bit_depth_subtype():
    n = int(0.2 * SR)
    sig = (np.sin(2 * np.pi * 220 * np.arange(n) / SR) * 0.3).astype(np.float32)
    sp = _write("bridge_in.wav", sig)
    r = bridge_client.post(
        "/bridge/export",
        json={"audio_path": sp, "format": "wav", "bit_depth": 24, "normalize": False},
    )
    assert r.status_code == 200, r.text
    info = sf.info(io.BytesIO(r.content))
    assert info.subtype == "PCM_24"


def test_bridge_export_default_bit_depth_is_pcm16():
    n = int(0.2 * SR)
    sig = (np.sin(2 * np.pi * 220 * np.arange(n) / SR) * 0.3).astype(np.float32)
    sp = _write("bridge_in16.wav", sig)
    r = bridge_client.post(
        "/bridge/export",
        json={"audio_path": sp, "format": "wav", "normalize": False},
    )
    assert r.status_code == 200, r.text
    info = sf.info(io.BytesIO(r.content))
    assert info.subtype == "PCM_16"


# ── tr_dispatch generated tools type their params from the schema ────────────


def test_tr_dispatch_types_params_from_schema():
    from backend.mcp_server.tools.tr_dispatch import _make_tr_tool

    captured = {}

    class _FakeMCP:
        def tool(self, name, description):
            def _reg(fn):
                captured["fn"] = fn
                return fn

            return _reg

    params = {
        "tempo": {"type": "integer"},
        "lines": {"type": "array"},
        "enabled": {"type": "boolean"},
        "name": {"type": "string"},
    }
    _make_tr_tool(
        _FakeMCP(),
        tool_name="21labs.example",
        fn_name="example_tool",
        description="example",
        endpoint="/example",
        method="POST",
        path_params=[],
        params=params,
    )
    fn = captured["fn"]
    ann = fn.__annotations__
    assert "int" in str(ann.get("tempo"))
    assert "list" in str(ann.get("lines"))
    assert "bool" in str(ann.get("enabled"))
    assert "str" in str(ann.get("name"))
