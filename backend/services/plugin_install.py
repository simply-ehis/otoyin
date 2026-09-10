"""Safe marketplace plugin install, verification, lifecycle, and runtime gateway.

Security model (see docs/knowledge/PLUGIN_SYSTEM.md):

* A bundle is a ``.21labs`` zip. **Install never executes third-party code.**
* Every bundled file must match the manifest's SHA-256 checksums. This is a hard
  gate: install aborts and the directory is removed on any mismatch.
* Executable kinds (``mcp-server``, ``ui-panel``) require a valid Ed25519
  signature over the canonical manifest. Self-signed is accepted, or — when
  ``TWENTYLABS_PLUGIN_REQUIRE_TRUSTED=1`` — only a key in
  ``TWENTYLABS_TRUSTED_PLUGIN_KEYS`` is allowed.
* Plugins install ``enabled=False``. Nothing runs until a user explicitly enables
  one.
* ``launch_plugin`` is the only place third-party code runs: no shell, the command
  must live inside the install dir (no system binaries), args come only from the
  manifest, and a stripped environment is passed. Declared ``permissions`` gate the
  launch.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
import shutil
import subprocess
import zipfile
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from sqlalchemy.orm import Session

from .. import config
from ..database.models import InstalledPlugin
from ..plugins.manifest import validate_manifest, verify_checksums

logger = logging.getLogger(__name__)

_EXECUTABLE_KINDS = {"mcp-server", "ui-panel", "external-app"}
MAX_BUNDLE_BYTES = 200 * 1024 * 1024  # 200 MB hard cap on extracted bytes
_SIG_PREFIX = "ed25519:"

# Plugin id -> running subprocess (the only third-party code that can execute).
_PROCESSES: dict[str, subprocess.Popen] = {}


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _b64_decode(value: str) -> bytes:
    return base64.b64decode(value)


def _canonical(manifest: dict) -> bytes:
    return json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode()


def _is_within(parent: Path, child: Path) -> bool:
    parent = parent.resolve()
    return child.resolve() == parent or child.resolve().is_relative_to(parent)


def _safe_entry(name: str) -> bool:
    if name.startswith(("/", "\\")):
        return False
    return ".." not in Path(name).parts


def verify_bundle_signature(manifest: dict, sig_b64: str) -> bool:
    """Verify an Ed25519 signature over the canonical manifest using the developer key."""
    pub = (manifest.get("developer") or {}).get("pubkey")
    if not isinstance(pub, str) or not pub.startswith(_SIG_PREFIX):
        return False
    try:
        key = Ed25519PublicKey.from_public_bytes(_b64_decode(pub[len(_SIG_PREFIX) :]))
        key.verify(_b64_decode(sig_b64), _canonical(manifest))
        return True
    except Exception:
        logger.debug("plugin signature verification failed", exc_info=True)
        return False


# --------------------------------------------------------------------------- #
# Install
# --------------------------------------------------------------------------- #
def install_bundle(db: Session, bundle_bytes: bytes, filename: str = "plugin.21labs") -> InstalledPlugin:
    """Validate, verify, and persist a ``.21labs`` bundle. Never executes code."""
    if len(bundle_bytes) == 0:
        raise ValueError("Empty bundle")
    data = io.BytesIO(bundle_bytes)
    if not zipfile.is_zipfile(data):
        raise ValueError("Bundle is not a valid .21labs zip")
    data.seek(0)

    base = config.get_plugins_dir().resolve()
    with zipfile.ZipFile(data) as zf:
        names = zf.namelist()
        if "manifest.json" not in names:
            raise ValueError("Bundle missing manifest.json")
        for name in names:
            if not _safe_entry(name):
                raise ValueError(f"Unsafe entry in bundle: {name}")

        manifest = json.loads(zf.read("manifest.json"))
        validate_manifest(manifest)

        plugin_id = manifest["id"]
        version = manifest["version"]
        install_dir = (base / plugin_id / version).resolve()
        if not _is_within(base, install_dir):
            raise ValueError("Unsafe plugin id/path")
        if db.query(InstalledPlugin).filter_by(plugin_id=plugin_id).first():
            raise ValueError(f"Plugin '{plugin_id}' already installed; uninstall first")

        install_dir.mkdir(parents=True, exist_ok=True)
        try:
            written = 0
            for name in names:
                if name in ("manifest.json", "manifest.sig") or name.endswith("/"):
                    continue
                dest = (install_dir / name).resolve()
                if not _is_within(install_dir, dest):
                    raise ValueError(f"Unsafe path in bundle: {name}")
                dest.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(name) as src, open(dest, "wb") as out:
                    while True:
                        chunk = src.read(1024 * 1024)
                        if not chunk:
                            break
                        written += len(chunk)
                        if written > MAX_BUNDLE_BYTES:
                            raise ValueError("Bundle exceeds size limit")
                        out.write(chunk)

            errors = verify_checksums(manifest, install_dir)
            if errors:
                raise ValueError("Checksum verification failed: " + "; ".join(errors))

            sig = zf.read("manifest.sig").decode().strip() if "manifest.sig" in names else None
            kind = manifest.get("kind")
            if kind in _EXECUTABLE_KINDS:
                if not sig or not verify_bundle_signature(manifest, sig):
                    raise ValueError(f"Executable plugin '{kind}' requires a valid signature")
                if os.environ.get("TWENTYLABS_PLUGIN_REQUIRE_TRUSTED"):
                    trusted = {
                        k.strip() for k in os.environ.get("TWENTYLABS_TRUSTED_PLUGIN_KEYS", "").split(",") if k.strip()
                    }
                    if (manifest.get("developer") or {}).get("pubkey") not in trusted:
                        raise ValueError("Plugin developer key is not in the trusted set")
                sig_verified = True
            else:
                sig_verified = bool(sig and verify_bundle_signature(manifest, sig))
        except Exception:
            shutil.rmtree(install_dir, ignore_errors=True)
            raise

    row = InstalledPlugin(
        plugin_id=plugin_id,
        name=manifest.get("name", plugin_id),
        version=version,
        developer=(manifest.get("developer") or {}).get("name"),
        kind=kind,
        manifest_json=json.dumps(manifest, sort_keys=True),
        signature=sig,
        verified=sig_verified,
        enabled=False,
        install_path=str(install_dir),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info("Installed plugin %s v%s (kind=%s, verified=%s)", plugin_id, version, kind, sig_verified)
    return row


# --------------------------------------------------------------------------- #
# Lifecycle
# --------------------------------------------------------------------------- #
def list_installed(db: Session) -> list[InstalledPlugin]:
    return db.query(InstalledPlugin).all()


def get_installed(db: Session, plugin_id: str) -> InstalledPlugin | None:
    return db.query(InstalledPlugin).filter_by(plugin_id=plugin_id).first()


def set_enabled(db: Session, plugin_id: str, enabled: bool) -> bool:
    row = get_installed(db, plugin_id)
    if not row:
        return False
    if enabled:
        _stop(row.plugin_id)  # never auto-run; enabling just flips the flag
    row.enabled = enabled
    db.commit()
    return True


def set_trust_external(db: Session, plugin_id: str, trusted: bool) -> bool:
    """Record explicit user consent for an external-app plugin to launch a system binary.

    Approval is durable: once trusted, toggling ``enabled`` does not require
    re-approval. This is the consent gate that distinguishes the external linking
    layer from the bundled-code path (which never reaches outside the sandbox).
    """
    row = get_installed(db, plugin_id)
    if not row:
        return False
    if not trusted:
        _stop(row.plugin_id)
    row.trust_external = trusted
    db.commit()
    return True


def uninstall(db: Session, plugin_id: str) -> bool:
    row = get_installed(db, plugin_id)
    if not row:
        return False
    _stop(plugin_id)
    if row.install_path:
        target = Path(row.install_path).resolve()
        if _is_within(config.get_plugins_dir().resolve(), target):
            shutil.rmtree(target, ignore_errors=True)
    db.delete(row)
    db.commit()
    return True


def require_permission(row: InstalledPlugin, permission: str) -> bool:
    """True iff the plugin is enabled AND the user approved ``permission``."""
    if not row.enabled:
        return False
    try:
        approved = json.loads(row.approved_permissions or "[]")
    except json.JSONDecodeError:
        approved = []
    return permission in approved


# --------------------------------------------------------------------------- #
# Runtime gateway (the only place third-party code may execute)
# --------------------------------------------------------------------------- #
def launch_plugin(plugin_id: str) -> dict:
    """Launch an ``mcp-server`` plugin. Gated by enabled + contained command + permissions."""
    row = get_installed_sync(plugin_id)
    if row is None:
        raise ValueError("Plugin not installed")
    if not row.enabled:
        raise PermissionError("Plugin is disabled; enable it before launching")
    manifest = json.loads(row.manifest_json or "{}")
    if manifest.get("kind") != "mcp-server":
        raise ValueError("Only mcp-server plugins can be launched by the backend")
    entry = manifest.get("entry") or {}
    if entry.get("type") != "mcp":
        raise ValueError("Manifest entry.type must be 'mcp'")
    command = entry.get("command")
    if not command:
        raise ValueError("Manifest entry.command is required")

    install_dir = Path(row.install_path).resolve()
    cmd_path = (install_dir / command).resolve()
    if not _is_within(install_dir, cmd_path) or not cmd_path.exists():
        raise ValueError("entry.command must resolve to a file inside the plugin install dir")
    if not require_permission(row, "network") and entry.get("transport") == "socket":
        raise PermissionError("Plugin lacks the 'network' permission for socket transport")

    args = [str(cmd_path)] + [str(a) for a in (entry.get("args") or [])]
    env = {
        "PLUGIN_ID": plugin_id,
        "PLUGIN_INSTALL_DIR": str(install_dir),
        "TMPDIR": str(install_dir / "tmp"),
    }
    (install_dir / "tmp").mkdir(parents=True, exist_ok=True)
    if plugin_id in _PROCESSES and _PROCESSES[plugin_id].poll() is None:
        raise RuntimeError("Plugin already running")

    proc = subprocess.Popen(
        args,
        cwd=str(install_dir),
        env=env,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        shell=False,
    )
    _PROCESSES[plugin_id] = proc
    logger.info("Launched plugin %s (pid=%s)", plugin_id, proc.pid)
    return {"plugin_id": plugin_id, "pid": proc.pid, "status": "running"}


def launch_external_plugin(plugin_id: str) -> dict:
    """Launch an ``external-app`` plugin — a linking layer to a system binary.

    Trust model: this is the ONLY path that runs code outside the bundle. It
    therefore requires (1) the plugin to be enabled AND (2) explicit user consent
    (``trust_external``). The target must be an absolute path (no PATH resolution,
    no shell, no ``..``), args come only from the manifest, and the stripped env is
    passed. Declared ``permissions`` still gate the launch.
    """
    row = get_installed_sync(plugin_id)
    if row is None:
        raise ValueError("Plugin not installed")
    if not row.enabled:
        raise PermissionError("Plugin is disabled; enable it before launching")
    if not row.trust_external:
        raise PermissionError("External app not approved; approve it before launching")
    manifest = json.loads(row.manifest_json or "{}")
    if manifest.get("kind") != "external-app":
        raise ValueError("Only external-app plugins can be launched externally")
    entry = manifest.get("entry") or {}
    if entry.get("type") != "external":
        raise ValueError("Manifest entry.type must be 'external'")

    command = entry.get("command")
    if not command or not Path(command).is_absolute():
        raise ValueError("entry.command must be an absolute path to a system binary")
    cmd_path = Path(command).resolve()
    if ".." in cmd_path.parts or not cmd_path.is_file():
        raise ValueError("entry.command must resolve to an existing file")

    if not require_permission(row, "network") and entry.get("transport") == "socket":
        raise PermissionError("Plugin lacks the 'network' permission for socket transport")

    args = [str(cmd_path)] + [str(a) for a in (entry.get("args") or [])]
    env = {
        "PLUGIN_ID": plugin_id,
        "PLUGIN_INSTALL_DIR": str(Path(row.install_path).resolve()),
        "TMPDIR": str(Path(row.install_path).resolve() / "tmp"),
    }
    (Path(row.install_path).resolve() / "tmp").mkdir(parents=True, exist_ok=True)
    if plugin_id in _PROCESSES and _PROCESSES[plugin_id].poll() is None:
        raise RuntimeError("Plugin already running")

    proc = subprocess.Popen(
        args,
        cwd=str(Path(row.install_path).resolve()),
        env=env,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        shell=False,
    )
    _PROCESSES[plugin_id] = proc
    logger.info("Launched external app %s (pid=%s) -> %s", plugin_id, proc.pid, cmd_path)
    return {"plugin_id": plugin_id, "pid": proc.pid, "status": "running"}


def stop_plugin(plugin_id: str) -> bool:
    return _stop(plugin_id)


def stop_all_plugins() -> None:
    """Terminate all running plugin subprocesses (called on server shutdown)."""
    for plugin_id in list(_PROCESSES):
        try:
            _stop(plugin_id)
        except Exception:
            logger.debug("Failed to stop plugin %s during shutdown", plugin_id, exc_info=True)


def plugin_status(plugin_id: str) -> dict:
    proc = _PROCESSES.get(plugin_id)
    running = proc is not None and proc.poll() is None
    return {"plugin_id": plugin_id, "running": running, "pid": proc.pid if running else None}


def _stop(plugin_id: str) -> bool:
    proc = _PROCESSES.get(plugin_id)
    if proc and proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        del _PROCESSES[plugin_id]
        return True
    _PROCESSES.pop(plugin_id, None)
    return False


def get_installed_sync(plugin_id: str) -> InstalledPlugin | None:
    """Read a row without a caller-supplied session (used by the launch gateway)."""
    from ..database.session import SessionLocal

    db = SessionLocal()
    try:
        return db.query(InstalledPlugin).filter_by(plugin_id=plugin_id).first()
    finally:
        db.close()
