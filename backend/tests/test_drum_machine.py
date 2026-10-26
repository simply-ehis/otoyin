"""Tests for the 16-step drum pattern sequencer (service + route contract)."""

import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routes.instruments import router
from backend.services.drum_machine import render_drum_pattern


def test_render_drum_pattern_length_and_energy():
    pattern = ["kick", ["snare", "hihat"], "", "hihat"] * 4
    step_duration = 0.125
    bars = 1
    audio = render_drum_pattern(pattern, step_duration, bars, velocity=0.8)
    step = int(step_duration * 48000)
    assert audio.shape[0] == step * len(pattern) * bars
    assert np.abs(audio).max() > 0
    # first step is a kick -> low-frequency energy present
    low = audio[: step // 4]
    assert np.abs(low).max() > 0


def test_empty_pattern_returns_silence():
    audio = render_drum_pattern([], velocity=0.8)
    assert audio.shape[0] == 1
    assert np.abs(audio).max() == 0.0


def test_unknown_voice_ignored():
    audio = render_drum_pattern(["not_a_drum"], velocity=0.8)
    assert np.abs(audio).max() == 0.0


def test_bars_scale_length():
    pattern = ["kick"]
    audio = render_drum_pattern(pattern, 0.125, bars=2, velocity=0.8)
    step = int(0.125 * 48000)
    assert audio.shape[0] == step * len(pattern) * 2


def test_lanes_bar_is_longest_lane():
    step = int(0.125 * 48000)
    lanes = {"kick": [1.0, 0.0, 0.0], "snare": [1.0, 0.0, 1.0, 0.0, 1.0]}
    audio = render_drum_pattern(step_duration=0.125, bars=2, lanes=lanes)
    assert audio.shape[0] == step * 5 * 2
    assert np.abs(audio).max() > 0


def test_lanes_velocity_renders_as_accent():
    """A soft step must render quieter than a full-velocity step (same voice).

    generate_drum_pad normalizes each hit's peak to its velocity, so window
    peaks directly reflect per-step levels — if velocities are ignored the
    two peaks are equal and this fails."""
    step = int(0.125 * 48000)
    lanes = {"kick": [1.0, 0.0, 0.3, 0.0]}
    audio = render_drum_pattern(step_duration=0.125, velocity=0.8, lanes=lanes)
    loud = np.abs(audio[:step]).max()
    soft = np.abs(audio[2 * step : 3 * step]).max()
    assert loud > soft * 1.5


def test_lanes_take_precedence_over_pattern():
    """lanes is the grid the UI edits; a leftover legacy pattern must not win."""
    step = int(0.125 * 48000)
    audio = render_drum_pattern(["kick"] * 4, step_duration=0.125, lanes={"hihat": [1.0, 1.0]})
    assert audio.shape[0] == step * 2


def test_unknown_lane_voice_renders_silence():
    audio = render_drum_pattern(step_duration=0.125, lanes={"cowbell": [1.0, 1.0]})
    assert np.abs(audio).max() == 0.0


def test_swing_shuffles_off_steps():
    lanes = {"kick": [1.0, 1.0]}
    straight = render_drum_pattern(step_duration=0.125, velocity=1.0, lanes=lanes)
    swung = render_drum_pattern(step_duration=0.125, velocity=1.0, lanes=lanes, swing=0.5)
    assert swung.shape == straight.shape
    assert np.abs(swung).max() > 0
    assert not np.allclose(straight, swung)


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def test_route_renders_from_lanes_without_pattern(client):
    res = client.post("/instruments/drum-machine", json={"lanes": {"kick": [1.0, 0.0]}})
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("audio/wav")


def test_route_requires_pattern_or_lanes(client):
    res = client.post("/instruments/drum-machine", json={})
    assert res.status_code == 422


def test_route_rejects_lane_velocity_above_one(client):
    res = client.post("/instruments/drum-machine", json={"lanes": {"kick": [2.0]}})
    assert res.status_code == 422
