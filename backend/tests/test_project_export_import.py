"""Tests for standalone project export/import (Prompt 21 — self-contained ZIP)."""

import io
import json
import zipfile
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.services import export_import as ei


def _make_manifest(*, include_profile=True, include_audio=False):
    """Build a valid manifest for testing."""
    profile_data = {}
    if include_profile:
        profile_data["prof-test1"] = {
            "name": "Test Voice",
            "description": "A test voice",
            "language": "en",
            "voice_type": "cloned",
            "preset_engine": None,
            "preset_voice_id": None,
            "design_prompt": None,
            "voice_attributes": None,
            "default_engine": None,
            "personality": None,
            "effects_chain": None,
            "avatar": None,
            "samples": [],
        }
    audio_files = []
    if include_audio:
        audio_files = [{"path": "data/generations/abc.wav", "arc": "audio/abc.wav"}]
    return {
        "version": "1.0",
        "export_id": "project-test1234",
        "project": {
            "id": "proj-test1",
            "name": "Test Project",
            "description": "A test project",
            "fps": 24.0,
            "sample_rate": 48000,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
            "scenes": [{"id": "s1", "name": "Scene 1", "duration": 60.0, "dialogue": [], "markers": []}],
            "characters": [{"id": "c1", "name": "Narrator", "voice_profile_id": "prof-test1", "description": ""}],
            "script_text": "",
            "script_format": "plain",
            "audio_files": [],
        },
        "profiles": profile_data,
        "audio_files": audio_files,
    }


def _make_project_zip(*, include_profile=True, include_audio=False) -> bytes:
    """Build a minimal valid project archive."""
    manifest = _make_manifest(include_profile=include_profile, include_audio=include_audio)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(manifest))
        if include_audio:
            zf.writestr("audio/abc.wav", b"\x00" * 200)
    return buf.getvalue()


def _make_db_mock(*, profile_exists=False):
    """DB mock for import tests with properly configured query chains."""
    from backend.database import VoiceProfile as DBVoiceProfile

    db = MagicMock()
    # VoiceProfile query chain: .query(DBVoiceProfile).filter_by().first()
    vp_query = MagicMock()
    vp_query.first.return_value = MagicMock(id="existing-prof-id") if profile_exists else None
    vp_query.all.return_value = []
    vp_query.filter.return_value = vp_query
    vp_query.filter_by.return_value = vp_query
    vp_query.update.return_value = None

    def query_side_effect(model):
        if model is DBVoiceProfile:
            return vp_query
        return MagicMock()

    db.query.side_effect = query_side_effect
    return db


def _mock_db_export(*, scenes=True, profiles=None):
    """DB mock for export tests."""
    db = MagicMock()
    manifest = _make_project_manifest(scenes=scenes)
    mock_doc = MagicMock()
    mock_doc.project_json = json.dumps(manifest)
    db.query.return_value.filter_by.return_value.first.return_value = mock_doc
    if profiles is not None:
        db.query.return_value.filter.return_value.all.return_value = profiles
    return db


def _make_project_manifest(*, scenes=True):
    m = {
        "id": "proj-test1",
        "name": "Test Project",
        "description": "",
        "fps": 24.0,
        "sample_rate": 48000,
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
        "scenes": [],
        "characters": [{"id": "c1", "name": "Narrator", "voice_profile_id": None, "description": ""}],
        "script_text": "",
        "script_format": "plain",
        "audio_files": [],
    }
    if scenes:
        m["scenes"] = [{"id": "s1", "name": "Scene 1", "duration": 60.0, "dialogue": [], "markers": []}]
    return m


class TestProjectExport:
    def test_export_produces_valid_zip(self):
        db = _mock_db_export()
        zip_bytes = ei.export_standalone_project_to_zip("proj-test1", db)
        assert len(zip_bytes) > 100
        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
            assert "manifest.json" in zf.namelist()
            manifest = json.loads(zf.read("manifest.json"))
            assert manifest["version"] == "1.0"
            assert manifest["project"]["name"] == "Test Project"

    def test_export_fails_for_missing_project(self):
        db = MagicMock()
        db.query.return_value.filter_by.return_value.first.return_value = None
        with pytest.raises(ValueError, match="not found"):
            ei.export_standalone_project_to_zip("nonexistent", db)

    def test_export_fails_for_empty_scenes(self):
        db = _mock_db_export(scenes=False)
        with pytest.raises(ValueError, match="no scenes"):
            ei.export_standalone_project_to_zip("proj-test1", db)


class TestProjectImport:
    @pytest.mark.asyncio
    async def test_import_rejects_invalid_zip(self):
        with pytest.raises(ValueError, match="Invalid ZIP"):
            await ei.import_standalone_project_from_zip(b"not a zip", MagicMock())

    @pytest.mark.asyncio
    async def test_import_rejects_missing_manifest(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("readme.txt", "hello")
        with pytest.raises(ValueError, match="missing manifest"):
            await ei.import_standalone_project_from_zip(buf.getvalue(), MagicMock())

    @pytest.mark.asyncio
    async def test_import_rejects_bad_version(self):
        manifest = {"version": "9.0", "project": {}, "profiles": {}}
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("manifest.json", json.dumps(manifest))
        with pytest.raises(ValueError, match="Unsupported"):
            await ei.import_standalone_project_from_zip(buf.getvalue(), MagicMock())

    @pytest.mark.asyncio
    async def test_import_rejects_missing_project_key(self):
        manifest = {"version": "1.0", "profiles": {}}
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("manifest.json", json.dumps(manifest))
        with pytest.raises(ValueError, match="missing project"):
            await ei.import_standalone_project_from_zip(buf.getvalue(), MagicMock())

    @pytest.mark.asyncio
    async def test_import_roundtrip(self, tmp_path):
        zip_bytes = _make_project_zip(include_profile=True)
        db = _make_db_mock(profile_exists=False)

        mock_profile = MagicMock()
        mock_profile.id = "new-prof-id"

        with (
            patch.object(ei, "create_profile", new_callable=AsyncMock, return_value=mock_profile),
            patch.object(ei, "_get_unique_profile_name", return_value="Test Voice"),
            patch.object(ei.config, "get_generations_dir", return_value=tmp_path),
            patch.object(ei.config, "to_storage_path", side_effect=lambda p: str(p)),
        ):
            result = await ei.import_standalone_project_from_zip(zip_bytes, db)

        assert result["id"]
        assert result["name"] == "Test Project"
        assert result["scenes"] == 1
        assert result["characters"] == 1
        assert result["profiles_imported"] == 1

    @pytest.mark.asyncio
    async def test_import_reuses_profile_by_name(self):
        zip_bytes = _make_project_zip(include_profile=True)
        db = _make_db_mock(profile_exists=True)

        with (
            patch.object(ei.config, "get_generations_dir", return_value=MagicMock()),
            patch.object(ei.config, "to_storage_path", side_effect=lambda p: str(p)),
        ):
            result = await ei.import_standalone_project_from_zip(zip_bytes, db)

        assert result["profiles_reused"] == 1
        assert result["profiles_imported"] == 0

    @pytest.mark.asyncio
    async def test_zip_limits_enforced(self, monkeypatch):
        monkeypatch.setattr(ei, "MAX_ZIP_MEMBERS", 2)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            manifest = _make_manifest(include_profile=False)
            zf.writestr("manifest.json", json.dumps(manifest))
            zf.writestr("extra1.txt", "x")
            zf.writestr("extra2.txt", "x")
        with pytest.raises(ValueError, match="too many"):
            await ei.import_standalone_project_from_zip(buf.getvalue(), MagicMock())

    def test_profile_embedded_in_manifest(self):
        zip_bytes = _make_project_zip(include_profile=True)
        with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
            manifest = json.loads(zf.read("manifest.json"))
        profiles = manifest["profiles"]
        assert len(profiles) == 1
        assert profiles["prof-test1"]["name"] == "Test Voice"
        assert profiles["prof-test1"]["voice_type"] == "cloned"
        assert profiles["prof-test1"]["language"] == "en"
