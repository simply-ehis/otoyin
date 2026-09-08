"""Tests for new import/export format features."""

import json


class TestScriptFormatParsing:
    """Test script format parsing (plain, fountain, markdown, JSON)."""

    def test_parse_plain_text(self):
        from backend.services.standalone_project import _parse_plain_text

        text = "Scene 1\nAlice: Hello\nBob: Hi there"
        scenes = _parse_plain_text(text)
        assert len(scenes) >= 1
        assert scenes[0].name == "Imported Text"

    def test_parse_markdown(self):
        from backend.services.standalone_project import _parse_markdown

        text = """# Scene 1

## Dialogue

**Alice**: Hello

**Bob**: Hi there
"""
        scenes = _parse_markdown(text)
        assert len(scenes) >= 1

    def test_parse_json(self):
        from backend.services.standalone_project import _parse_json

        data = {
            "scenes": [
                {
                    "name": "Scene 1",
                    "dialogue": [
                        {"character": "Alice", "text": "Hello"},
                        {"character": "Bob", "text": "Hi there"},
                    ],
                }
            ]
        }
        scenes = _parse_json(json.dumps(data))
        assert len(scenes) == 1
        assert scenes[0].name == "Scene 1"

    def test_parse_json_fallback_to_plain(self):
        from backend.services.standalone_project import _parse_json

        text = "Scene 1\nAlice: Hello"
        scenes = _parse_json(text)
        assert len(scenes) >= 1


class TestBatchConvert:
    """Test batch format conversion endpoint."""

    def test_batch_convert_requires_ffmpeg(self):
        """Batch convert should return 501 if ffmpeg is not available."""
        from unittest.mock import patch

        from fastapi.testclient import TestClient

        with patch("backend.routes.audio_pipeline.bridge.ffmpeg_available", return_value=False):
            from fastapi import FastAPI

            from backend.routes.audio_pipeline.bridge import router

            app = FastAPI()
            app.include_router(router)
            client = TestClient(app)
            response = client.post(
                "/bridge/batch-convert",
                json={
                    "files": ["nonexistent.wav"],
                    "format": "mp3",
                },
            )
            assert response.status_code == 501


class TestEpubPdfExport:
    """Test EPUB/PDF export services directly."""

    def test_story_export_to_epub(self):
        from backend.services.story_export import export_story_to_epub

        story_data = {
            "name": "Test Story",
            "description": "A test story",
            "items": [
                {
                    "text": "Hello world",
                    "character": "Narrator",
                    "audio_path": None,
                    "duration": 5.0,
                }
            ],
        }
        epub_bytes = export_story_to_epub("test-id", story_data, None)
        assert len(epub_bytes) > 0
        assert epub_bytes[:2] == b"PK"  # ZIP/EPUB magic bytes

    def test_story_export_to_pdf(self):
        from backend.services.story_export import export_story_to_pdf

        story_data = {
            "name": "Test Story",
            "description": "A test story",
            "items": [
                {
                    "text": "Hello world",
                    "character": "Narrator",
                    "audio_path": None,
                    "duration": 5.0,
                }
            ],
        }
        pdf_bytes = export_story_to_pdf("test-id", story_data, None)
        assert len(pdf_bytes) > 0
        assert pdf_bytes[:4] == b"%PDF"  # PDF magic bytes

    def test_project_export_to_epub(self):
        from backend.services.story_export import export_project_to_epub

        project_data = {
            "name": "Test Project",
            "description": "A test project",
            "scenes": [
                {
                    "name": "Scene 1",
                    "dialogue": [
                        {"character": "Alice", "text": "Hello"},
                        {"character": "Bob", "text": "Hi there"},
                    ],
                }
            ],
        }
        epub_bytes = export_project_to_epub("test-project-id", project_data, None)
        assert len(epub_bytes) > 0
        assert epub_bytes[:2] == b"PK"  # ZIP/EPUB magic bytes

    def test_project_export_to_pdf(self):
        from backend.services.story_export import export_project_to_pdf

        project_data = {
            "name": "Test Project",
            "description": "A test project",
            "scenes": [
                {
                    "name": "Scene 1",
                    "dialogue": [
                        {"character": "Alice", "text": "Hello"},
                        {"character": "Bob", "text": "Hi there"},
                    ],
                }
            ],
        }
        pdf_bytes = export_project_to_pdf("test-project-id", project_data, None)
        assert len(pdf_bytes) > 0
        assert pdf_bytes[:4] == b"%PDF"  # PDF magic bytes
