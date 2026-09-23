"""LLM size-id unification guard.

Regression test for the catalog<->backend ID drift: the GGUF backend table,
every pydantic pattern, the DB defaults, and the size-label tiers must all
agree with ``backends.configs.llm`` (the single source of truth).
"""

import re

from backend.backends.configs.llm import (
    DEFAULT_PLANNER_SIZE,
    LEGACY_PLANNER_SIZE_ALIASES,
    _get_gguf_llm_configs,
    planner_size_pattern,
    resolve_planner_size,
)
from backend.backends.gguf_server_backend import _gguf_models
from backend.utils.llm_context import _SIZE_RAM_TIERS, _resolve_size_label

CATALOG_SIZES = [c.model_size for c in _get_gguf_llm_configs() if c.model_size]


def test_backend_table_matches_catalog():
    table = _gguf_models()
    assert set(table) == set(CATALOG_SIZES)
    for size, (repo, quant, _moe) in table.items():
        cfg = next(c for c in _get_gguf_llm_configs() if c.model_size == size)
        assert repo == cfg.hf_repo_id
        assert quant == cfg.quant


def test_default_is_catalog_first_planner():
    assert CATALOG_SIZES[0] == DEFAULT_PLANNER_SIZE


def test_legacy_aliases_resolve():
    for legacy, current in LEGACY_PLANNER_SIZE_ALIASES.items():
        assert resolve_planner_size(legacy) == current
        assert current in CATALOG_SIZES
    assert resolve_planner_size(None) == DEFAULT_PLANNER_SIZE
    assert resolve_planner_size(CATALOG_SIZES[0]) == CATALOG_SIZES[0]


def test_pattern_accepts_catalog_legacy_and_cloud():
    pattern = planner_size_pattern()
    for size in CATALOG_SIZES + list(LEGACY_PLANNER_SIZE_ALIASES) + ["cloud"]:
        assert re.match(pattern, size), size
    assert not re.match(pattern, "not-a-model")


def test_every_catalog_size_resolves_to_known_tier():
    for size in CATALOG_SIZES:
        label = _resolve_size_label(size)
        assert label in _SIZE_RAM_TIERS, (size, label)


def test_db_defaults_match_catalog_default():
    from backend.database.settings import AssistantSettings, CaptureSettings

    assert AssistantSettings.__table__.c.model_size.default.arg == DEFAULT_PLANNER_SIZE
    assert CaptureSettings.__table__.c.llm_model.default.arg == DEFAULT_PLANNER_SIZE
