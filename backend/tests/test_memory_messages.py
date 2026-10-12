"""Message edit/delete/branch persistence backing the assistant chat."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import backend.services.memory as mem_service
from backend.database import Base


@pytest.fixture
def db(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    monkeypatch.setattr("backend.database.session.SessionLocal", sessionmaker(bind=engine))


def _seed(conv_id="conv-1"):
    conv = mem_service.create_conversation(agent_type="assistant")
    first = mem_service.add_message(conv.id, "user", "hello")
    second = mem_service.add_message(conv.id, "assistant", "hi there")
    third = mem_service.add_message(conv.id, "user", "again")
    return conv, first, second, third


def test_history_exposes_ids(db):
    conv, first, second, third = _seed()
    rows = mem_service.get_history(conv.id)
    assert [r["id"] for r in rows] == [first.id, second.id, third.id]
    assert rows[0]["content"] == "hello"


def test_update_message_round_trip(db):
    conv, first, *_ = _seed()
    assert mem_service.update_message(first.id, "hello edited") is True
    rows = mem_service.get_history(conv.id)
    assert rows[0]["content"] == "hello edited"
    assert mem_service.update_message("missing-id", "x") is False


def test_delete_message_removes_and_recounts(db):
    conv, first, second, _third = _seed()
    assert mem_service.delete_message(second.id) is True
    rows = mem_service.get_history(conv.id)
    assert [r["id"] for r in rows] == [first.id, _third.id]
    assert mem_service.delete_message("missing-id") is False


def test_delete_messages_after_branches(db):
    conv, first, _second, _third = _seed()
    assert mem_service.delete_messages_after(conv.id, first.id) == 2
    rows = mem_service.get_history(conv.id)
    assert [r["id"] for r in rows] == [first.id]
    assert mem_service.delete_messages_after(conv.id, "missing-id") == -1
    # Branching at the tip deletes nothing but still succeeds.
    assert mem_service.delete_messages_after(conv.id, first.id) == 0
