import pytest

from backend.backends.configs.llm import DEFAULT_PLANNER_SIZE, get_planner_configs
from backend.services.settings import select_llm_model_size


def test_requested_model_kept_when_ram_fits():
    assert select_llm_model_size(DEFAULT_PLANNER_SIZE, available_mb=8000) == DEFAULT_PLANNER_SIZE


def test_low_ram_falls_back_to_smallest_fitting_planner():
    # Current catalog: the default planner IS the smallest (min_ram_mb=1800).
    # 1.9 GB therefore keeps it. The fallback path itself is exercised by
    # requesting a bigger planner with RAM that only fits the default.
    selected = select_llm_model_size("27B-PTQ1_0", available_mb=1900)
    assert selected == DEFAULT_PLANNER_SIZE
    cfg = next(c for c in get_planner_configs() if c.model_size == selected)
    assert cfg.min_ram_mb <= 1900


def test_low_ram_raises_when_nothing_fits():
    with pytest.raises(ValueError, match="Not enough available RAM"):
        select_llm_model_size(DEFAULT_PLANNER_SIZE, available_mb=10)


def test_unknown_or_cloud_request_is_not_replaced(monkeypatch):
    monkeypatch.setattr("backend.services.settings.get_available_ram_mb", lambda: 10)
    assert select_llm_model_size("cloud") == "cloud"
    assert select_llm_model_size("not-a-model") == "not-a-model"
