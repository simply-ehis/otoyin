"""Build a signed ``.21labs`` plugin bundle for offline dev/CI.

This is the authoring counterpart to the install/verify contract enforced by
``backend/services/plugin_install.py`` and ``backend/plugins/manifest.py``. It
produces a zip containing ``manifest.json``, the payload files, and an optional
``manifest.sig`` (base64 Ed25519 signature over the canonical manifest).

Usage::

    # Build a self-signed reference bundle from a generated sample plugin:
    python -m backend.scripts.build_plugin_bundle --sample \
        --out build/reference-plugin.21labs

    # Build from a prepared source directory (manifest.json + files):
    python -m backend.scripts.build_plugin_bundle --source ./my-plugin \
        --out my-plugin.21labs --gen-key build/plugin-key.json
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
import zipfile
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from backend.plugins.manifest import validate_manifest

_SIG_PREFIX = "ed25519:"


def _canonical(manifest: dict) -> bytes:
    return json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()


def _b64_encode(raw: bytes) -> str:
    return base64.b64encode(raw).decode("ascii")


def _generate_keypair() -> tuple[str, str]:
    """Return (private_key_b64, public_key_ed25519_b64)."""
    priv = Ed25519PrivateKey.generate()
    pub_raw = priv.public_key().public_bytes_raw()
    return _b64_encode(priv.private_bytes_raw()), _SIG_PREFIX + _b64_encode(pub_raw)


def _sign_manifest(manifest: dict, private_key_b64: str) -> str:
    priv = Ed25519PrivateKey.from_private_bytes(base64.b64decode(private_key_b64))
    return _b64_encode(priv.sign(_canonical(manifest)))


def _compute_checksums(source: Path) -> dict[str, str]:
    checksums: dict[str, str] = {}
    for path in sorted(source.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(source).as_posix()
        if rel in ("manifest.json", "manifest.sig"):
            continue
        checksums[rel] = "sha256:" + _sha256_hex(path)
    return checksums


def _sha256_hex(path: Path) -> str:
    import hashlib

    return hashlib.sha256(path.read_bytes()).hexdigest()


def _build_sample_source() -> tuple[Path, str]:
    """Create a temporary sample plugin source; return (dir, private_key_b64)."""
    import tempfile

    root = Path(tempfile.mkdtemp(prefix="21labs-sample-plugin-"))
    (root / "models").mkdir(parents=True, exist_ok=True)
    (root / "models" / "README.txt").write_text(
        "Reference otoyin voice-pack payload.\nReplace with real model artifacts before publishing.\n",
        encoding="utf-8",
    )
    priv_b64, pub = _generate_keypair()
    manifest = {
        "id": "dev.21labs.reference-voice",
        "name": "Reference Voice Pack",
        "version": "0.1.0",
        "kind": "voice-pack",
        "developer": {"name": "21labs", "pubkey": pub},
        "description": "Self-signed reference bundle for development and CI.",
        "permissions": ["read_models"],
    }
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return root, priv_b64


def build_bundle(source: Path, out_path: Path, private_key_b64: str | None) -> None:
    manifest_path = source / "manifest.json"
    if not manifest_path.is_file():
        raise SystemExit(f"Source missing manifest.json: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    manifest["checksums"] = _compute_checksums(source)

    if private_key_b64:
        developer = manifest.get("developer") or {}
        if not developer.get("pubkey"):
            priv = Ed25519PrivateKey.from_private_bytes(base64.b64decode(private_key_b64))
            pub = _SIG_PREFIX + _b64_encode(priv.public_key().public_bytes_raw())
            developer["pubkey"] = pub
            manifest["developer"] = developer
        manifest["signature"] = _sign_manifest(manifest, private_key_b64)
        sig = manifest.pop("signature")
    else:
        sig = None

    validate_manifest(manifest)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("manifest.json", json.dumps(manifest, indent=2))
        for path in sorted(source.rglob("*")):
            if not path.is_file():
                continue
            rel = path.relative_to(source).as_posix()
            if rel in ("manifest.json", "manifest.sig"):
                continue
            zf.write(path, rel)
        if sig is not None:
            zf.writestr("manifest.sig", sig)

    kind = manifest.get("kind")
    print(f"Wrote bundle: {out_path} ({kind}, signed={sig is not None})")
    if sig is not None:
        print(f"Developer public key: {manifest['developer']['pubkey']}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build a signed .21labs bundle")
    parser.add_argument("--source", help="Directory containing manifest.json + files")
    parser.add_argument("--out", required=True, help="Output .21labs path")
    parser.add_argument(
        "--gen-key",
        metavar="PATH",
        help="Generate a new Ed25519 keypair, embed the pubkey, sign, and write the key JSON",
    )
    parser.add_argument(
        "--key",
        metavar="PATH",
        help="Private key (base64) file to sign with; manifest must already declare the matching pubkey",
    )
    parser.add_argument(
        "--sample",
        action="store_true",
        help="Build a self-signed reference bundle from a generated sample plugin",
    )
    args = parser.parse_args(argv)

    private_key_b64: str | None = None
    if args.gen_key:
        priv_b64, _pub = _generate_keypair()
        Path(args.gen_key).parent.mkdir(parents=True, exist_ok=True)
        Path(args.gen_key).write_text(json.dumps({"private_key_b64": priv_b64}), encoding="utf-8")
        print(f"Wrote keypair: {args.gen_key}")
        private_key_b64 = priv_b64
        if not args.source and not args.sample:
            raise SystemExit("--gen-key requires --source or --sample")
    elif args.key:
        raw = Path(args.key).read_text(encoding="utf-8").strip()
        try:
            private_key_b64 = json.loads(raw)["private_key_b64"]
        except (json.JSONDecodeError, KeyError, TypeError):
            private_key_b64 = raw

    if args.sample:
        if args.source:
            raise SystemExit("--sample and --source are mutually exclusive")
        source, sample_priv = _build_sample_source()
        if private_key_b64 is None:
            private_key_b64 = sample_priv
    elif args.source:
        source = Path(args.source)
    else:
        raise SystemExit("Provide --source DIR, or --sample")

    build_bundle(source, Path(args.out), private_key_b64)
    return 0


if __name__ == "__main__":
    sys.exit(main())
