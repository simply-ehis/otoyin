"""End-to-end tests for the voice clone flow.

Covers the full lifecycle:
  1. Create a cloned voice profile
  2. Add a reference audio sample
  3. Verify profile exists with correct metadata
  4. Verify sample is attached and accessible
  5. Delete profile and verify cleanup
"""

import io
import os
import tempfile
import wave
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base, get_db
from backend.routes.profiles import router as profiles_router


def _make_test_wav_bytes(duration_s: float = 1.0, sr: int = 24000) -> bytes:
    """Create a minimal WAV file in memory for testing."""
    n_samples = int(sr * duration_s)
    t = np.arange(n_samples) / sr
    audio = (0.5 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes((audio * 32767).astype(np.int16).tobytes())
    return buf.getvalue()


@pytest.fixture
def client(tmp_path):
    """Build app with file-based DB, mocked filesystem, and mocked ML deps."""
    profiles_dir = tmp_path / "profiles"
    profiles_dir.mkdir()

    fd, db_path = tempfile.mkstemp(suffix=".db", dir=str(tmp_path))
    os.close(fd)
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    app = FastAPI()
    app.include_router(profiles_router)

    def _override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db

    patches = [
        patch(
            "backend.services.profiles.config.get_profiles_dir",
            return_value=profiles_dir,
        ),
        patch(
            "backend.services.profiles.save_audio",
            side_effect=lambda audio, path, sr: Path(path).write_bytes(b""),
        ),
        patch(
            "backend.services.profiles.validate_and_load_reference_audio",
            return_value=(True, "", np.zeros(24000, dtype=np.float32), 24000),
        ),
        patch(
            "backend.services.noise_reduction.reduce_noise_deepfilternet",
            side_effect=lambda audio, sr: audio,
        ),
        patch("backend.services.telemetry.track_event"),
    ]
    for p in patches:
        p.start()

    with TestClient(app) as c:
        yield c

    for p in patches:
        p.stop()
    engine.dispose()
    os.unlink(db_path)


@pytest.fixture
def sample_wav(tmp_path):
    """Create a test WAV file on disk."""
    path = tmp_path / "test_voice.wav"
    path.write_bytes(_make_test_wav_bytes(duration_s=2.0))
    return path


class TestVoiceCloneE2E:
    """Full voice clone lifecycle."""

    def test_create_profile(self, client):
        """Create a cloned voice profile."""
        resp = client.post(
            "/profiles",
            json={
                "name": "Test Clone Voice",
                "language": "en",
                "voice_type": "cloned",
                "description": "A test cloned voice",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Test Clone Voice"
        assert data["voice_type"] == "cloned"
        assert "id" in data

    def test_add_sample_to_profile(self, client, sample_wav):
        """Create profile, then add a reference audio sample."""
        resp = client.post(
            "/profiles",
            json={"name": "Sample Test", "language": "en", "voice_type": "cloned"},
        )
        assert resp.status_code == 200
        profile_id = resp.json()["id"]

        with open(sample_wav, "rb") as f:
            resp = client.post(
                f"/profiles/{profile_id}/samples",
                files={"file": ("test.wav", f, "audio/wav")},
                data={"reference_text": "Hello, this is a test voice sample."},
            )
        assert resp.status_code == 200
        sample = resp.json()
        assert sample["reference_text"] == "Hello, this is a test voice sample."

    def test_full_clone_flow(self, client, sample_wav):
        """Complete clone flow: create -> add sample -> verify -> get profile."""
        resp = client.post(
            "/profiles",
            json={
                "name": "Full Clone Test",
                "language": "en",
                "voice_type": "cloned",
                "default_engine": "qwen3_tts",
            },
        )
        assert resp.status_code == 200
        profile_id = resp.json()["id"]

        with open(sample_wav, "rb") as f:
            resp = client.post(
                f"/profiles/{profile_id}/samples",
                files={"file": ("voice.wav", f, "audio/wav")},
                data={"reference_text": "The quick brown fox jumps over the lazy dog."},
            )
        assert resp.status_code == 200

        resp = client.get(f"/profiles/{profile_id}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "Full Clone Test"

        resp = client.get(f"/profiles/{profile_id}/samples")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    def test_delete_profile_cleans_up(self, client, sample_wav):
        """Delete a profile and verify it's gone."""
        resp = client.post(
            "/profiles",
            json={"name": "Delete Me", "language": "en", "voice_type": "cloned"},
        )
        assert resp.status_code == 200, resp.json()
        profile_id = resp.json()["id"]

        with open(sample_wav, "rb") as f:
            resp = client.post(
                f"/profiles/{profile_id}/samples",
                files={"file": ("voice.wav", f, "audio/wav")},
                data={"reference_text": "Test"},
            )
        assert resp.status_code == 200, resp.json()

        resp = client.delete(f"/profiles/{profile_id}")
        assert resp.status_code == 200

        resp = client.get(f"/profiles/{profile_id}")
        assert resp.status_code == 404

    def test_multiple_samples_per_profile(self, client, sample_wav):
        """A profile can have multiple reference samples."""
        resp = client.post(
            "/profiles",
            json={"name": "Multi Sample", "language": "en", "voice_type": "cloned"},
        )
        assert resp.status_code == 200, resp.json()
        profile_id = resp.json()["id"]

        for i in range(3):
            with open(sample_wav, "rb") as f:
                resp = client.post(
                    f"/profiles/{profile_id}/samples",
                    files={"file": (f"voice_{i}.wav", f, "audio/wav")},
                    data={"reference_text": f"Sample number {i}"},
                )
            assert resp.status_code == 200, resp.json()

        resp = client.get(f"/profiles/{profile_id}/samples")
        assert len(resp.json()) == 3

    def test_delete_sample(self, client, sample_wav):
        """Delete a specific sample from a profile."""
        resp = client.post(
            "/profiles",
            json={"name": "Delete Sample", "language": "en", "voice_type": "cloned"},
        )
        assert resp.status_code == 200, resp.json()
        profile_id = resp.json()["id"]

        with open(sample_wav, "rb") as f:
            resp = client.post(
                f"/profiles/{profile_id}/samples",
                files={"file": ("voice.wav", f, "audio/wav")},
                data={"reference_text": "Delete me"},
            )
        assert resp.status_code == 200, resp.json()
        sample_id = resp.json()["id"]

        resp = client.delete(f"/profiles/samples/{sample_id}")
        assert resp.status_code == 200

        resp = client.get(f"/profiles/{profile_id}/samples")
        assert all(s["id"] != sample_id for s in resp.json())

    def test_duplicate_profile_name_rejected(self, client):
        """Creating two profiles with the same name fails."""
        resp = client.post(
            "/profiles",
            json={"name": "Unique Name", "language": "en", "voice_type": "cloned"},
        )
        assert resp.status_code == 200

        resp = client.post(
            "/profiles",
            json={"name": "Unique Name", "language": "en", "voice_type": "cloned"},
        )
        assert resp.status_code == 400

    def test_list_profiles(self, client):
        """List profiles returns created profiles."""
        client.post(
            "/profiles",
            json={"name": "Alpha", "language": "en", "voice_type": "cloned"},
        )
        client.post(
            "/profiles",
            json={"name": "Beta", "language": "en", "voice_type": "cloned"},
        )

        resp = client.get("/profiles")
        assert resp.status_code == 200
        names = {p["name"] for p in resp.json()}
        assert "Alpha" in names
        assert "Beta" in names
