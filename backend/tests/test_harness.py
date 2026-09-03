"""Tests for the harness capabilities (Phase 4).

Covers:
- HarnessState lifecycle and recording
- FileInput validation and properties
- compact_text whitespace removal and truncation
- validate_result_quality
- format_audit_trail and generate_session_summary
"""

import os
import tempfile

from backend.routes.assistant_tools.harness import (
    ExecutionRecord,
    ExecutionStatus,
    FileInput,
    compact_text,
    create_harness_session,
    format_audit_trail,
    generate_session_summary,
    process_file_input,
    validate_file_input,
    validate_result_quality,
)


class TestHarnessState:
    def test_create_session(self):
        session = create_harness_session("test-123")
        assert session.session_id == "test-123"
        assert session.total_tool_calls == 0
        assert session.successful_calls == 0
        assert session.failed_calls == 0
        assert session.budget_remaining == 100

    def test_auto_session_id(self):
        session = create_harness_session()
        assert len(session.session_id) > 0
        assert session.started_at.endswith("Z")

    def test_record_execution(self):
        session = create_harness_session("test")
        record = ExecutionRecord(
            timestamp="2025-01-01T00:00:00Z",
            tool_name="list_voices",
            arguments={},
            status=ExecutionStatus.COMPLETED,
            duration_ms=100.0,
            confidence=0.9,
        )
        session.record_execution(record)
        assert session.total_tool_calls == 1
        assert session.successful_calls == 1
        assert session.budget_remaining == 99
        assert session.total_duration_ms == 100.0

    def test_record_failure(self):
        session = create_harness_session("test")
        record = ExecutionRecord(
            timestamp="2025-01-01T00:00:00Z",
            tool_name="bad_tool",
            arguments={},
            status=ExecutionStatus.FAILED,
            error="Unknown tool",
        )
        session.record_execution(record)
        assert session.failed_calls == 1

    def test_success_rate(self):
        session = create_harness_session("test")
        session.record_execution(
            ExecutionRecord(
                timestamp="2025-01-01T00:00:00Z",
                tool_name="a",
                arguments={},
                status=ExecutionStatus.COMPLETED,
            )
        )
        session.record_execution(
            ExecutionRecord(
                timestamp="2025-01-01T00:00:00Z",
                tool_name="b",
                arguments={},
                status=ExecutionStatus.FAILED,
            )
        )
        assert session.success_rate == 0.5

    def test_success_rate_no_calls(self):
        session = create_harness_session("test")
        assert session.success_rate == 1.0

    def test_budget_exhausted(self):
        session = create_harness_session("test")
        session.budget_remaining = 0
        assert session.is_budget_exhausted is True

    def test_to_dict(self):
        session = create_harness_session("test")
        session.record_execution(
            ExecutionRecord(
                timestamp="2025-01-01T00:00:00Z",
                tool_name="list_voices",
                arguments={},
                status=ExecutionStatus.COMPLETED,
            )
        )
        d = session.to_dict()
        assert d["session_id"] == "test"
        assert d["total_tool_calls"] == 1
        assert "execution_history" in d
        assert "file_inputs" in d
        assert "warnings" in d


class TestFileInput:
    def test_is_supported(self):
        fi = FileInput(
            path="/tmp/test.md", filename="test.md", extension=".md", mime_type="text/markdown", size_bytes=100
        )
        assert fi.is_supported is True

    def test_is_not_supported(self):
        fi = FileInput(
            path="/tmp/test.pdf2", filename="test.pdf2", extension=".pdf2", mime_type="application/pdf", size_bytes=100
        )
        assert fi.is_supported is False

    def test_is_text_based(self):
        fi_md = FileInput(
            path="/tmp/test.md", filename="test.md", extension=".md", mime_type="text/markdown", size_bytes=100
        )
        assert fi_md.is_text_based is True

        fi_txt = FileInput(
            path="/tmp/test.txt", filename="test.txt", extension=".txt", mime_type="text/plain", size_bytes=100
        )
        assert fi_txt.is_text_based is True

    def test_needs_transcription(self):
        fi_pdf = FileInput(
            path="/tmp/test.pdf", filename="test.pdf", extension=".pdf", mime_type="application/pdf", size_bytes=100
        )
        assert fi_pdf.needs_transcription is True

        fi_epub = FileInput(
            path="/tmp/test.epub",
            filename="test.epub",
            extension=".epub",
            mime_type="application/epub+zip",
            size_bytes=100,
        )
        assert fi_epub.needs_transcription is True

        fi_md = FileInput(
            path="/tmp/test.md", filename="test.md", extension=".md", mime_type="text/markdown", size_bytes=100
        )
        assert fi_md.needs_transcription is False


class TestCompactText:
    def test_removes_excessive_blank_lines(self):
        content = "line1\n\n\n\nline2"
        result, truncated = compact_text(content)
        assert "\n\n\n\n" not in result
        assert "\n\n" in result or "\nline2" in result
        assert truncated is False

    def test_removes_trailing_whitespace(self):
        content = "line1  \nline2\t\n\nline3"
        result, truncated = compact_text(content)
        assert not result.startswith("line1  ")
        assert truncated is False

    def test_no_truncation_within_limit(self):
        content = "short text"
        result, truncated = compact_text(content, max_tokens=1000)
        assert result == content
        assert truncated is False

    def test_truncation_preserves_start_and_end(self):
        long_content = "A" * 50000 + "\n\nMIDDLE\n\n" + "B" * 50000
        result, truncated = compact_text(long_content, max_tokens=1000)
        assert truncated is True
        assert result.startswith("A" * int(1000 * 4 * 0.7))
        assert "content truncated" in result
        assert result.endswith("B" * int(1000 * 4 * 0.3))

    def test_truncation_marker(self):
        long_content = "A" * 50000
        result, truncated = compact_text(long_content, max_tokens=100)
        assert truncated is True
        assert "[... content truncated ...]" in result


class TestValidateResultQuality:
    def test_empty_result_fails(self):
        valid, issues = validate_result_quality("tool", "")
        assert valid is False
        assert any("Empty" in i for i in issues)

    def test_valid_result(self):
        valid, issues = validate_result_quality("tool", "some result")
        assert valid is True
        assert issues == []

    def test_error_marker_fails(self):
        valid, _issues = validate_result_quality("tool", "Error something went wrong")
        assert valid is False

    def test_json_expected_valid(self):
        valid, _issues = validate_result_quality("tool", '{"key": "value"}', expected_type="json")
        assert valid is True

    def test_json_expected_invalid(self):
        valid, _issues = validate_result_quality("tool", "not json", expected_type="json")
        assert valid is False

    def test_audio_expected_valid(self):
        valid, _issues = validate_result_quality("tool", '{"audio_file": "/out.wav"}', expected_type="audio")
        assert valid is True

    def test_audio_expected_invalid(self):
        valid, _issues = validate_result_quality("tool", "no audio", expected_type="audio")
        assert valid is False


class TestFormatAuditTrail:
    def test_basic_format(self):
        session = create_harness_session("test-session")
        session.record_execution(
            ExecutionRecord(
                timestamp="2025-01-01T00:00:00Z",
                tool_name="list_voices",
                arguments={},
                status=ExecutionStatus.COMPLETED,
                duration_ms=50.0,
            )
        )
        session.record_execution(
            ExecutionRecord(
                timestamp="2025-01-01T00:00:00Z",
                tool_name="bad_tool",
                arguments={},
                status=ExecutionStatus.FAILED,
                error="not found",
                duration_ms=10.0,
            )
        )
        result = format_audit_trail(session)
        assert "test-session" in result
        assert "list_voices" in result
        assert "bad_tool" in result
        assert "✓" in result
        assert "✗" in result


class TestGenerateSessionSummary:
    def test_summary(self):
        session = create_harness_session("abc123")
        session.record_execution(
            ExecutionRecord(
                timestamp="2025-01-01T00:00:00Z",
                tool_name="list_voices",
                arguments={},
                status=ExecutionStatus.COMPLETED,
                duration_ms=50.0,
            )
        )
        summary = generate_session_summary(session)
        assert "abc123" in summary
        assert "1 calls" in summary
        assert "100% success" in summary or "100" in summary


class TestValidateFileInput:
    def test_valid_text_file(self):
        with tempfile.NamedTemporaryFile(suffix=".md", delete=False) as f:
            f.write(b"# Test")
            path = f.name
        try:
            fi = validate_file_input(path)
            assert fi.extension == ".md"
            assert fi.error is None
            assert fi.size_bytes > 0
        finally:
            os.unlink(path)

    def test_unsupported_extension(self):
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            f.write(b"fake image")
            path = f.name
        try:
            fi = validate_file_input(path)
            assert fi.error is not None
            assert "Unsupported" in fi.error
        finally:
            os.unlink(path)

    def test_oversized_file(self):
        with tempfile.NamedTemporaryFile(suffix=".md", delete=False) as f:
            f.write(b"x" * (11 * 1024 * 1024))  # 11MB
            path = f.name
        try:
            fi = validate_file_input(path)
            assert fi.error is not None
            assert "too large" in fi.error.lower()
        finally:
            os.unlink(path)


class TestProcessFileInput:
    def test_processes_text_file(self):
        with tempfile.NamedTemporaryFile(suffix=".txt", delete=False, mode="w") as f:
            f.write("# Hello\n\nWorld\n")
            path = f.name
        try:
            fi = process_file_input(path)
            assert fi.error is None
            assert "# Hello" in fi.content
            assert fi.compacted is True
        finally:
            os.unlink(path)

    def test_processes_markdown_file(self):
        with tempfile.NamedTemporaryFile(suffix=".md", delete=False, mode="w") as f:
            f.write("# Title\n\nSome text here.\n")
            path = f.name
        try:
            fi = process_file_input(path)
            assert fi.error is None
            assert "Title" in fi.content
        finally:
            os.unlink(path)

    def test_rejects_unsupported(self):
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
            f.write(b"fake")
            path = f.name
        try:
            fi = process_file_input(path)
            assert fi.error is not None
        finally:
            os.unlink(path)
