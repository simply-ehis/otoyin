"""Tests for ADR service and routes — guide, takes, scoring, alignment, selection."""

import io
import tempfile
import wave
from pathlib import Path

import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base, get_db
from backend.routes.adr import router as adr_router
from backend.services import adr as adr_svc


def _wav_bytes(rate: int = 16000, duration: float = 0.5, freq: float = 440.0) -> bytes:
    """Generate a short WAV byte payload for tests."""
    t = np.linspace(0, duration, int(rate * duration), endpoint=False)
    audio = (np.sin(2 * np.pi * freq * t) * 16000).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(audio.tobytes())
    return buf.getvalue()


def _make_db():
    """Create an isolated SQLite DB with ADR tables."""
    fd, path = tempfile.mkstemp(suffix=".db")
    import os

    os.close(fd)
    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session(), engine, path


def _cleanup_db(db, engine, path):
    import contextlib

    db.close()
    engine.dispose()
    with contextlib.suppress(OSError):
        Path(path).unlink(missing_ok=True)


def _adr_client(tmp_adr_dir: Path | None = None) -> tuple[TestClient, object, str]:
    """Isolated ADR router with temp DB and temp ADR dir."""
    fd, path = tempfile.mkstemp(suffix=".db")
    import os

    os.close(fd)
    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)

    # temp ADR dir
    if tmp_adr_dir is None:
        tmp_adr_dir = Path(tempfile.mkdtemp(prefix="adr_test_"))

    app = FastAPI()
    app.include_router(adr_router)

    def _override():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override
    # patch get_adr_dir for this app lifetime
    import backend.config as cfg
    import backend.routes.adr as adr_route
    import backend.services.adr as adr_service

    orig_cfg = cfg.get_adr_dir
    orig_route = adr_route.get_adr_dir
    orig_svc = adr_service.get_adr_dir
    cfg.get_adr_dir = lambda: tmp_adr_dir  # type: ignore[assignment]
    adr_route.get_adr_dir = lambda: tmp_adr_dir  # type: ignore[assignment]
    adr_service.get_adr_dir = lambda: tmp_adr_dir  # type: ignore[assignment]

    client = TestClient(app)
    # stash originals for cleanup via client attribute
    client._adr_cleanup = (engine, path, tmp_adr_dir, orig_cfg, orig_route, orig_svc)  # type: ignore[attr-defined]
    return client, Session, path


def _cleanup_client(client: TestClient):
    import contextlib
    import shutil

    engine, path, tmpdir, orig_cfg, orig_route, orig_svc = client._adr_cleanup  # type: ignore[attr-defined]
    engine.dispose()
    with contextlib.suppress(OSError):
        Path(path).unlink(missing_ok=True)
        shutil.rmtree(tmpdir, ignore_errors=True)
    import backend.config as cfg
    import backend.routes.adr as adr_route
    import backend.services.adr as adr_service

    cfg.get_adr_dir = orig_cfg  # type: ignore[assignment]
    adr_route.get_adr_dir = orig_route  # type: ignore[assignment]
    adr_service.get_adr_dir = orig_svc  # type: ignore[assignment]


# ---- Service unit tests ----


def test_create_session_with_lines():
    """create_session persists session and lines with correct indices."""
    db, engine, path = _make_db()
    try:
        sess = adr_svc.create_session(
            db,
            name="Ep01",
            fps=24.0,
            lines=[
                {
                    "original_text": "Hello",
                    "character": "Ava",
                    "target_duration_ms": 1200,
                    "timecode_in": "00:00:01:00",
                },
                {"original_text": "Hi", "character": "Ben"},
            ],
        )
        assert sess.name == "Ep01"
        assert sess.fps == 24.0
        lines = adr_svc.get_lines(db, sess.id)
        assert len(lines) == 2
        assert lines[0].line_index == 0
        assert lines[1].line_index == 1
        assert lines[0].original_text == "Hello"
        assert lines[1].character == "Ben"
    finally:
        _cleanup_db(db, engine, path)


def test_list_and_get_session():
    """list_sessions returns newest first; get_session fetches by id."""
    db, engine, path = _make_db()
    try:
        s1 = adr_svc.create_session(db, name="S1", lines=[])
        s2 = adr_svc.create_session(db, name="S2", lines=[])
        listed = adr_svc.list_sessions(db)
        assert len(listed) >= 2
        fetched = adr_svc.get_session(db, s1.id)
        assert fetched is not None and fetched.name == "S1"
        assert adr_svc.get_session(db, "missing") is None
        # silence unused
        _ = s2
    finally:
        _cleanup_db(db, engine, path)


def test_set_guide_audio():
    """set_guide_audio stores path and duration."""
    db, engine, path = _make_db()
    try:
        sess = adr_svc.create_session(db, name="G", lines=[])
        ok = adr_svc.set_guide_audio(db, sess.id, "/tmp/guide.wav", 1234.5)
        assert ok is True
        fetched = adr_svc.get_session(db, sess.id)
        assert fetched is not None
        assert fetched.guide_duration_ms == 1234.5
        assert adr_svc.set_guide_audio(db, "nope", "/tmp/x", 0) is False
    finally:
        _cleanup_db(db, engine, path)


def test_add_take_increments_number():
    """add_take assigns sequential take_number per line."""
    db, engine, path = _make_db()
    try:
        sess = adr_svc.create_session(db, name="T", lines=[{"original_text": "Hi", "character": "A"}])
        line = adr_svc.get_lines(db, sess.id)[0]
        t1 = adr_svc.add_take(db, line.id, "take1.wav", 500)
        t2 = adr_svc.add_take(db, line.id, "take2.wav", 600)
        assert t1.take_number == 1
        assert t2.take_number == 2
        takes = adr_svc.get_takes(db, line.id)
        assert len(takes) == 2
    finally:
        _cleanup_db(db, engine, path)


def test_add_take_missing_line_raises():
    """add_take raises ValueError for unknown line_id."""
    db, engine, path = _make_db()
    try:
        with pytest.raises(ValueError, match="not found"):
            adr_svc.add_take(db, "nope", "x.wav", 0)
    finally:
        _cleanup_db(db, engine, path)


def test_select_and_delete_take():
    """select_take locks a take; delete_take removes it."""
    db, engine, path = _make_db()
    try:
        sess = adr_svc.create_session(db, name="S", lines=[{"original_text": "Hi", "character": "A"}])
        line = adr_svc.get_lines(db, sess.id)[0]
        t1 = adr_svc.add_take(db, line.id, "t1.wav", 400)
        t2 = adr_svc.add_take(db, line.id, "t2.wav", 400)
        assert adr_svc.select_take(db, line.id, t1.id) is True
        fetched = adr_svc.get_lines(db, sess.id)[0]
        assert fetched.selected_take_id == t1.id
        # select missing line -> False
        assert adr_svc.select_take(db, "nope", t1.id) is False
        assert adr_svc.delete_take(db, t2.id) is True
        assert len(adr_svc.get_takes(db, line.id)) == 1
        assert adr_svc.delete_take(db, "nope") is False
    finally:
        _cleanup_db(db, engine, path)


def test_delete_session():
    """delete_session removes session and returns bool."""
    db, engine, path = _make_db()
    try:
        sess = adr_svc.create_session(db, name="Del", lines=[])
        assert adr_svc.delete_session(db, sess.id) is True
        assert adr_svc.get_session(db, sess.id) is None
        assert adr_svc.delete_session(db, "missing") is False
    finally:
        _cleanup_db(db, engine, path)


def test_score_take_quality_edge_cases():
    """score_take_quality handles empty, silence, clipping, speech."""
    assert adr_svc.score_take_quality([], 24000) == 0.0
    # silence
    assert adr_svc.score_take_quality([0.0] * 480, 24000) == 0.0
    # clipped loud signal → penalty applied but still in [0,1]
    clipped = [1.0] * 480
    s = adr_svc.score_take_quality(clipped, 24000)
    assert 0.0 <= s <= 1.0
    # normal sine → positive score
    sine = np.sin(np.linspace(0, 2 * np.pi * 10, 480)).tolist()
    assert adr_svc.score_take_quality(sine, 24000) > 0.3


def test_auto_select_best_take():
    """auto_select picks highest combined quality+timing score."""
    assert adr_svc.auto_select_best_take([], 0) is None
    takes = [
        {"id": "t1", "duration_ms": 1000, "quality_score": 0.9},
        {"id": "t2", "duration_ms": 1500, "quality_score": 0.8},
        {"id": "t3", "duration_ms": 1000, "quality_score": 0.5},
    ]
    # no target → pure quality
    assert adr_svc.auto_select_best_take(takes, 0) == "t1"
    # target 1500 → t2 wins despite lower quality (timing fit)
    assert adr_svc.auto_select_best_take(takes, 1500) == "t2"
    # target 1000 → t1 beats t3
    assert adr_svc.auto_select_best_take(takes, 1000) == "t1"


def test_calculate_alignment_offset():
    """alignment returns finite ms; empty inputs → 0."""
    assert adr_svc.calculate_alignment_offset([], [], 24000) == 0.0
    assert adr_svc.calculate_alignment_offset([0.1, 0.2], [], 24000) == 0.0
    guide = np.sin(np.linspace(0, 2 * np.pi * 5, 240)).tolist()
    take = guide.copy()
    off = adr_svc.calculate_alignment_offset(guide, take, 24000)
    assert isinstance(off, float)
    # identical signals → ~0 lag
    assert abs(off) < 5.0
    # shifted take → non-zero lag
    shifted = [0.0] * 10 + guide[:-10]
    off2 = adr_svc.calculate_alignment_offset(guide, shifted, 24000)
    assert abs(off2) > 0.1


def test_compute_waveform(tmp_path: Path):
    """compute_waveform returns normalized bars for a real wav."""
    wav = tmp_path / "tone.wav"
    wav.write_bytes(_wav_bytes())
    bars = adr_svc.compute_waveform(str(wav), 50)
    assert len(bars) == 50
    assert all(0.0 <= b <= 1.0 for b in bars)
    assert max(bars) == pytest.approx(1.0)
    # missing file handled via exception in route, not here; test empty handling
    # create empty-like small file fallback is covered by service


# ---- Route integration tests (isolated DB + temp ADR dir) ----


def test_route_create_and_get_session():
    """POST /adr/sessions creates; GET returns lines with takes."""
    client, _, _ = _adr_client()
    try:
        r = client.post(
            "/adr/sessions",
            json={
                "name": "My ADR",
                "fps": 24.0,
                "lines": [{"line_id": "l1", "original_text": "Hello", "character": "Ava"}],
            },
        )
        assert r.status_code == 200
        sid = r.json()["id"]
        g = client.get(f"/adr/sessions/{sid}")
        assert g.status_code == 200
        assert len(g.json()["lines"]) == 1
        assert g.json()["lines"][0]["original_text"] == "Hello"
    finally:
        _cleanup_client(client)


def test_route_guide_upload_and_takes():
    """Guide + take uploads, then select."""
    client, _, _ = _adr_client()
    try:
        r = client.post(
            "/adr/sessions", json={"name": "S", "lines": [{"line_id": "l1", "original_text": "Hi", "character": "A"}]}
        )
        sid = r.json()["id"]
        line_id = client.get(f"/adr/sessions/{sid}").json()["lines"][0]["id"]
        # guide
        gr = client.post(f"/adr/sessions/{sid}/guide", files={"file": ("guide.wav", _wav_bytes(), "audio/wav")})
        assert gr.status_code == 200
        assert gr.json()["duration_ms"] > 0
        # take
        tr = client.post(
            f"/adr/sessions/{sid}/lines/{line_id}/takes", files={"file": ("take.wav", _wav_bytes(), "audio/wav")}
        )
        assert tr.status_code == 200
        take_id = tr.json()["id"]
        # select
        sr = client.post(f"/adr/sessions/{sid}/lines/{line_id}/select/{take_id}")
        assert sr.status_code == 200
        assert sr.json()["selected_take_id"] == take_id
        # verify
        g = client.get(f"/adr/sessions/{sid}").json()
        assert g["lines"][0]["selected_take_id"] == take_id
    finally:
        _cleanup_client(client)


def test_route_score_and_align():
    """POST /adr/score and /adr/align return finite numbers."""
    client, _, _ = _adr_client()
    try:
        sine = np.sin(np.linspace(0, 2 * np.pi * 5, 240)).tolist()
        sr = client.post("/adr/score", json={"line_id": "l1", "audio": sine, "sample_rate": 24000})
        assert sr.status_code == 200
        assert 0.0 <= sr.json()["quality_score"] <= 1.0
        ar = client.post("/adr/align", json={"guide_audio": sine, "take_audio": sine, "sample_rate": 24000})
        assert ar.status_code == 200
        assert isinstance(ar.json()["alignment_offset_ms"], float)
        assert abs(ar.json()["alignment_offset_ms"]) < 5.0
    finally:
        _cleanup_client(client)


def test_route_auto_select():
    """POST /adr/auto-select picks best take and locks it."""
    client, _, _ = _adr_client()
    try:
        r = client.post(
            "/adr/sessions",
            json={
                "name": "S",
                "fps": 24.0,
                "lines": [{"line_id": "l1", "original_text": "Hello", "character": "A", "target_duration_ms": 500}],
            },
        )
        sid = r.json()["id"]
        line_id = client.get(f"/adr/sessions/{sid}").json()["lines"][0]["id"]
        # two takes (durations ~500 vs 1000)
        t1 = client.post(
            f"/adr/sessions/{sid}/lines/{line_id}/takes",
            files={"file": ("a.wav", _wav_bytes(duration=0.5), "audio/wav")},
        ).json()
        t2 = client.post(
            f"/adr/sessions/{sid}/lines/{line_id}/takes",
            files={"file": ("b.wav", _wav_bytes(duration=1.0), "audio/wav")},
        ).json()
        # manually score them via service layer patch: set quality via DB
        # auto-select without quality still picks by timing
        ar = client.post("/adr/auto-select", json={"line_id": line_id})
        assert ar.status_code == 200
        assert ar.json()["selected_take_id"] in {t1["id"], t2["id"]}
        # verify locked
        g = client.get(f"/adr/sessions/{sid}").json()
        assert g["lines"][0]["selected_take_id"] is not None
    finally:
        _cleanup_client(client)


def test_route_waveform_and_audio():
    """Waveform endpoints return bars; audio endpoints return files."""
    client, _, _ = _adr_client()
    try:
        r = client.post(
            "/adr/sessions", json={"name": "S", "lines": [{"line_id": "l1", "original_text": "Hi", "character": "A"}]}
        )
        sid = r.json()["id"]
        line_id = client.get(f"/adr/sessions/{sid}").json()["lines"][0]["id"]
        # upload guide + take
        client.post(f"/adr/sessions/{sid}/guide", files={"file": ("g.wav", _wav_bytes(), "audio/wav")})
        tr = client.post(
            f"/adr/sessions/{sid}/lines/{line_id}/takes", files={"file": ("t.wav", _wav_bytes(), "audio/wav")}
        ).json()
        tid = tr["id"]
        # waveforms
        gw = client.get(f"/adr/sessions/{sid}/guide-waveform")
        assert gw.status_code == 200
        assert len(gw.json()["waveform"]) == 100
        w = client.get(f"/adr/waveform/{tid}")
        assert w.status_code == 200
        assert len(w.json()["waveform"]) == 50
        # audio file responses
        ar = client.get(f"/adr/guide-audio/{sid}")
        assert ar.status_code == 200
        assert ar.headers["content-type"] in {"audio/wav", "audio/x-wav", "audio/wave"}
        tr2 = client.get(f"/adr/audio/{tid}")
        assert tr2.status_code == 200
    finally:
        _cleanup_client(client)


def test_route_404s():
    """404 for missing session/line/take/guide."""
    client, _, _ = _adr_client()
    try:
        assert client.get("/adr/sessions/missing").status_code == 404
        assert client.delete("/adr/sessions/missing").status_code == 404
        assert client.get("/adr/audio/missing").status_code == 404
        assert client.get("/adr/waveform/missing").status_code == 404
        assert client.post("/adr/auto-select", json={"line_id": "missing"}).status_code == 404
        assert (
            client.post("/adr/sessions/missing/guide", files={"file": ("x.wav", _wav_bytes(), "audio/wav")}).status_code
            == 404
        )
    finally:
        _cleanup_client(client)
