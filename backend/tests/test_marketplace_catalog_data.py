"""Bundled marketplace catalog (backend/data/marketplace_catalog.json).

The catalog was externalized from backend/services/marketplace_catalog.py to
the JSON bundle so products are data, not Python literals. These tests pin
the invariants that bundle has to satisfy before the store can ship it:

1. The JSON parses and every product carries the required fields.
2. Product ids are unique (the license gate keys on them).
3. Every bundled product id resolves to a backend model config
   (model_name) - a sellable product with no backend behind it is
   unpurchasable garbage, and the store must never list it.
"""

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
CATALOG = REPO_ROOT / "backend" / "data" / "marketplace_catalog.json"


def test_catalog_file_exists_and_parses():
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    assert isinstance(data, list)
    assert len(data) > 0


def test_every_product_has_required_fields():
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    for i, product in enumerate(data):
        assert isinstance(product, dict), f"product #{i} not an object"
        assert product.get("id"), f"product #{i} missing id"
        assert product.get("name"), f"product #{i} missing name"
        assert product.get("category"), f"product #{i} missing category"
        assert isinstance(product.get("price_usd", None), (int, float)), f"product #{i} bad price_usd"
        assert isinstance(product.get("paid"), bool), f"product #{i} missing paid flag"


def test_product_ids_are_unique():
    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    ids = [p["id"] for p in data]
    assert len(ids) == len(set(ids)), "duplicate product ids"


def test_every_bundled_product_resolves_to_a_backend_config():
    """A paid or free product the Store lists must exist in the backend config
    registry - otherwise the download path can never install it."""
    from backend.backends.configs import get_all_model_configs

    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    configured = {c.model_name for c in get_all_model_configs()}
    unresolved = [p["id"] for p in data if p["id"] not in configured]
    assert not unresolved, f"bundled products with no backend config: {unresolved}"
