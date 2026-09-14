"""Tests for generation history deletion (single + clear-failed).

Regression coverage for "deleting past generations does nothing":
- deleting a generation whose audio file is already gone still removes the row
- deleting a generation referenced by audiobook chapters/utterances succeeds
  (those FKs lack cascade; with foreign_keys=ON the row delete would 500)
- DELETE /history/failed removes failed rows
"""

import os
import tempfile

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from backend.database import (
    Audiobook,
    AudiobookChapter,
    AudiobookUtterance,
    Base,
    Generation as DBGeneration,
    VoiceProfile as DBVoiceProfile,
    get_db,
)
from backend.routes.history import router


def _client():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    engine = create_engine(f"sqlite:///{path}", connect_args={"check_same_thread": False})

    # Mirror production (database/session.py): enforce FKs so the audiobook
    # reference case actually exercises the guard.
    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _record):
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    app = FastAPI()
    app.include_router(router)

    def _override_get_db():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    client = TestClient(app)
    return client, SessionLocal


def _make_generation(db, status="completed", audio_path=None):
    if db.query(DBVoiceProfile).filter_by(id="prof-1").first() is None:
        db.add(DBVoiceProfile(id="prof-1", name="Test Voice"))
        db.commit()
    gen = DBGeneration(
        id=f"gen-{status}-{os.urandom(4).hex()}",
        profile_id="prof-1",
        text="hello world",
        audio_path=audio_path,
        status=status,
    )
    db.add(gen)
    db.commit()
    return gen.id


def test_delete_generation_with_missing_audio_file():
    client, SessionLocal = _client()
    db = SessionLocal()
    gid = _make_generation(db, audio_path="generations/does-not-exist.wav")
    db.close()

    res = client.delete(f"/history/{gid}")
    assert res.status_code == 200, res.text

    db = SessionLocal()
    assert db.query(DBGeneration).filter_by(id=gid).first() is None
    db.close()


def test_delete_generation_referenced_by_audiobook():
    client, SessionLocal = _client()
    db = SessionLocal()
    gid = _make_generation(db)
    book = Audiobook(id="book-1", title="Test Book")
    db.add(book)
    db.flush()
    chapter = AudiobookChapter(
        id="ch-1", audiobook_id="book-1", order_index=0, title="Ch 1", text="hi", generation_id=gid
    )
    utterance = AudiobookUtterance(
        id="utt-1",
        chapter_id="ch-1",
        audiobook_id="book-1",
        order_index=0,
        generation_id=gid,
    )
    db.add(chapter)
    db.add(utterance)
    db.commit()
    db.close()

    res = client.delete(f"/history/{gid}")
    assert res.status_code == 200, res.text

    db = SessionLocal()
    assert db.query(DBGeneration).filter_by(id=gid).first() is None
    assert db.query(AudiobookChapter).filter_by(id="ch-1").first() is not None
    assert db.query(AudiobookChapter).filter_by(id="ch-1").first().generation_id is None
    assert db.query(AudiobookUtterance).filter_by(id="utt-1").first().generation_id is None
    db.close()


def test_delete_unknown_generation_is_404():
    client, _ = _client()
    res = client.delete("/history/no-such-id")
    assert res.status_code == 404


def test_clear_failed_generations():
    client, SessionLocal = _client()
    db = SessionLocal()
    _make_generation(db, status="failed")
    _make_generation(db, status="completed")
    db.close()

    res = client.delete("/history/failed")
    assert res.status_code == 200
    assert res.json()["deleted"] == 1

    db = SessionLocal()
    remaining = db.query(DBGeneration).all()
    assert len(remaining) == 1
    assert remaining[0].status == "completed"
    db.close()
