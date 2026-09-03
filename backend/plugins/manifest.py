"""otoyin marketplace plugin manifest validation.

The schema contract lives in :file:`manifest_schema.json` (JSON Schema draft
2020-12). This module is the single enforcement point: it loads that file,
validates manifests against it, and verifies the bundled-file checksums a
manifest declares. The same schema file is published at
``https://21labs.app/schemas/plugin-manifest/v1.json`` so the frontend and
third-party tooling validate against the exact same contract.

Expected usage::

    manifest = load_manifest("my-plugin/manifest.json")
    errors = verify_checksums(manifest, "my-plugin")
    if errors:
        raise ValueError(errors)
"""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

import jsonschema

logger = logging.getLogger(__name__)

_SCHEMA_PATH = Path(__file__).with_name("manifest_schema.json")
_SCHEMA_DATA = json.loads(_SCHEMA_PATH.read_text(encoding="utf-8"))

# Validate the schema against the draft-2020-12 meta-schema once at import time,
# so a corrupt/mis-edited schema file fails loudly instead of silently
# accepting everything.
jsonschema.Draft202012Validator.check_schema(_SCHEMA_DATA)
_VALIDATOR = jsonschema.Draft202012Validator(_SCHEMA_DATA)


def validate_manifest(data: dict | str) -> dict:
    """Validate a manifest dict (or JSON string) against schema v1.

    Returns the parsed manifest on success. Raises
    :class:`jsonschema.ValidationError` (or ``JSONDecodeError`` for bad JSON)
    on invalid input.
    """
    if isinstance(data, str):
        data = json.loads(data)
    _VALIDATOR.validate(data)
    return data


def load_manifest(path: str | Path) -> dict:
    """Read and validate a manifest file from disk."""
    with Path(path).open(encoding="utf-8") as f:
        return validate_manifest(json.load(f))


def verify_checksums(manifest: dict, bundle_dir: str | Path) -> list[str]:
    """Verify the sha256 checksums a manifest declares for bundled files.

    Returns a list of human-readable error messages; empty list means every
    declared file exists and matches. Files not listed in ``checksums`` are
    not checked (a signed bundle's signature covers the whole archive, which
    is the P1 hardening layer on top of this).
    """
    errors: list[str] = []
    root = Path(bundle_dir)
    for rel, digest in (manifest.get("checksums") or {}).items():
        path = root / rel
        if not path.is_file():
            errors.append(f"missing file: {rel}")
            continue
        expected = digest.removeprefix("sha256:").lower()
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != expected:
            errors.append(f"checksum mismatch: {rel}")
    return errors
