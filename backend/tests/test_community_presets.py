"""Tests for the community presets routes."""

import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routes.community_presets import router as presets_router

_BACKEND_ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(presets_router)
    return TestClient(app)


class TestCommunityPresetsEndpoints:
    def test_list_presets_returns_all(self, client):
        resp = client.get("/community-presets")
        assert resp.status_code == 200
        presets = resp.json()
        assert isinstance(presets, list)
        assert len(presets) >= 1

    def test_list_presets_filters_by_category(self, client):
        resp = client.get("/community-presets?category=Vocal")
        assert resp.status_code == 200
        presets = resp.json()
        assert isinstance(presets, list)
        for p in presets:
            assert p.get("category") == "Vocal"

    def test_list_presets_filters_by_search(self, client):
        resp = client.get("/community-presets?search=warm")
        assert resp.status_code == 200
        presets = resp.json()
        assert isinstance(presets, list)
        for p in presets:
            text = f"{p.get('name', '')} {p.get('description', '')} {' '.join(p.get('tags', []))}".lower()
            assert "warm" in text

    def test_list_presets_combined_filters(self, client):
        resp = client.get("/community-presets?category=Vocal&search=warm")
        assert resp.status_code == 200
        presets = resp.json()
        assert isinstance(presets, list)
        for p in presets:
            assert p.get("category") == "Vocal"
            text = f"{p.get('name', '')} {p.get('description', '')} {' '.join(p.get('tags', []))}".lower()
            assert "warm" in text

    def test_list_categories_returns_sorted_unique(self, client):
        resp = client.get("/community-presets/categories")
        assert resp.status_code == 200
        categories = resp.json()
        assert isinstance(categories, list)
        assert len(categories) >= 1
        # Check sorted
        assert categories == sorted(categories)

    def test_presets_json_is_valid(self):
        path = _BACKEND_ROOT / "data" / "community_presets.json"
        assert path.exists()
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        assert set(data) == {"version", "presets"}
        assert data["version"] == 1
        assert isinstance(data["presets"], list)
        assert len(data["presets"]) >= 1
        # Check structure of a preset
        preset = data["presets"][0]
        required = {"id", "name", "description", "author", "category", "tags", "effects_chain", "is_featured"}
        assert set(preset.keys()) == required
        assert isinstance(preset["effects_chain"], list)
        assert isinstance(preset["tags"], list)
