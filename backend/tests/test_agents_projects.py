"""Tests for the vendored agent-project workspace service."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import config
from backend.agents import plans as plan_service, projects as project_service
from backend.database import Base


def _make_session(tmp_path):
    config.set_data_dir(tmp_path / "data")
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    SessionLocal = sessionmaker(bind=engine)
    return SessionLocal()


@pytest.fixture
def db(tmp_path):
    session = _make_session(tmp_path)
    try:
        yield session
    finally:
        session.close()


def test_create_and_get(db):
    p = project_service.create_project(db, name="Alpha", description="demo")
    assert p.name == "Alpha"
    got = project_service.get_project(db, p.id)
    assert got.id == p.id


def test_paths_created(db):
    p = project_service.create_project(db, name="Paths")
    paths = project_service.create_project_paths(p.id).to_dict()
    assert paths["memory_dir"].endswith("memory")
    assert paths["plans_dir"].endswith("plans")


def test_duplicate_name_rejected(db):
    project_service.create_project(db, name="Dup")
    with pytest.raises(ValueError):
        project_service.create_project(db, name="Dup")


def test_sources_and_context(db):
    p = project_service.create_project(db, name="Ctx")
    project_service.add_source(db, p.id, name="site", source_type="url", url="https://example.com/x")
    sources = project_service.list_sources(db, p.id)
    assert len(sources) == 1

    ctx = project_service.build_project_context(db, p.id)
    assert ctx.project_id == p.id
    assert any(p.id in root for root in ctx.roots)


def test_delete(db):
    p = project_service.create_project(db, name="Del")
    project_service.delete_project(db, p.id)
    with pytest.raises(KeyError):
        project_service.get_project(db, p.id)


def test_plan_lifecycle(db):
    p = project_service.create_project(db, name="PlanProj")
    plan = plan_service.write_plan(db, p.id, title="T", steps=["a", "b"], status="planned")
    assert plan["id"]

    plans = plan_service.list_plans(p.id)
    assert len(plans) == 1

    got = plan_service.get_plan(p.id, plan["id"])
    assert got["title"] == "T"
    assert len(got["steps"]) == 2

    updated = plan_service.update_plan_status(p.id, plan["id"], "done")
    assert updated["status"] == "done"

    plan_service.delete_plan(p.id, plan["id"])
    with pytest.raises(KeyError):
        plan_service.get_plan(p.id, plan["id"])
