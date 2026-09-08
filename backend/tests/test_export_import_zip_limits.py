"""Tests for ZIP import resource limits (zip-bomb protection).

Both importers in backend/services/export_import.py must reject
oversized archives BEFORE inflating any member into memory:
- too many entries (MAX_ZIP_MEMBERS)
- declared uncompressed size over budget (MAX_ZIP_UNCOMPRESSED)

The limits are module constants so tests can shrink them and build
tiny archives instead of real gigabyte bombs.
"""

import io
import json
import zipfile
from unittest.mock import MagicMock

import pytest

from backend.services import export_import as ei


def _make_generation_zip(member_count: int = 2, audio_bytes: int = 100) -> bytes:
    """Build a structurally valid generation export with N total members."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        manifest = {
            "version": "1.0",
            "generation": {"text": "hi", "language": "en", "duration": 0.5},
            "profile": {"name": "Someone"},
        }
        zf.writestr("manifest.json", json.dumps(manifest))
        written = 1
        if audio_bytes > 0:
            zf.writestr("audio/gen.wav", b"\x00" * audio_bytes)
            written += 1
        for i in range(member_count - written):
            zf.writestr(f"extra_{i}.txt", "x")
    return buf.getvalue()


class TestGenerationImportZipLimits:
    @pytest.mark.asyncio
    async def test_rejects_too_many_members(self, monkeypatch):
        monkeypatch.setattr(ei, "MAX_ZIP_MEMBERS", 2)
        data = _make_generation_zip(member_count=4)
        with pytest.raises(ValueError, match="too many entries"):
            await ei.import_generation_from_zip(data, MagicMock())

    @pytest.mark.asyncio
    async def test_rejects_oversized_expansion_before_read(self, monkeypatch):
        """Declared expansion over budget must fail before any member is read."""
        monkeypatch.setattr(ei, "MAX_ZIP_UNCOMPRESSED", 1000)
        # 5000 zero bytes compress to almost nothing but declare 5x the limit.
        data = _make_generation_zip(audio_bytes=5000)
        with pytest.raises(ValueError, match="expands to"):
            await ei.import_generation_from_zip(data, MagicMock())

    @pytest.mark.asyncio
    async def test_within_limits_completes_import(self, monkeypatch, tmp_path):
        """A small archive gets past bounds checks and completes end-to-end.

        Storage is redirected to tmp_path so the run has zero effect on
        real user data directories.
        """
        monkeypatch.setattr(ei.config, "get_generations_dir", lambda: tmp_path)
        monkeypatch.setattr(ei, "MAX_ZIP_MEMBERS", 10)
        monkeypatch.setattr(ei, "MAX_ZIP_UNCOMPRESSED", 100_000)
        data = _make_generation_zip(member_count=2, audio_bytes=100)

        db = MagicMock()
        result = await ei.import_generation_from_zip(data, db)

        assert result["id"]
        # The imported WAV landed in the redirected storage dir...
        copied = list(tmp_path.glob("*.wav"))
        assert len(copied) == 1
        # ...and a generation row was staged on the session.
        db.add.assert_called_once()
        db.commit.assert_called_once()


class TestProfileImportZipLimitsShareConstants:
    @pytest.mark.asyncio
    async def test_profile_importer_uses_same_constants(self, monkeypatch):
        """The profile importer must honor the same module-level limits."""
        from unittest.mock import patch

        monkeypatch.setattr(ei, "MAX_ZIP_MEMBERS", 2)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("manifest.json", "{}")
            zf.writestr("samples.json", "{}")
            zf.writestr("extra.bin", "x")
            zf.writestr("extra2.bin", "x")
        with (
            patch.object(ei, "_get_unique_profile_name", return_value="p"),
            pytest.raises(ValueError, match="too many entries"),
        ):
            await ei.import_profile_from_zip(buf.getvalue(), MagicMock())
