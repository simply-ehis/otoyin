"""
Unit tests for the plugin manifest schema v1 contract.

Covers the JSON Schema itself (valid against the meta-schema, rejects bad
manifests, enforces conditional entry points) plus the checksum verifier.

Run:  python -m pytest backend/tests/test_plugin_manifest.py
"""

import json

import jsonschema
import pytest

from backend.plugins import manifest as m

VALID_MANIFEST = {
    "id": "devhandle.my-plugin",
    "name": "My Plugin",
    "version": "1.0.0",
    "kind": "mcp-server",
    "developer": {"name": "Dev Handle", "pubkey": "ed25519:" + "A" * 43 + "="},
    "entry": {
        "type": "mcp",
        "command": "python",
        "args": ["server/main.py"],
        "transport": "stdio",
    },
    "tools": ["21labs.myplugin.*"],
    "models": ["qwen3-tts-1.7b"],
    "permissions": ["read_captures", "write_generations"],
    "min_version": "0.1.0",
    "checksums": {"server/main.py": "sha256:" + "0" * 64},
}


def test_schema_is_valid_against_metaschema():
    jsonschema.Draft202012Validator.check_schema(m._SCHEMA_DATA)


def test_valid_manifest_passes():
    assert m.validate_manifest(VALID_MANIFEST) == VALID_MANIFEST


def test_accepts_json_string_input():
    parsed = m.validate_manifest(json.dumps(VALID_MANIFEST))
    assert parsed == VALID_MANIFEST


def test_rejects_unknown_field():
    bad = dict(VALID_MANIFEST, surprise=True)
    with pytest.raises(jsonschema.ValidationError):
        m.validate_manifest(bad)


def test_rejects_missing_required():
    for field in ("id", "name", "version", "kind", "developer"):
        bad = {k: v for k, v in VALID_MANIFEST.items() if k != field}
        with pytest.raises(jsonschema.ValidationError):
            m.validate_manifest(bad)


@pytest.mark.parametrize(
    "version",
    ["1", "1.2", "01.2.3", "1.2.3.4", "abc", "1.2.3-", ""],
)
def test_rejects_bad_versions(version):
    bad = dict(VALID_MANIFEST, version=version)
    with pytest.raises(jsonschema.ValidationError):
        m.validate_manifest(bad)


@pytest.mark.parametrize(
    "pid",
    ["noplugin", "Uppercase.Name", "dev..name", ".leading.dot", "trailing.dot.", "has space.name", ""],
)
def test_rejects_bad_ids(pid):
    bad = dict(VALID_MANIFEST, id=pid)
    with pytest.raises(jsonschema.ValidationError):
        m.validate_manifest(bad)


def test_accepts_semver_prerelease_and_build():
    manifest = dict(VALID_MANIFEST, version="1.0.0-rc.1+build.5")
    assert m.validate_manifest(manifest)["version"] == "1.0.0-rc.1+build.5"


def test_rejects_bad_pubkey():
    bad = dict(VALID_MANIFEST, developer={"name": "x", "pubkey": "ssh-rsa AAA..."})
    with pytest.raises(jsonschema.ValidationError):
        m.validate_manifest(bad)


def test_rejects_duplicate_permissions():
    bad = dict(VALID_MANIFEST, permissions=["network", "network"])
    with pytest.raises(jsonschema.ValidationError):
        m.validate_manifest(bad)


def test_rejects_unknown_permission():
    bad = dict(VALID_MANIFEST, permissions=["delete_everything"])
    with pytest.raises(jsonschema.ValidationError):
        m.validate_manifest(bad)


def test_mcp_server_requires_entry():
    bad = dict(VALID_MANIFEST)
    del bad["entry"]
    with pytest.raises(jsonschema.ValidationError):
        m.validate_manifest(bad)


def test_ui_panel_requires_entry():
    bad = dict(VALID_MANIFEST, kind="ui-panel")
    del bad["entry"]
    with pytest.raises(jsonschema.ValidationError):
        m.validate_manifest(bad)


def test_pure_content_kind_needs_no_entry():
    manifest = dict(VALID_MANIFEST, kind="voice-pack")
    del manifest["entry"]
    assert m.validate_manifest(manifest) == manifest


def test_mcp_entry_requires_command():
    bad = dict(VALID_MANIFEST)
    bad["entry"] = {"type": "mcp", "transport": "stdio"}
    with pytest.raises(jsonschema.ValidationError):
        m.validate_manifest(bad)


def test_ui_entry_requires_file():
    bad = dict(VALID_MANIFEST, kind="ui-panel")
    bad["entry"] = {"type": "ui"}
    with pytest.raises(jsonschema.ValidationError):
        m.validate_manifest(bad)


def test_rejects_bad_checksum_digest():
    bad = dict(VALID_MANIFEST, checksums={"server/main.py": "md5:abc123"})
    with pytest.raises(jsonschema.ValidationError):
        m.validate_manifest(bad)


def test_rejects_checksum_with_backslash_path():
    bad = dict(VALID_MANIFEST, checksums={"server\\main.py": "sha256:" + "0" * 64})
    with pytest.raises(jsonschema.ValidationError):
        m.validate_manifest(bad)


def test_checksum_verify_ok(tmp_path):
    payload = b"hello world"
    (tmp_path / "server").mkdir()
    (tmp_path / "server" / "main.py").write_bytes(payload)
    manifest = dict(
        VALID_MANIFEST,
        checksums={"server/main.py": "sha256:" + __import__("hashlib").sha256(payload).hexdigest()},
    )
    assert m.verify_checksums(manifest, tmp_path) == []


def test_checksum_verify_mismatch_and_missing(tmp_path):
    (tmp_path / "server").mkdir()
    (tmp_path / "server" / "main.py").write_bytes(b"tampered")
    manifest = dict(VALID_MANIFEST, checksums={"server/main.py": "sha256:" + "0" * 64})
    errors = m.verify_checksums(manifest, tmp_path)
    assert "checksum mismatch" in errors[0]
    manifest["checksums"]["missing.py"] = "sha256:" + "0" * 64
    errors = m.verify_checksums(manifest, tmp_path)
    assert sorted(errors) == ["checksum mismatch: server/main.py", "missing file: missing.py"]


def test_load_manifest_from_file(tmp_path):
    path = tmp_path / "manifest.json"
    path.write_text(json.dumps(VALID_MANIFEST), encoding="utf-8")
    assert m.load_manifest(path) == VALID_MANIFEST
