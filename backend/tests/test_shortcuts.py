"""Tests for the keyboard shortcuts / keymap routes."""

import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routes.shortcuts import router as shortcuts_router

_BACKEND_ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(shortcuts_router)
    return TestClient(app)


class TestShortcutsEndpoints:
    def test_list_keymaps_returns_default_keymap(self, client):
        resp = client.get("/shortcuts/keymaps")
        assert resp.status_code == 200
        keymaps = resp.json()
        assert isinstance(keymaps, list)
        assert len(keymaps) >= 1
        # Check the default keymap exists
        default = next((k for k in keymaps if k["id"] == "21-labs"), None)
        assert default is not None
        assert default["name"] == "otoyin Default"
        assert isinstance(default["shortcuts"], list)
        assert len(default["shortcuts"]) >= 1

    def test_get_keymap_returns_full_keymap(self, client):
        resp = client.post("/shortcuts/keymap", json={"keymap_id": "21-labs"})
        assert resp.status_code == 200
        data = resp.json()
        assert "keymap" in data
        keymap = data["keymap"]
        assert keymap["id"] == "21-labs"
        assert keymap["name"] == "otoyin Default"
        assert isinstance(keymap["shortcuts"], list)
        assert len(keymap["shortcuts"]) >= 1
        # Check structure of a shortcut
        shortcut = keymap["shortcuts"][0]
        assert set(shortcut.keys()) == {"id", "action", "category", "keys", "description", "enabled"}

    def test_get_keymap_404_for_unknown(self, client):
        resp = client.post("/shortcuts/keymap", json={"keymap_id": "nonexistent"})
        assert resp.status_code == 404

    def test_keymaps_json_is_valid(self):
        path = _BACKEND_ROOT / "data" / "keymaps.json"
        assert path.exists()
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        assert set(data) == {"version", "keymaps"}
        assert data["version"] == 1
        assert isinstance(data["keymaps"], list)
        assert len(data["keymaps"]) >= 1
        default = next((k for k in data["keymaps"] if k["id"] == "21-labs"), None)
        assert default is not None
