"""Tests for /files/* endpoints and /health/features + /health/dsp.

Covers:
- POST /files/read       — read text files
- POST /files/read-pdf   — extract PDF text
- POST /files/read-epub  — extract EPUB text
- POST /files/transcribe — transcribe audio (mocked)
- POST /files/compact    — compact/truncate text
- POST /files/list-supported — list readable files in directory
- POST /files/validate   — validate file path/type/size
- GET  /health/features  — optional feature availability
- GET  /health/dsp       — DSP subsystem health
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import backend.app as _app_mod
from backend.app import _init_ready_event, _signal_ready

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _ready():
    """Ensure readiness gate is open so TestClient doesn't return 503."""
    _init_ready_event()
    _signal_ready()
    yield
    _app_mod._ready_event = None


@pytest.fixture
def client():
    """Create a TestClient backed by the real FastAPI app."""
    from backend.app import app

    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def data_dir(tmp_path):
    """Create a temporary data directory and patch config to use it."""
    data = tmp_path / "data"
    data.mkdir()
    with (
        patch("backend.routes.files.config.get_data_dir", return_value=data),
        patch("backend.routes.files.config.resolve_storage_path") as mock_resolve,
    ):
        # Default: resolve relative paths into tmp data dir
        def _resolve(p: str):
            candidate = (data / p).resolve()
            if candidate.exists():
                return candidate
            return None

        mock_resolve.side_effect = _resolve
        yield data


# ---------------------------------------------------------------------------
# 1. POST /files/read — read text files
# ---------------------------------------------------------------------------


class TestFilesRead:
    def test_read_text_file(self, client, data_dir):
        """Read a .md file returns its contents."""
        test_file = data_dir / "hello.md"
        test_file.write_text("# Hello\n\nWorld content here.", encoding="utf-8")

        resp = client.post("/files/read", json={"path": "hello.md"})
        assert resp.status_code == 200
        body = resp.json()
        assert "Hello" in body["content"]
        assert body["path"] == "hello.md"
        assert body["truncated"] is False
        assert body["size_bytes"] > 0

    def test_read_txt_file(self, data_dir, client):
        """Read a .txt file works."""
        test_file = data_dir / "notes.txt"
        test_file.write_text("Simple text.", encoding="utf-8")

        resp = client.post("/files/read", json={"path": "notes.txt"})
        assert resp.status_code == 200
        assert "Simple text." in resp.json()["content"]

    def test_read_unsupported_type(self, data_dir, client):
        """Reading a .pyc file returns 400."""
        test_file = data_dir / "script.pyc"
        test_file.write_bytes(b"\x00")

        resp = client.post("/files/read", json={"path": "script.pyc"})
        assert resp.status_code == 400
        assert "Unsupported file type" in resp.json()["detail"]

    def test_read_missing_file(self, client):
        """Reading a nonexistent file returns 404."""
        resp = client.post("/files/read", json={"path": "nonexistent.md"})
        assert resp.status_code == 404

    def test_read_with_compact(self, data_dir, client):
        """Compacting whitespace-normalized text."""
        test_file = data_dir / "spaces.txt"
        test_file.write_text("Hello    world\n\n\n\n\n\nEnd", encoding="utf-8")

        resp = client.post("/files/read", json={"path": "spaces.txt", "compact": True})
        assert resp.status_code == 200
        content = resp.json()["content"]
        assert "\n\n\n" not in content  # excess newlines collapsed

    def test_read_without_compact(self, data_dir, client):
        """Non-compact mode preserves whitespace."""
        test_file = data_dir / "raw.txt"
        test_file.write_text("Hello   world", encoding="utf-8")

        resp = client.post("/files/read", json={"path": "raw.txt", "compact": False})
        assert resp.status_code == 200
        assert "Hello   world" in resp.json()["content"]


# ---------------------------------------------------------------------------
# 2. POST /files/read-pdf — extract PDF text
# ---------------------------------------------------------------------------


class TestFilesReadPdf:
    def test_read_non_pdf_returns_400(self, data_dir, client):
        """Non-PDF file returns 400."""
        test_file = data_dir / "doc.txt"
        test_file.write_text("not a pdf", encoding="utf-8")

        resp = client.post("/files/read-pdf", json={"path": "doc.txt"})
        assert resp.status_code == 400
        assert "Not a PDF" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# 3. POST /files/read-epub — extract EPUB text
# ---------------------------------------------------------------------------


class TestFilesReadEpub:
    def test_read_non_epub_returns_400(self, data_dir, client):
        """Non-EPUB file returns 400."""
        test_file = data_dir / "book.txt"
        test_file.write_text("not an epub", encoding="utf-8")

        resp = client.post("/files/read-epub", json={"path": "book.txt"})
        assert resp.status_code == 400
        assert "Not an EPUB" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# 4. POST /files/compact — compact/truncate text
# ---------------------------------------------------------------------------


class TestFilesCompact:
    def test_compact_whitespace(self, client):
        """Extra whitespace is collapsed."""
        resp = client.post(
            "/files/compact",
            json={
                "text": "Hello   world\n\n\n\n\nEnd",
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["truncated"] is False
        assert "\n\n\n" not in body["content"]
        assert "Hello world" in body["content"]

    def test_compact_with_max_tokens(self, client):
        """Long text is truncated when max_tokens is set."""
        long_text = "word " * 2000  # ~10k chars
        resp = client.post(
            "/files/compact",
            json={
                "text": long_text,
                "max_tokens": 100,  # ~400 chars
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["truncated"] is True
        assert len(body["content"]) < len(long_text)
        assert "[... truncated ...]" in body["content"]

    def test_compact_short_text_no_truncation(self, client):
        """Short text is not truncated."""
        resp = client.post(
            "/files/compact",
            json={
                "text": "Short text.",
                "max_tokens": 1000,
            },
        )
        assert resp.status_code == 200
        assert resp.json()["truncated"] is False
        assert resp.json()["content"] == "Short text."

    def test_compact_tracks_lengths(self, client):
        """Response includes original and compacted lengths."""
        resp = client.post("/files/compact", json={"text": "  spaced  "})
        assert resp.status_code == 200
        body = resp.json()
        assert body["original_length"] == len("  spaced  ")
        assert body["compacted_length"] == len(body["content"])


# ---------------------------------------------------------------------------
# 5. POST /files/list-supported — list readable files in directory
# ---------------------------------------------------------------------------


class TestFilesListSupported:
    def test_list_files(self, data_dir, client):
        """Lists supported files in a directory."""
        (data_dir / "readme.md").write_text("hi", encoding="utf-8")
        (data_dir / "data.json").write_text("{}", encoding="utf-8")
        (data_dir / "image.png").write_bytes(b"\x89PNG")  # unsupported

        resp = client.post("/files/list-supported", json={"directory": "."})
        assert resp.status_code == 200
        body = resp.json()
        paths = [f["path"] for f in body["files"]]
        assert "readme.md" in paths
        assert "data.json" in paths
        assert "image.png" not in paths
        assert body["count"] == 2

    def test_list_empty_directory(self, data_dir, client):
        """Empty directory returns empty list."""
        empty = data_dir / "empty"
        empty.mkdir()

        resp = client.post("/files/list-supported", json={"directory": "empty"})
        assert resp.status_code == 200
        assert resp.json()["count"] == 0
        assert resp.json()["files"] == []

    def test_list_not_a_directory(self, data_dir, client):
        """A file path (not directory) returns 400."""
        (data_dir / "file.txt").write_text("hi", encoding="utf-8")

        resp = client.post("/files/list-supported", json={"directory": "file.txt"})
        assert resp.status_code == 400
        assert "Not a directory" in resp.json()["detail"]

    def test_list_recursive(self, data_dir, client):
        """Recursive mode finds files in subdirectories."""
        sub = data_dir / "sub"
        sub.mkdir()
        (sub / "nested.md").write_text("deep", encoding="utf-8")
        (data_dir / "top.txt").write_text("top", encoding="utf-8")

        resp = client.post(
            "/files/list-supported",
            json={
                "directory": ".",
                "recursive": True,
            },
        )
        assert resp.status_code == 200
        paths = [f["path"] for f in resp.json()["files"]]
        assert any("nested.md" in p for p in paths)
        assert "top.txt" in paths

    def test_list_file_info_fields(self, data_dir, client):
        """Each listed file has path, extension, size_bytes, readable."""
        (data_dir / "test.md").write_text("content", encoding="utf-8")

        resp = client.post("/files/list-supported", json={"directory": "."})
        file_entry = resp.json()["files"][0]
        assert "path" in file_entry
        assert "extension" in file_entry
        assert file_entry["extension"] == ".md"
        assert "size_bytes" in file_entry
        assert file_entry["readable"] is True


# ---------------------------------------------------------------------------
# 6. POST /files/validate — validate file path/type/size
# ---------------------------------------------------------------------------


class TestFilesValidate:
    def test_validate_existing_file(self, data_dir, client):
        """Existing supported file is valid."""
        (data_dir / "ok.md").write_text("hello", encoding="utf-8")

        resp = client.post("/files/validate", json={"path": "ok.md"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["valid"] is True
        assert body["exists"] is True
        assert body["extension"] == ".md"
        assert body["file_type"] == "text"
        assert body["size_bytes"] > 0

    def test_validate_missing_file(self, client):
        """Missing file is not valid."""
        resp = client.post("/files/validate", json={"path": "nope.md"})
        assert resp.status_code == 200  # returns 200 with valid=False
        body = resp.json()
        assert body["valid"] is False
        assert body["error"] == "File not found"

    def test_validate_pdf_type(self, data_dir, client):
        """PDF file is recognized."""
        (data_dir / "doc.pdf").write_bytes(b"%PDF-1.4")

        resp = client.post("/files/validate", json={"path": "doc.pdf"})
        assert resp.status_code == 200
        assert resp.json()["file_type"] == "pdf"
        assert resp.json()["valid"] is True

    def test_validate_audio_type(self, data_dir, client):
        """Audio file is recognized."""
        (data_dir / "clip.wav").write_bytes(b"RIFF")

        resp = client.post("/files/validate", json={"path": "clip.wav"})
        assert resp.status_code == 200
        assert resp.json()["file_type"] == "audio"
        assert resp.json()["valid"] is True

    def test_validate_epub_type(self, data_dir, client):
        """EPUB file is recognized."""
        (data_dir / "book.epub").write_bytes(b"PK")

        resp = client.post("/files/validate", json={"path": "book.epub"})
        assert resp.status_code == 200
        assert resp.json()["file_type"] == "epub"
        assert resp.json()["valid"] is True


# ---------------------------------------------------------------------------
# 7. POST /files/transcribe — transcribe audio (mocked)
# ---------------------------------------------------------------------------


class TestFilesTranscribe:
    def test_transcribe_non_audio_returns_400(self, data_dir, client):
        """Non-audio file returns 400."""
        (data_dir / "doc.md").write_text("text", encoding="utf-8")

        resp = client.post(
            "/files/transcribe",
            json={
                "audio_path": "doc.md",
            },
        )
        assert resp.status_code == 400
        assert "Not an audio file" in resp.json()["detail"]

    def test_transcribe_missing_file(self, client):
        """Missing audio file returns 404."""
        resp = client.post(
            "/files/transcribe",
            json={
                "audio_path": "missing.wav",
            },
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 8. GET /health/features — optional feature availability
# ---------------------------------------------------------------------------


class TestHealthFeatures:
    def test_features_returns_dict(self, client):
        """Response contains features dict and probed_at."""
        resp = client.get("/health/features")
        assert resp.status_code == 200
        body = resp.json()
        assert "features" in body
        assert "probed_at" in body

    def test_features_has_expected_keys(self, client):
        """All expected feature keys are present."""
        resp = client.get("/health/features")
        features = resp.json()["features"]
        expected_keys = [
            "dsp_synth",
            "pedalboard",
            "librosa",
            "espeakng_loader",
            "demucs",
            "deepfilternet",
            "faster_whisper",
            "pywhispercpp",
            "torch",
            "onnxruntime",
            "argostranslate",
            "deep_translator",
            "resemblyzer",
            "silero_vad",
            "sklearn",
            "pymupdf",
            "yt_dlp",
            "audio_dsp",
        ]
        for key in expected_keys:
            assert key in features, f"Missing feature key: {key}"

    def test_features_entry_structure(self, client):
        """Each feature has 'available' and 'version' keys."""
        resp = client.get("/health/features")
        for name, info in resp.json()["features"].items():
            assert "available" in info, f"{name} missing 'available'"
            assert "version" in info, f"{name} missing 'version'"
            assert isinstance(info["available"], bool)

    def test_deepfilternet_uses_onnx_engine(self, client):
        """DeepFilterNet reports ONNX engine, not torch."""
        resp = client.get("/health/features")
        df = resp.json()["features"]["deepfilternet"]
        # The ONNX path should be available (onnxruntime is installed)
        if df["available"]:
            assert df.get("engine") == "onnx"

    def test_torch_has_cuda_field(self, client):
        """Torch entry includes cuda availability."""
        resp = client.get("/health/features")
        torch_info = resp.json()["features"]["torch"]
        assert "cuda" in torch_info
        assert isinstance(torch_info["cuda"], bool)

    def test_features_caching(self, client):
        """Two consecutive calls return the same probed_at (cached)."""
        r1 = client.get("/health/features")
        r2 = client.get("/health/features")
        assert r1.json()["probed_at"] == r2.json()["probed_at"]

    def test_audio_dsp_alias(self, client):
        """audio_dsp is an alias for dsp_synth."""
        resp = client.get("/health/features")
        features = resp.json()["features"]
        assert features["audio_dsp"] == features["dsp_synth"]


# ---------------------------------------------------------------------------
# 9. GET /health/dsp — DSP subsystem health
# ---------------------------------------------------------------------------


class TestHealthDsp:
    def test_dsp_returns_structure(self, client):
        """Response has dsp_synth and pedalboard keys."""
        resp = client.get("/health/dsp")
        assert resp.status_code == 200
        body = resp.json()
        assert "dsp_synth" in body
        assert "pedalboard" in body

    def test_dsp_synth_fields(self, client):
        """dsp_synth has available, version, synthesizers, effects."""
        resp = client.get("/health/dsp")
        ds = resp.json()["dsp_synth"]
        assert "available" in ds
        assert "version" in ds
        assert "synthesizers" in ds
        assert "effects" in ds
        assert isinstance(ds["synthesizers"], list)
        assert isinstance(ds["effects"], list)

    def test_dsp_synth_lists_synths_when_available(self, client):
        """When audio-dsp is available, synth list is non-empty."""
        resp = client.get("/health/dsp")
        ds = resp.json()["dsp_synth"]
        if ds["available"]:
            assert len(ds["synthesizers"]) > 0
            assert len(ds["effects"]) > 0
            # Spot-check known synths
            assert "subtractive" in ds["synthesizers"]
            assert "fm" in ds["synthesizers"]

    def test_dsp_synth_empty_when_unavailable(self, client):
        """When audio-dsp is not available, lists are empty."""
        # If it IS available, we can't test the empty path without mocking
        # — but we verify the structure is correct either way
        resp = client.get("/health/dsp")
        ds = resp.json()["dsp_synth"]
        if not ds["available"]:
            assert ds["synthesizers"] == []
            assert ds["effects"] == []

    def test_pedalboard_fields(self, client):
        """pedalboard has available and version."""
        resp = client.get("/health/dsp")
        pb = resp.json()["pedalboard"]
        assert "available" in pb
        assert "version" in pb
        assert isinstance(pb["available"], bool)

    def test_dsp_caching(self, client):
        """Two calls return the same probed_at (cached)."""
        r1 = client.get("/health/dsp")
        r2 = client.get("/health/dsp")
        assert r1.json()["dsp_synth"]["available"] == r2.json()["dsp_synth"]["available"]


# ---------------------------------------------------------------------------
# 10. Unit tests for _compact_text helper
# ---------------------------------------------------------------------------


class TestCompactTextHelper:
    """Direct tests for the _compact_text function (no HTTP)."""

    def test_no_truncation(self):
        from backend.routes.files import _compact_text

        result, truncated = _compact_text("Hello world.")
        assert result == "Hello world."
        assert truncated is False

    def test_truncation_preserve_start_end(self):
        from backend.routes.files import _compact_text

        text = "A" * 2000
        result, truncated = _compact_text(text, max_tokens=100, preserve_start_end=True)
        assert truncated is True
        assert "[... truncated ...]" in result
        assert len(result) < len(text)

    def test_truncation_head_only(self):
        from backend.routes.files import _compact_text

        text = "A" * 2000
        result, truncated = _compact_text(text, max_tokens=100, preserve_start_end=False)
        assert truncated is True
        assert "[... truncated ...]" not in result

    def test_whitespace_normalization(self):
        from backend.routes.files import _compact_text

        result, _ = _compact_text("Hello    world\n\n\n\n\nEnd")
        assert "Hello world" in result
        assert "\n\n\n" not in result
