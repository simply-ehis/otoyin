"""Tests for the multi-instrument GM pattern renderer (beat map backend).

Gated on tinysoundfont + an installed SoundFont, like test_gm_instrument.py.
"""

import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routes.instruments import router
from backend.services import gm_instrument
from backend.services.gm_instrument import (
    get_soundfont_path,
    render_gm_pattern_multi,
)

pytest.importorskip("tinysoundfont")


@pytest.fixture
def soundfont():
    path = get_soundfont_path()
    if path is None:
        pytest.skip("No SoundFont installed (Store instrument pack or data/soundfonts)")
    return path


def test_renders_multiple_instruments_in_one_loop(soundfont):
    """Piano on step 0, strings on step 1, both together on step 2."""
    steps = [
        [(0, 60, 1.0)],
        [(40, 52, 0.7)],
        [(0, 60, 1.0), (40, 55, 0.5)],
    ]
    audio = render_gm_pattern_multi(steps, step_duration=0.25, bars=1)
    step = int(0.25 * 48000)
    release = int(0.3 * 48000)
    assert audio.dtype == np.float32
    assert audio.ndim == 2
    assert audio.shape[1] == 2
    assert audio.shape[0] == step * len(steps) + release
    assert np.abs(audio).max() > 0


def test_velocity_changes_rendered_shape(soundfont):
    """Velocity shapes the synthesis (SoundFont velocity layers); level is
    peak-normalized like the rest of the pipeline, so same peak, different wave."""
    step = int(0.25 * 48000)
    loud = render_gm_pattern_multi([[(0, 60, 1.0)]], step_duration=0.25)
    soft = render_gm_pattern_multi([[(0, 60, 0.2)]], step_duration=0.25)
    assert np.abs(loud[:step]).max() == pytest.approx(np.abs(soft[:step]).max(), abs=1e-6)
    assert not np.allclose(loud, soft), "velocity must change the rendered wave"


def test_empty_steps_return_silence(soundfont):
    audio = render_gm_pattern_multi([], step_duration=0.25)
    assert audio.shape[0] == 1
    assert np.abs(audio).max() == 0.0


def test_bars_repeat_loop(soundfont):
    steps = [[(0, 60, 1.0)], [(0, 62, 1.0)]]
    audio = render_gm_pattern_multi(steps, step_duration=0.25, bars=2)
    step = int(0.25 * 48000)
    assert audio.shape[0] >= step * len(steps) * 2


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_route_renders_gm_pattern(client, soundfont):
    res = client.post(
        "/instruments/gm-pattern",
        json={
            "steps": [[{"program": 0, "note": 60, "velocity": 1.0}]],
            "step_duration": 0.25,
            "bars": 1,
        },
    )
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("audio/wav")


def test_route_501_when_no_soundfont(client, monkeypatch):
    monkeypatch.setattr(gm_instrument, "get_soundfont_path", lambda: None)
    res = client.post(
        "/instruments/gm-pattern",
        json={"steps": [[{"program": 0, "note": 60}]]},
    )
    assert res.status_code == 501


def test_route_rejects_program_out_of_range(client):
    res = client.post(
        "/instruments/gm-pattern",
        json={"steps": [[{"program": 999, "note": 60}]]},
    )
    assert res.status_code == 422


def test_route_rejects_note_out_of_range(client):
    res = client.post(
        "/instruments/gm-pattern",
        json={"steps": [[{"program": 0, "note": 200}]]},
    )
    assert res.status_code == 422
