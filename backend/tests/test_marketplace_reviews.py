"""Marketplace review persistence (P4 slice B).

Reviews must survive restarts (SQLite, not process memory), upsert per
device (no ballot-stuffing), validate input, and feed the catalog's
``avg_rating`` / ``review_count`` annotation that grounds the storefront's
quality display in real user feedback.
"""

from __future__ import annotations

import os
import tempfile

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import get_db
from backend.database.base import Base


@pytest.fixture
def client(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".reviews_test.db")
    os.close(fd)
    eng = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(eng)
    factory = sessionmaker(bind=eng)

    # Service layer opens its own sessions via database.session.
    import backend.database.session as session_mod

    monkeypatch.setattr(session_mod, "SessionLocal", factory)

    from backend.routes import marketplace as marketplace_routes

    app = FastAPI()
    app.include_router(marketplace_routes.router)
    app.dependency_overrides[get_db] = lambda: factory()
    return TestClient(app)


def test_post_and_list_round_trip(client):
    assert (
        client.post(
            "/marketplace/product/kokoro-onnx/reviews",
            json={"rating": 5, "comment": "Superb", "device_id": "d1"},
        ).status_code
        == 200
    )
    body = client.get("/marketplace/product/kokoro-onnx/reviews").json()
    assert len(body["reviews"]) == 1
    assert body["reviews"][0]["rating"] == 5
    assert body["reviews"][0]["comment"] == "Superb"


def test_same_device_upserts_instead_of_duplicating(client):
    client.post(
        "/marketplace/product/kokoro-onnx/reviews",
        json={"rating": 2, "comment": "meh", "device_id": "d1"},
    )
    client.post(
        "/marketplace/product/kokoro-onnx/reviews",
        json={"rating": 4, "comment": "grew on me", "device_id": "d1"},
    )
    client.post(
        "/marketplace/product/kokoro-onnx/reviews",
        json={"rating": 5, "comment": "great", "device_id": "d2"},
    )
    reviews = client.get("/marketplace/product/kokoro-onnx/reviews").json()["reviews"]
    assert len(reviews) == 2
    by_device = {r["device_id"]: r for r in reviews}
    assert by_device["d1"]["rating"] == 4
    assert by_device["d1"]["comment"] == "grew on me"


def test_rating_summary_grounds_catalog(client):
    client.post(
        "/marketplace/product/kokoro-onnx/reviews",
        json={"rating": 4, "comment": "", "device_id": "d1"},
    )
    client.post(
        "/marketplace/product/kokoro-onnx/reviews",
        json={"rating": 5, "comment": "", "device_id": "d2"},
    )
    catalog = client.get("/marketplace/catalog").json()
    kokoro = next(p for p in catalog["products"] if p["id"] == "kokoro-onnx")
    assert kokoro["review_count"] == 2
    assert kokoro["avg_rating"] == 4.5
    # Products nobody reviewed carry no summary keys (UI falls back to
    # the curated quality score + "No reviews yet").
    whisper = next(p for p in catalog["products"] if p["id"] == "whisper-tiny-en")
    assert "avg_rating" not in whisper
    assert "review_count" not in whisper


def test_invalid_rating_rejected(client):
    assert (
        client.post(
            "/marketplace/product/kokoro-onnx/reviews",
            json={"rating": 0, "comment": "", "device_id": "d1"},
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/marketplace/product/kokoro-onnx/reviews",
            json={"rating": 6, "comment": "", "device_id": "d1"},
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/marketplace/product/kokoro-onnx/reviews",
            json={"rating": 5, "comment": "x" * 2001, "device_id": "d1"},
        ).status_code
        == 400
    )
