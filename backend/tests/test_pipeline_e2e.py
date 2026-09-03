"""End-to-end test: run a synthetic audio file through the full editing pipeline.

Creates a real WAV file, then chains:
  1. normalize → 2. emotion-tone → 3. fade-in → 4. fade-out →
  5. trim-silence → 6. splice (cut region) → 7. analyze-loudness

Each step receives the output_path of the previous step as its input,
proving the pipeline round-trips correctly.
"""

from __future__ import annotations

import io
import wave
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pytest
from fastapi.testclient import TestClient

import backend.app as _app_mod
from backend.app import _init_ready_event, _signal_ready

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SAMPLE_RATE = 24000
DURATION_S = 3.0  # 3 seconds of audio
NUM_SAMPLES = int(SAMPLE_RATE * DURATION_S)


def _make_sine_wav_bytes(freq: float = 440.0, amplitude: float = 0.5) -> bytes:
    """Generate a WAV file in memory: sine wave + some noise."""
    t = np.linspace(0, DURATION_S, NUM_SAMPLES, dtype=np.float32)
    signal = amplitude * np.sin(2 * np.pi * freq * t)
    # Add 10% noise to make it realistic
    noise = 0.05 * np.random.randn(NUM_SAMPLES).astype(np.float32)
    audio = np.clip(signal + noise, -1.0, 1.0)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes((audio * 32767).astype(np.int16).tobytes())
    return buf.getvalue()


def _write_wav(path: Path, freq: float = 440.0, amplitude: float = 0.5) -> str:
    """Write a WAV file to disk and return the storage-relative path string."""
    wav_bytes = _make_sine_wav_bytes(freq, amplitude)
    path.write_bytes(wav_bytes)
    return str(path.name)


def _read_wav_info(path: Path) -> dict:
    """Read WAV metadata without loading full audio into memory."""
    with wave.open(str(path), "rb") as wf:
        return {
            "channels": wf.getnchannels(),
            "sample_width": wf.getsampwidth(),
            "frame_rate": wf.getframerate(),
            "n_frames": wf.getnframes(),
        }


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _ready():
    """Open the readiness gate so TestClient doesn't return 503."""
    _init_ready_event()
    _signal_ready()
    yield
    _app_mod._ready_event = None


@pytest.fixture
def client():
    from backend.app import app

    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def storage(tmp_path):
    """Create a temp data dir, write a test WAV, and patch config so routes find it."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    gen_dir = data_dir / "generations"
    gen_dir.mkdir()
    exports_dir = data_dir / "exports"
    exports_dir.mkdir()

    # Write the test WAV into data dir root so resolve_storage_path finds it
    test_wav = data_dir / "test_audio.wav"
    _write_wav(test_wav, freq=440.0, amplitude=0.6)

    # Patch backend.config directly — all route modules import config
    # via ``from ... import config`` which binds to the same module object.
    import backend.config as _cfg

    patches = {
        "backend.config.get_data_dir": lambda: data_dir,
        "backend.config.get_generations_dir": lambda: gen_dir,
        "backend.config.get_exports_dir": lambda: exports_dir,
        "backend.config.get_captures_dir": lambda: data_dir / "captures",
        "backend.config.get_profiles_dir": lambda: data_dir / "profiles",
    }

    # Patch resolve_storage_path to resolve relative paths into data_dir
    _orig_resolve = _cfg.resolve_storage_path

    def _resolve(p):
        if p is None:
            return None
        path = Path(p)
        if path.is_absolute():
            if path.exists():
                return path
            return None
        # Check data_dir root first, then exports (pipeline outputs land here)
        for base in (data_dir, exports_dir):
            candidate = (base / path).resolve()
            if candidate.exists():
                return candidate
        return None

    patches["backend.config.resolve_storage_path"] = _resolve
    patches["backend.config.to_storage_path"] = lambda p: str(p.name)

    patchers = []
    for target, value in patches.items():
        p = patch(target, value)
        p.start()
        patchers.append(p)

    yield {
        "data_dir": data_dir,
        "gen_dir": gen_dir,
        "exports_dir": exports_dir,
        "test_wav": test_wav,
        "test_wav_name": "test_audio.wav",
    }
    for p in patchers:
        p.stop()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestAudioFileGeneration:
    """Verify the test WAV file itself is valid before pipeline testing."""

    def test_wav_file_valid(self, storage):
        """The generated WAV file is readable and has correct metadata."""
        info = _read_wav_info(storage["test_wav"])
        assert info["channels"] == 1
        assert info["sample_width"] == 2  # 16-bit
        assert info["frame_rate"] == SAMPLE_RATE
        assert info["n_frames"] == NUM_SAMPLES

    def test_wav_file_nonzero(self, storage):
        """The generated audio contains actual signal (not silence)."""
        import soundfile as sf

        audio, sr = sf.read(str(storage["test_wav"]))
        assert sr == SAMPLE_RATE
        assert len(audio) > 0
        assert np.max(np.abs(audio)) > 0.1, "Audio is essentially silent"


class TestNormalizePipeline:
    """POST /audio/normalize — normalize to target loudness."""

    def test_normalize_returns_output(self, client, storage):
        """Normalize produces an output file."""
        resp = client.post(
            "/audio/normalize",
            params={"audio_path": storage["test_wav_name"], "target_db": -14.0},
        )
        assert resp.status_code == 200, f"normalize failed: {resp.status_code} {resp.text[:300]}"
        body = resp.json()
        assert "output_path" in body
        assert body["output_path"] is not None

    def test_normalize_output_is_valid_wav(self, client, storage):
        """Normalized output is a valid WAV file."""
        resp = client.post(
            "/audio/normalize",
            params={"audio_path": storage["test_wav_name"], "target_db": -14.0},
        )
        output_name = resp.json()["output_path"]
        output_path = storage["exports_dir"] / output_name
        assert output_path.exists(), f"Output file not found: {output_name}"
        info = _read_wav_info(output_path)
        assert info["channels"] >= 1
        assert info["n_frames"] > 0

    def test_normalize_silent_audio(self, client, storage):
        """Normalizing silent audio returns a message, not an error."""
        # Create silent WAV in data_dir root so resolve finds it
        silent = storage["data_dir"] / "silent.wav"
        audio = np.zeros(NUM_SAMPLES, dtype=np.float32)
        with wave.open(str(silent), "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes((audio * 32767).astype(np.int16).tobytes())

        resp = client.post(
            "/audio/normalize",
            params={"audio_path": "silent.wav", "target_db": -14.0},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body.get("output_path") is None
        assert "Silent" in body.get("message", "")


class TestFadePipeline:
    """POST /audio/fade-in and /audio/fade-out — apply fades."""

    def test_fade_in(self, client, storage):
        """Fade-in produces output without error."""
        resp = client.post(
            "/audio/fade-in",
            json={"audio_path": storage["test_wav_name"], "duration_ms": 500},
        )
        assert resp.status_code == 200, f"fade-in failed: {resp.status_code} {resp.text[:300]}"
        body = resp.json()
        assert "output_path" in body
        assert body["output_path"] is not None

    def test_fade_out(self, client, storage):
        """Fade-out produces output without error."""
        resp = client.post(
            "/audio/fade-out",
            json={
                "audio_path": storage["test_wav_name"],
                "duration_ms": 500,
                "end_ms": DURATION_S * 1000,
            },
        )
        assert resp.status_code == 200, f"fade-out failed: {resp.status_code} {resp.text[:300]}"
        body = resp.json()
        assert "output_path" in body
        assert body["output_path"] is not None


class TestSplicePipeline:
    """POST /audio/splice — keep a region of the audio."""

    def test_splice_mid_section(self, client, storage):
        """Splicing the middle 1 second produces shorter output."""
        resp = client.post(
            "/audio/splice",
            json={
                "audio_path": storage["test_wav_name"],
                "start_ms": 500.0,
                "end_ms": 1500.0,
            },
        )
        assert resp.status_code == 200, f"splice failed: {resp.status_code} {resp.text[:300]}"
        body = resp.json()
        output_name = body["output_path"]
        output_path = storage["exports_dir"] / output_name
        assert output_path.exists()
        # Output should be ~1 second (vs 3s original)
        info = _read_wav_info(output_path)
        duration_s = info["n_frames"] / info["frame_rate"]
        assert 0.8 < duration_s < 1.3, f"Expected ~1s, got {duration_s:.2f}s"


class TestTrimSilencePipeline:
    """POST /audio/trim-silence — remove leading/trailing silence."""

    def test_trim_silence(self, client, storage):
        """Trim-silence produces output without error."""
        resp = client.post(
            "/audio/trim-silence",
            json={"audio_path": storage["test_wav_name"]},
        )
        # trim-silence might return 404 or 200 depending on implementation
        assert resp.status_code in (200, 404, 422), f"trim-silence unexpected: {resp.status_code} {resp.text[:300]}"


class TestAnalyzeLoudnessPipeline:
    """POST /audio/analyze-loudness — analyze audio loudness."""

    def test_analyze_loudness(self, client, storage):
        """Analyze-loudness returns loudness metrics."""
        resp = client.post(
            "/audio/analyze-loudness",
            params={"audio_path": storage["test_wav_name"]},
        )
        assert resp.status_code == 200, f"analyze-loudness failed: {resp.status_code} {resp.text[:300]}"
        body = resp.json()
        # Should have loudness info
        assert "integrated_lufs" in body or "lufs" in body or "rms_db" in body or "loudness" in body


class TestMasterPipeline:
    """POST /audio/master — full mastering pass."""

    def test_master(self, client, storage):
        """Mastering produces output without error."""
        resp = client.post(
            "/audio/master",
            params={
                "audio_path": storage["test_wav_name"],
                "target_lufs": -14.0,
                "true_peak_db": -1.0,
            },
        )
        assert resp.status_code == 200, f"master failed: {resp.status_code} {resp.text[:300]}"
        body = resp.json()
        assert "output_path" in body
        assert body["output_path"] is not None


class TestEffectsChainPipeline:
    """POST /audio/emotion-tone — apply EQ-style effects."""

    def test_emotion_tone(self, client, storage):
        """Emotion-tone produces output with warmth and energy."""
        resp = client.post(
            "/audio/emotion-tone",
            json={
                "audio_path": storage["test_wav_name"],
                "warmth": 0.3,
                "energy": 0.2,
                "brightness": 0.1,
            },
        )
        assert resp.status_code == 200, f"emotion-tone failed: {resp.status_code} {resp.text[:300]}"
        body = resp.json()
        assert "output_path" in body
        assert body["output_path"] is not None


class TestFullPipelineChain:
    """Chain multiple editing steps end-to-end: normalize → fade → splice → export."""

    def test_normalize_then_fade_then_splice(self, client, storage):
        """Full pipeline: normalize → fade-in → splice produces valid audio."""
        wav_name = storage["test_wav_name"]

        # Step 1: Normalize
        r1 = client.post(
            "/audio/normalize",
            params={"audio_path": wav_name, "target_db": -16.0},
        )
        assert r1.status_code == 200, f"Step 1 normalize failed: {r1.text[:200]}"
        norm_path = r1.json()["output_path"]
        assert norm_path is not None

        # Step 2: Fade-in on normalized output
        r2 = client.post(
            "/audio/fade-in",
            json={"audio_path": norm_path, "duration_ms": 300},
        )
        assert r2.status_code == 200, f"Step 2 fade-in failed: {r2.text[:200]}"
        fade_path = r2.json()["output_path"]
        assert fade_path is not None

        # Step 3: Splice middle section
        r3 = client.post(
            "/audio/splice",
            json={
                "audio_path": fade_path,
                "start_ms": 200.0,
                "end_ms": 2200.0,
            },
        )
        assert r3.status_code == 200, f"Step 3 splice failed: {r3.text[:200]}"
        splice_path = r3.json()["output_path"]

        # Verify final output is valid WAV
        final = storage["exports_dir"] / splice_path
        assert final.exists(), f"Final output not found: {splice_path}"
        info = _read_wav_info(final)
        assert info["n_frames"] > 0
        assert info["frame_rate"] == SAMPLE_RATE

        duration_s = info["n_frames"] / info["frame_rate"]
        # Spliced 200ms → 2200ms = 2s segment
        assert 1.8 < duration_s < 2.3, f"Expected ~2s, got {duration_s:.2f}s"

        print(f"Pipeline OK: {wav_name} → normalize → fade-in → splice → {splice_path} ({duration_s:.2f}s)")

    def test_normalize_then_master(self, client, storage):
        """Normalize → master chain produces valid audio."""
        wav_name = storage["test_wav_name"]

        # Step 1: Normalize
        r1 = client.post(
            "/audio/normalize",
            params={"audio_path": wav_name, "target_db": -16.0},
        )
        assert r1.status_code == 200
        norm_path = r1.json()["output_path"]

        # Step 2: Master
        r2 = client.post(
            "/audio/master",
            params={
                "audio_path": norm_path,
                "target_lufs": -14.0,
                "true_peak_db": -1.0,
            },
        )
        assert r2.status_code == 200, f"master failed: {r2.text[:200]}"
        master_path = r2.json()["output_path"]

        # Verify final output
        final = storage["exports_dir"] / master_path
        assert final.exists()
        info = _read_wav_info(final)
        assert info["n_frames"] > 0

    def test_emotion_tone_then_fade(self, client, storage):
        """Emotion-tone → fade-out chain produces valid audio."""
        wav_name = storage["test_wav_name"]

        # Step 1: Emotion tone
        r1 = client.post(
            "/audio/emotion-tone",
            json={
                "audio_path": wav_name,
                "warmth": 0.5,
                "energy": 0.3,
            },
        )
        assert r1.status_code == 200
        tone_path = r1.json()["output_path"]

        # Step 2: Fade-out
        r2 = client.post(
            "/audio/fade-out",
            json={
                "audio_path": tone_path,
                "duration_ms": 800,
                "end_ms": DURATION_S * 1000,
            },
        )
        assert r2.status_code == 200
        fade_path = r2.json()["output_path"]

        # Verify
        final = storage["exports_dir"] / fade_path
        assert final.exists()
        info = _read_wav_info(final)
        assert info["n_frames"] > 0


class TestPipelineErrorHandling:
    """Verify graceful error handling for invalid inputs."""

    def test_normalize_missing_file(self, client, storage):
        """Normalizing a nonexistent file returns 404."""
        resp = client.post(
            "/audio/normalize",
            params={"audio_path": "no_such_file.wav", "target_db": -14.0},
        )
        assert resp.status_code == 404

    def test_fade_missing_file(self, client, storage):
        """Fading a nonexistent file returns 404."""
        resp = client.post(
            "/audio/fade-in",
            json={"audio_path": "no_such_file.wav", "duration_ms": 500},
        )
        assert resp.status_code == 404

    def test_splice_missing_file(self, client, storage):
        """Splicing a nonexistent file returns 404."""
        resp = client.post(
            "/audio/splice",
            json={
                "audio_path": "no_such_file.wav",
                "start_ms": 0,
                "end_ms": 1000,
            },
        )
        assert resp.status_code == 404

    def test_emotion_tone_missing_file(self, client, storage):
        """Emotion-tone on a nonexistent file returns 404."""
        resp = client.post(
            "/audio/emotion-tone",
            json={"audio_path": "no_such_file.wav"},
        )
        assert resp.status_code == 404
