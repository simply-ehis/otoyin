"""Tests for the vendored asset-acquisition module (SSRF + containment)."""

import httpx
import pytest

from backend import config
from backend.agents.acquire import manager as acquire_manager
from backend.agents.acquire.manager import acquire_asset


@pytest.fixture(autouse=True)
def _restore_data_dir():
    # set_data_dir swaps the process-global data dir; restore it so the rest of
    # the suite (e.g. sidecar lookup under data/bin/) does not see a tmp root.
    original = config.get_data_dir()
    yield
    config.set_data_dir(original)


class _FakeResp:
    def __init__(self, content=b"data", status=200, headers=None):
        self.status_code = status
        self.headers = headers or {}
        self._content = content

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("bad", request=None, response=self)

    def iter_bytes(self):
        yield self._content


def _patch_get(monkeypatch, content=b"hello-asset"):
    def fake_get(url, **kwargs):
        return _FakeResp(content=content)

    monkeypatch.setattr(acquire_manager.httpx, "get", fake_get)


def test_freesound_ssrf_blocked(tmp_path):
    config.set_data_dir(tmp_path / "data")
    with pytest.raises(ValueError):
        acquire_asset("freesound", url="http://169.254.169.254/secret")


def test_polyhaven_ssrf_blocked(tmp_path):
    config.set_data_dir(tmp_path / "data")
    with pytest.raises(ValueError):
        acquire_asset("polyhaven", url="https://evil.example.com/x")


def test_unknown_source_rejected(tmp_path):
    config.set_data_dir(tmp_path / "data")
    with pytest.raises(ValueError):
        acquire_asset("notreal", url="https://freesound.org/x")


def test_search_assets_maps_params(monkeypatch):
    """search_assets must map limit/asset_type to the per-source signatures."""
    import backend.agents.acquire.manager as m
    import backend.agents.acquire.polyhaven as ph

    captured: dict = {}

    def fake_sounds(query, page_size=20):
        captured["f"] = (query, page_size)
        return {"results": []}

    def fake_poly(query, asset_type="all", limit=20):
        captured["p"] = (query, asset_type, limit)
        return []

    monkeypatch.setattr("backend.services.freesound.search_sounds", fake_sounds)
    monkeypatch.setattr(ph, "search", fake_poly)

    m.search_assets("freesound", "dog", limit=5, asset_type="all")
    assert captured["f"] == ("dog", 5)

    m.search_assets("polyhaven", "rock", limit=7, asset_type="hdri")
    assert captured["p"] == ("rock", "hdri", 7)


def test_acquire_writes_inside_assets_dir(tmp_path, monkeypatch):
    config.set_data_dir(tmp_path / "data")
    _patch_get(monkeypatch, content=b"asset-bytes")
    record = acquire_asset("freesound", url="https://cdn.freesound.org/foo/sample.wav")
    assert record["source"] == "freesound"
    local = config.resolve_storage_path(record["local_path"])
    assert local is not None
    assert local.exists()
    assert local.read_bytes() == b"asset-bytes"
    # Confined to the assets directory, never escapes it.
    assert config.get_assets_dir() in local.parents


def test_acquire_rejects_path_traversal_filename(tmp_path, monkeypatch):
    config.set_data_dir(tmp_path / "data")
    _patch_get(monkeypatch, content=b"x")
    # Even with a sneaky filename, the dest is forced under assets dir.
    record = acquire_asset("freesound", url="https://cdn.freesound.org/a/b.wav", filename="../escape.wav")
    local = config.resolve_storage_path(record["local_path"])
    assert config.get_assets_dir() in local.parents
    assert ".." not in local.parts
