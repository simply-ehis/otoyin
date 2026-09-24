from pathlib import Path

import pytest

from backend.mcp_server.tools._common import _validate_body_paths, _validate_path


def test_relative_storage_paths_are_allowed():
    assert _validate_path("generations/abc.wav") == "generations/abc.wav"


def test_traversal_is_rejected():
    with pytest.raises(ValueError, match="traversal"):
        _validate_path("../secrets.txt")


def test_absolute_outside_data_or_temp_is_rejected():
    outside = Path(__file__).resolve()
    with pytest.raises(ValueError, match="absolute paths"):
        _validate_path(str(outside))


def test_absolute_data_dir_is_allowed():
    from backend import config

    path = config.get_data_dir() / "generations" / "abc.wav"
    assert _validate_path(str(path)) == str(path)


def test_session_id_is_not_treated_as_path():
    _validate_body_paths({"session_id": "..weird.."})
