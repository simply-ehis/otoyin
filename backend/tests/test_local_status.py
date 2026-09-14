"""Tests for the catalog ``local_status`` annotation (06 report §3).

Hermetic: uses a temp-file SQLite DB (same pattern as test_model_gate.py);
no real models, torch, or network required. The HTTP-level section boots the
marketplace router through FastAPI's TestClient with a seeded manifest DB (a
"cached engine") and confirms the ``/marketplace/catalog`` ``local_status``
values match exactly what the Store UI renders from.
"""

from __future__ import annotations

import os
import tempfile

import pytest


def _make_session_factory():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from backend.database.models import Base, ModelDownload

    fd, path = tempfile.mkstemp(suffix=".status_test.db")
    os.close(fd)
    eng = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(eng, tables=[ModelDownload.__table__], checkfirst=True)
    return sessionmaker(bind=eng)


def test_not_downloaded_when_no_manifest():
    """No DB / no manifest row -> not_downloaded (safe direction)."""
    from backend.services.model_registry import local_status_for

    assert local_status_for("kokoro-onnx") == "not_downloaded"
    assert local_status_for("whisper-large-v3-turbo") == "not_downloaded"


def test_cached_when_manifest_row_exists(monkeypatch):
    """A real manifest row (seeded via record_download) -> cached."""
    import backend.services.model_registry as mr

    sess = _make_session_factory()
    monkeypatch.setattr(mr, "SessionLocal", sess)

    from backend.backends import get_model_config

    cfg = get_model_config("kokoro-onnx")
    assert cfg is not None, "kokoro-onnx must resolve to a model config"
    mr.record_download(
        sess(),
        cfg.model_name,
        cfg.model_size,
        cfg.engine,
        None,
        None,
    )
    assert mr.local_status_for("kokoro-onnx") == "cached"


def test_no_config_product_is_cached(monkeypatch):
    """Products with no model config ship with the app -> cached."""
    import backend.backends as backends
    import backend.services.model_registry as mr

    monkeypatch.setattr(backends, "get_model_config", lambda name: None)
    assert mr.local_status_for("future-non-model-product") == "cached"


def test_db_failure_falls_back_safe(monkeypatch):
    """Any DB error falls back to not_downloaded, never a wrong 'cached'."""
    import backend.services.model_registry as mr

    def _boom(*_args, **_kwargs):
        raise RuntimeError("db not initialized")

    monkeypatch.setattr(mr, "is_downloaded", _boom)
    assert mr.local_status_for("kokoro-onnx") == "not_downloaded"


def test_size_resolution_uses_config(monkeypatch):
    """Without an explicit size, the helper resolves it from the config so
    sized manifest rows match (bare is_downloaded(name, None) would miss)."""
    import backend.services.model_registry as mr

    sess = _make_session_factory()
    monkeypatch.setattr(mr, "SessionLocal", sess)

    from backend.backends import get_model_config

    cfg = get_model_config("whisper-large-v3-turbo")
    assert cfg is not None and cfg.model_size is not None
    mr.record_download(
        sess(),
        cfg.model_name,
        cfg.model_size,
        cfg.engine,
        None,
        None,
    )
    assert mr.local_status_for("whisper-large-v3-turbo") == "cached"


def test_catalog_annotation_covers_every_product():
    """Every product gets a valid local_status; signature verifies before
    the annotation is applied (response-only enrichment)."""
    from backend.routes.marketplace import _annotate_local_status
    from backend.services.marketplace_catalog import build_catalog, verify_catalog

    catalog = build_catalog()
    assert verify_catalog(catalog), "catalog must self-verify before annotation"
    products = catalog.get("products", [])
    assert len(products) > 0

    _annotate_local_status(products)
    for product in products:
        assert product.get("local_status") in (
            "cached",
            "not_downloaded",
        ), product.get("id")


# ── HTTP level: /marketplace/catalog with a cached engine ────────────────


@pytest.fixture
def catalog_client(monkeypatch):
    """Boot the marketplace router with one cached engine (kokoro-onnx).

    Simulates a real install after ``reconcile_downloads()`` backfilled the
    manifest: a temp-file SQLite DB holds the engine's manifest row, and the
    router is served through FastAPI's TestClient exactly as production
    mounts it. No real models, torch, or network required.
    """
    import backend.services.model_registry as mr

    sess = _make_session_factory()
    monkeypatch.setattr(mr, "SessionLocal", sess)

    from backend.backends import get_model_config

    cfg = get_model_config("kokoro-onnx")
    assert cfg is not None, "kokoro-onnx must resolve to a model config"
    mr.record_download(
        sess(),
        cfg.model_name,
        cfg.model_size,
        cfg.engine,
        None,
        None,
    )

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from backend.routes.marketplace import router

    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def _catalog_products_by_id(client) -> dict[str, dict]:
    """GET /marketplace/catalog and index the annotated products by id."""
    resp = client.get("/marketplace/catalog")
    assert resp.status_code == 200
    return {p["id"]: p for p in resp.json()["products"]}


def test_catalog_http_marks_seeded_engine_cached(catalog_client):
    """A cached engine (manifest row) reports ``cached`` over HTTP."""
    products = _catalog_products_by_id(catalog_client)
    assert products["kokoro-onnx"]["local_status"] == "cached"


def test_catalog_http_marks_other_models_not_downloaded(catalog_client):
    """Only the seeded engine is cached; every other model needs a download
    while non-model products (ships with the app) stay cached."""
    from backend.backends import get_model_config

    products = _catalog_products_by_id(catalog_client)
    for pid, product in products.items():
        if pid == "kokoro-onnx":
            assert product["local_status"] == "cached"
        elif get_model_config(pid) is not None:
            # A real model with no manifest row: needs download.
            assert product["local_status"] == "not_downloaded", pid
        else:
            # Non-model product — ships with the app by definition.
            assert product["local_status"] == "cached", pid


def test_catalog_http_values_match_store_ui_render_contract(catalog_client):
    """The annotation is exactly what the Store UI renders its chips from.

    StoreProductCard/StoreDetailModal derive the per-product state as
    ``cached = installed || local_status === "cached"`` and render:

      - ``"cached"``          -> green "Installed" chip + Activate button
      - ``"not_downloaded"``  -> needs download: info "Owned" chip + Install
                                  when licensed (owned), price/"Free" chip
                                  + Buy/Download otherwise

    So the contract over the HTTP response is: every value lies in the TS
    union type ``"cached" | "not_downloaded"`` (anything else would be a
    silent UI fall-through), the annotation agrees product-for-product with
    the manifest row state the live ``installed`` signal reads (the UI
    comment's "they never contradict each other"), and the seeded engine is
    the only product that would render the Installed state.
    """
    import backend.services.model_registry as mr
    from backend.backends import get_model_config

    products = _catalog_products_by_id(catalog_client)

    # 1. Every value is in the UI's union type — nothing renders by fall-through.
    for pid, product in products.items():
        assert product["local_status"] in ("cached", "not_downloaded"), pid

    # 2. ``cached`` annotation == manifest row state (the ``installed`` signal
    #    both the UI and the annotation read; they never contradict).
    sess = mr.SessionLocal
    for pid, product in products.items():
        cfg = get_model_config(pid)
        manifest_cached = mr.is_downloaded(pid, cfg.model_size if cfg is not None else None, db=sess())
        expect_cached = manifest_cached or cfg is None
        assert (product["local_status"] == "cached") == expect_cached, pid

    # 3. With no licenses installed (owned = empty set), exactly the seeded
    #    engine renders Installed; every other model renders a needs-download
    #    state — price chip + Buy for paid, "Free" chip + Download otherwise.
    assert products["kokoro-onnx"]["local_status"] == "cached"
    needs_download = [p for p in products.values() if p["local_status"] == "not_downloaded"]
    assert needs_download, "at least one model must be not_downloaded"
    assert any(p["paid"] for p in needs_download)
    assert any(not p["paid"] for p in needs_download)


# ── HTTP level: catalog x models/status cross-route consistency ──────


def _hermetic_physical_checks(monkeypatch) -> None:
    """Neuter the physical-presence checks so ``downloaded`` reflects only
    what the test stages — the manifest stays the single variable."""
    import backend.routes.models.status as status_mod

    monkeypatch.setattr(status_mod, "_check_whisper_downloaded", lambda config: (False, None))
    monkeypatch.setattr(status_mod, "_check_steam_audio_downloaded", lambda: (False, None))
    monkeypatch.setattr(status_mod, "_check_hf_cache_repo", lambda *a, **k: (False, None))
    monkeypatch.setattr(status_mod, "_check_filesystem_cache", lambda *a, **k: (False, None))


def _seed_manifest(monkeypatch, product_ids: list[str]) -> None:
    """Seed one manifest row (a cached engine) per product id."""
    import backend.services.model_registry as mr

    sess = _make_session_factory()
    monkeypatch.setattr(mr, "SessionLocal", sess)

    from backend.backends import get_model_config

    for pid in product_ids:
        cfg = get_model_config(pid)
        assert cfg is not None, f"{pid} must resolve to a model config"
        mr.record_download(sess(), cfg.model_name, cfg.model_size, cfg.engine, None, None)


@pytest.fixture
def dual_client(monkeypatch):
    """One FastAPI app serving BOTH surfaces the Store reads together —
    the marketplace catalog and /models/status — with a seeded manifest
    (two cached engines: kokoro-onnx, whisper-tiny-en) and hermetic
    physical checks. No real models, torch, or network required."""
    import backend.routes.models.status as status_mod
    import backend.utils.model_status as ums

    _seed_manifest(monkeypatch, ["kokoro-onnx", "whisper-tiny-en"])
    _hermetic_physical_checks(monkeypatch)
    # The manifest backfill consults the utils-level disk check (a different
    # function from the route's checks above) — neuter it too, so the real
    # machine's HF cache can never leak rows into the test manifest.
    monkeypatch.setattr(ums, "is_model_downloaded", lambda _name: False)
    monkeypatch.setattr(status_mod, "_CACHE_TTL_SEC", 0.0)
    monkeypatch.setattr(status_mod, "_status_cache", None)  # drop stale cache
    monkeypatch.setattr(status_mod, "_scan_cache", None)  # from other tests

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from backend.routes import marketplace
    from backend.routes.models import status as status_route

    app = FastAPI()
    app.include_router(marketplace.router)
    app.include_router(status_route.router)
    return TestClient(app)


def _fetch_surfaces(client) -> tuple[dict[str, dict], dict[str, dict]]:
    """GET both routes and index: catalog products by id, model status by
    model_name (exactly how the UI keys them together)."""
    cat = client.get("/marketplace/catalog")
    assert cat.status_code == 200
    st = client.get("/models/status")
    assert st.status_code == 200
    products = {p["id"]: p for p in cat.json()["products"]}
    statuses = {m["model_name"]: m for m in st.json()["models"]}
    return products, statuses


def _ui_cached(product: dict, status: dict) -> bool:
    """Exact mirror of the Store UI's derivation (StoreProductCard /
    StoreDetailModal): ``installed || local_status === "cached"``, where
    ``installed`` is /models/status ``downloaded``."""
    return bool(status["downloaded"]) or product["local_status"] == "cached"


def test_routes_never_contradict_on_shared_signal(dual_client):
    """For every catalog product, the two routes agree on the one signal
    they both read — the manifest row: catalog ``local_status ==
    "cached"`` ⇔ /models/status ``entitled``. Any disagreement here would
    render contradictory product states in the Store."""
    import backend.services.model_registry as mr
    from backend.backends import get_model_config

    products, statuses = _fetch_surfaces(dual_client)
    for pid, product in products.items():
        assert pid in statuses, f"catalog product {pid} missing from /models/status"
        cfg = get_model_config(pid)
        assert cfg is not None, "fixture assumption: catalog products are models"
        manifest_cached = mr.is_downloaded(pid, cfg.model_size, db=mr.SessionLocal())
        assert product["local_status"] == ("cached" if manifest_cached else "not_downloaded"), pid
        assert statuses[pid]["entitled"] is manifest_cached, pid


def test_ui_derivation_matches_manifest_truth(dual_client):
    """The UI's ``installed || cached`` union, computed over the two HTTP
    responses, equals the manifest state for every product — with no
    licenses installed, exactly the seeded engines render Installed."""
    products, statuses = _fetch_surfaces(dual_client)
    cached_ids = {pid for pid, p in products.items() if _ui_cached(p, statuses[pid])}
    assert cached_ids == {"kokoro-onnx", "whisper-tiny-en"}
    assert len(products) > len(cached_ids), "rest must render needs-download"


def test_whisper_divergence_is_hidden_by_the_union(dual_client):
    """whisper-tiny-en: physical file absent (downloaded=False) but the
    manifest row exists (entitled=True, local_status=cached). The two
    routes' raw signals differ here BY DESIGN; the UI union still renders
    Installed and never contradicts."""
    products, statuses = _fetch_surfaces(dual_client)
    product, status = products["whisper-tiny-en"], statuses["whisper-tiny-en"]
    assert status["downloaded"] is False  # physical: absent
    assert status["entitled"] is True  # manifest: present
    assert product["local_status"] == "cached"  # manifest: present
    assert _ui_cached(product, status) is True  # union: Installed


def test_physical_only_model_still_renders_consistently(dual_client, monkeypatch):
    """A model physically present WITHOUT a manifest row (the pre-reconcile
    state): installed=True but entitled=False and local_status=
    not_downloaded. The UI union renders Installed via ``installed``
    (physical presence is sufficient to generate) while the catalog keeps
    needs-download until reconcile_downloads() backfills the row — both
    surfaces stay renderable without contradicting each other."""
    import backend.routes.models.status as status_mod

    def _only_kitten(hf_repo_id, model_name):
        return (True, 123.4) if model_name == "kitten-tts-mini" else (False, None)

    monkeypatch.setattr(status_mod, "_check_filesystem_cache", _only_kitten)
    products, statuses = _fetch_surfaces(dual_client)
    product, status = products["kitten-tts-mini"], statuses["kitten-tts-mini"]
    assert status["downloaded"] is True
    assert status["entitled"] is False
    assert product["local_status"] == "not_downloaded"
    assert _ui_cached(product, status) is True  # union fires via installed


def test_manifest_flip_keeps_routes_in_agreement(dual_client):
    """Forgetting the manifest row flips BOTH routes together: the catalog
    drops to needs-download exactly when /models/status drops entitled —
    the two can never be observed disagreeing, even mid-session."""
    import backend.services.model_registry as mr
    from backend.backends import get_model_config

    products, statuses = _fetch_surfaces(dual_client)
    assert products["kokoro-onnx"]["local_status"] == "cached"
    assert statuses["kokoro-onnx"]["entitled"] is True

    kokoro_size = get_model_config("kokoro-onnx").model_size
    assert mr.forget_download("kokoro-onnx", kokoro_size) is True

    products2, statuses2 = _fetch_surfaces(dual_client)
    assert products2["kokoro-onnx"]["local_status"] == "not_downloaded"
    assert statuses2["kokoro-onnx"]["entitled"] is False


# ── manifest-backfill gap: drift detection, self-heal, /models/status flag ──


# ── manifest drift: physical files without a row are NEVER auto-entitled ──


def test_physical_files_without_manifest_row_stay_unentitled(monkeypatch):
    """Drift is never self-healed: physically present files with no manifest
    row must NOT gain entitlement — auto-recording them would bypass the
    marketplace purchase gate (any copied cache file would become usable).
    Rows are created only by the download endpoint (record_download) or by
    first-launch seeding of an EMPTY manifest (reconcile_downloads)."""
    import backend.services.model_registry as mr
    import backend.utils.model_status as ums

    sess = _make_session_factory()
    monkeypatch.setattr(mr, "SessionLocal", sess)
    # Non-empty manifest (one unrelated row).
    mr.record_download(sess(), "pocket-tts-free", None, "pocket_tts_onnx", None, None)
    monkeypatch.setattr(
        ums,
        "is_model_downloaded",
        lambda name: name == "kokoro-onnx",
    )

    from backend.backends import get_model_config

    cfg = get_model_config("kokoro-onnx")
    assert mr.is_downloaded("kokoro-onnx", cfg.model_size) is False
    assert mr.local_status_for("kokoro-onnx") == "not_downloaded"


def test_reconcile_downloads_seeds_empty_manifest(monkeypatch):
    """First-launch path: with an EMPTY manifest, physically present models
    are recorded as entitled (bundled installs); a second run no-ops."""
    import backend.services.model_registry as mr
    import backend.utils.model_status as ums
    from backend.backends import get_model_config

    sess = _make_session_factory()
    monkeypatch.setattr(mr, "SessionLocal", sess)
    monkeypatch.setattr(ums, "is_model_downloaded", lambda name: name == "kokoro-onnx")

    assert mr.reconcile_downloads() == 1
    cfg = get_model_config("kokoro-onnx")
    assert mr.is_downloaded("kokoro-onnx", cfg.model_size) is True
    assert mr.local_status_for("kokoro-onnx") == "cached"
    assert mr.reconcile_downloads() == 0


def test_reconcile_downloads_noop_when_manifest_nonempty(monkeypatch):
    """With ANY manifest row present, physically present models are left
    alone — seeding runs once, on first launch only."""
    import backend.services.model_registry as mr
    import backend.utils.model_status as ums
    from backend.backends import get_model_config

    sess = _make_session_factory()
    monkeypatch.setattr(mr, "SessionLocal", sess)
    mr.record_download(sess(), "pocket-tts-free", None, "pocket_tts_onnx", None, None)
    monkeypatch.setattr(ums, "is_model_downloaded", lambda name: name == "kokoro-onnx")

    assert mr.reconcile_downloads() == 0
    cfg = get_model_config("kokoro-onnx")
    assert mr.is_downloaded("kokoro-onnx", cfg.model_size) is False


def test_models_status_reports_drift_without_healing(dual_client, monkeypatch):
    """HTTP level, both surfaces: with kokoro physically present but absent
    from the manifest, /models/status reports downloaded=True entitled=False
    and the catalog shows not_downloaded — and a second read is identical.
    Nothing heals the gap behind the scenes (purchase-gate protection)."""
    import backend.routes.models.status as status_mod
    import backend.services.model_registry as mr
    import backend.utils.model_status as ums

    def _only_kitten(hf_repo_id, model_name):
        return (True, 123.4) if model_name == "kitten-tts-mini" else (False, None)

    # Route-level physical checks: only kitten-tts-mini looks present.
    monkeypatch.setattr(status_mod, "_check_filesystem_cache", _only_kitten)
    # utils-level check (what seeding consults): same story.
    monkeypatch.setattr(ums, "is_model_downloaded", lambda name: name == "kitten-tts-mini")

    products, statuses = _fetch_surfaces(dual_client)
    kitten = statuses["kitten-tts-mini"]
    assert kitten["downloaded"] is True
    assert kitten["entitled"] is False
    assert "manifest_backfill_pending" not in kitten
    assert products["kitten-tts-mini"]["local_status"] == "not_downloaded"

    # No row was invented behind the scenes (size-aware lookup).
    from backend.backends import get_model_config as _gmc

    _kitten_cfg = _gmc("kitten-tts-mini")
    assert mr.is_downloaded("kitten-tts-mini", _kitten_cfg.model_size) is False

    # Next read: gap still open on both surfaces — nothing self-healed.
    products2, statuses2 = _fetch_surfaces(dual_client)
    kitten2 = statuses2["kitten-tts-mini"]
    assert kitten2["downloaded"] is True
    assert kitten2["entitled"] is False
    assert products2["kitten-tts-mini"]["local_status"] == "not_downloaded"
