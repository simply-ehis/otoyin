"""eSpeak-ng runtime-asset service tests.

No network here - the actual wheel download is deliberately not exercised in
CI. What is pinned: which engines trigger the assets, the resulting audiocpp
session-option arguments, idempotency of the install check, and integrity
failure modes.
"""

import pytest


@pytest.fixture
def fake_install(tmp_path, monkeypatch):
    """Point the service at a temp data dir and make the assets appear installed."""
    from backend.services import espeak_assets

    monkeypatch.setattr(espeak_assets, "espeak_dir", lambda: tmp_path)
    monkeypatch.setattr(espeak_assets, "espeak_lib_path", lambda: tmp_path / "espeak-ng.dll")
    monkeypatch.setattr(espeak_assets, "espeak_data_path", lambda: tmp_path / "espeak-ng-data")
    return espeak_assets, tmp_path


def test_engine_set_matches_audio_cpp_specs():
    from backend.services.espeak_assets import ESPEAK_ENGINES, ESPEAK_FAMILIES

    assert {"kokoro", "piper_tts", "inflect_v2", "kitten_tts"} == ESPEAK_ENGINES
    assert {"kokoro_tts", "piper_tts", "inflect_v2", "kitten_tts"} == ESPEAK_FAMILIES


def test_ensure_for_non_espeak_engine_is_noop(monkeypatch):
    from backend.services import espeak_assets

    called = []
    monkeypatch.setattr(espeak_assets, "ensure_espeak_installed", lambda: called.append(1) or True)
    assert espeak_assets.ensure_espeak_for_engine("heartmula") is False
    assert espeak_assets.ensure_espeak_for_engine(None) is False
    assert not called


def test_ensure_for_espeak_engine_triggers_install(monkeypatch):
    from backend.services import espeak_assets

    called = []
    monkeypatch.setattr(espeak_assets, "ensure_espeak_installed", lambda: called.append(1) or True)
    assert espeak_assets.ensure_espeak_for_engine("kokoro") is True
    assert espeak_assets.ensure_espeak_for_engine("piper_tts") is True
    assert espeak_assets.ensure_espeak_for_engine("inflect_v2") is True
    assert espeak_assets.ensure_espeak_for_engine("kitten_tts") is True
    assert called == [1, 1, 1, 1]


def test_session_opts_empty_when_not_installed(fake_install):
    espeak_assets, _ = fake_install
    assert espeak_assets.espeak_session_opts("piper_tts") == []


def test_session_opts_paths_when_installed(fake_install):
    espeak_assets, tmp_path = fake_install
    (tmp_path / "espeak-ng-data").mkdir(parents=True)
    (tmp_path / "espeak-ng-data" / "phontab").write_bytes(b"phontab")
    (tmp_path / "espeak-ng.dll").write_bytes(b"fake")
    opts = espeak_assets.espeak_session_opts("piper_tts")
    assert opts[0] == "--session-option"
    assert opts[1] == f"piper_tts.espeak_library_path={tmp_path / 'espeak-ng.dll'}"
    assert opts[2] == "--session-option"
    assert opts[3] == f"piper_tts.espeak_data_path={tmp_path / 'espeak-ng-data'}"


def test_is_installed_requires_dll_and_populated_data(fake_install):
    espeak_assets, tmp_path = fake_install
    assert not espeak_assets.is_espeak_installed()
    (tmp_path / "espeak-ng.dll").write_bytes(b"fake")
    assert not espeak_assets.is_espeak_installed()  # no data dir yet
    (tmp_path / "espeak-ng-data").mkdir(parents=True)
    assert not espeak_assets.is_espeak_installed()  # empty data dir
    (tmp_path / "espeak-ng-data" / "phontab").write_bytes(b"phontab")
    assert espeak_assets.is_espeak_installed()


def test_ensure_installed_is_idempotent_without_network(fake_install):
    espeak_assets, tmp_path = fake_install
    (tmp_path / "espeak-ng.dll").write_bytes(b"fake")
    (tmp_path / "espeak-ng-data").mkdir(parents=True)
    (tmp_path / "espeak-ng-data" / "phontab").write_bytes(b"phontab")

    def boom(*args, **kwargs):
        raise AssertionError("network must not be touched when assets are present")

    import urllib.request

    original = urllib.request.urlopen
    urllib.request.urlopen = boom
    try:
        assert espeak_assets.ensure_espeak_installed() is True
    finally:
        urllib.request.urlopen = original


def test_download_rejects_bad_checksum(tmp_path, monkeypatch):
    from backend.services import espeak_assets

    class FakeResp:
        def __init__(self, payload: bytes):
            self._payload = payload

        def read(self, n):
            chunk, self._payload = self._payload[:n], self._payload[n:]
            return chunk

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    payload = b"not-a-real-wheel-but-works-for-sha-check"
    monkeypatch.setattr(
        "urllib.request.urlopen",
        lambda *a, **kw: FakeResp(payload),
    )
    dest = tmp_path / "wheel.whl"
    with pytest.raises(RuntimeError, match="SHA-256 mismatch"):
        espeak_assets._download_with_sha256(
            "https://example.com/espeak.whl",
            "0" * 64,
            len(payload),
            dest,
        )
    assert not dest.exists()
    assert not (tmp_path / "wheel.whl.part").exists()
