"""BUG-018 — Windows non-ASCII / long-path storage handling.

The audit flagged this as unverified. The probe showed the storage layer is
sound: non-ASCII paths resolve and round-trip, and paths far beyond the
260-char MAX_PATH work via the pathlib/soundfile stack on modern Python.
These tests pin that down.
"""

import numpy as np
import pytest
import soundfile as sf

from backend import config


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "_data_dir", tmp_path)
    (tmp_path / "captures").mkdir()
    return tmp_path


def _ticks(count: int) -> np.ndarray:
    return np.zeros(count, dtype=np.float32)


def test_non_ascii_filename_roundtrip(data_dir):
    target = data_dir / "captures" / "spices_éspices_汉字.wav"
    sf.write(str(target), _ticks(800), 8000)
    assert target.exists()

    resolved = config.resolve_storage_path("captures/spices_éspices_汉字.wav")
    assert resolved is not None
    assert resolved.exists()
    audio, sr = sf.read(str(resolved))
    assert sr == 8000
    assert len(audio) == 800


def test_non_ascii_path_in_resolve(data_dir):
    target = data_dir / "captures" / "abraçados_fútbol.wav"
    sf.write(str(target), _ticks(160), 8000)
    resolved = config.resolve_storage_path("captures/abraçados_fútbol.wav")
    assert resolved is not None
    assert resolved.exists()


def test_long_path_beyond_max_path_roundtrip(data_dir):
    deep = data_dir / "captures"
    for i in range(12):
        deep = deep / f"dir{i:02d}_padding_padding_padding_padding"
    deep.mkdir(parents=True)
    target = deep / "long_filename.wav"
    sf.write(str(target), _ticks(400), 8000)
    assert len(str(target)) > 260
    assert target.exists()

    resolved = config.resolve_storage_path(str(target))
    assert resolved is not None
    audio, _sr = sf.read(str(resolved))
    assert len(audio) == 400
