"""Discovery of locally installed ACP coding agents.

The catalog is the published ACP registry (``data/acp_registry.json``), not a
hardcoded list. Each entry carries its own distribution metadata (npx / uvx /
platform binary) with the exact ``cmd`` and ``args`` needed to start ACP mode,
so new harnesses appear as soon as the bundled snapshot is refreshed.

Detection is a pure PATH / filesystem check — no agent process is launched —
which makes it safe to call on every Settings render. Users may also register
an arbitrary ACP command; those are stored in ``data/acp_custom_agents.json``.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import sys
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_REGISTRY_FILE = Path(__file__).resolve().parent / "acp_registry.json"
_CUSTOM_FILE = Path(__file__).resolve().parent.parent / "data" / "acp_custom_agents.json"

# Some agents ship an ACP adapter under a different name than their CLI, or
# are installed by a package manager that doesn't expose the registry's cmd.
# These are PATH aliases only — the registry still owns the argv/version.
_ALIASES: dict[str, tuple[tuple[str, str, tuple[str, ...]], ...]] = {
    "codex-acp": (("codex", "adapter", ()),),
    "claude-acp": (("claude", "adapter", ()),),
    "github-copilot-cli": (("copilot", "native", ("--acp",)),),
    "gemini": (("gemini", "native", ("--acp",)),),
    "kilo": (("kilo", "native", ("acp",)),),
    "cursor": (("cursor-agent", "native", ("acp",)),),
    "antigravity-acp": (("agy", "native", ("acp",)),),
    "kiro": (("kiro-cli", "native", ("acp",)),),
}

_PLATFORM_KEYS: dict[str, tuple[str, ...]] = {
    "win32": ("windows-x86_64", "windows-aarch64"),
    "darwin": ("darwin-aarch64", "darwin-x86_64"),
    "linux": ("linux-x86_64", "linux-aarch64", "linux-x86_64-musl", "linux-aarch64-musl"),
}


def _extra_dirs() -> list[Path]:
    """Install locations on a GUI app's PATH that a shell may not expose."""
    dirs: list[Path] = []
    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA")
        local = os.environ.get("LOCALAPPDATA")
        if appdata:
            dirs.append(Path(appdata) / "npm")
        if local:
            dirs.append(Path(local) / "Microsoft" / "WinGet" / "Links")
            dirs.append(Path(local) / "Programs" / "Microsoft VS Code" / "bin" / "copilot-shim")
    else:
        dirs.extend((Path.home() / ".local" / "bin", Path("/usr/local/bin"), Path("/opt/homebrew/bin")))
    return [d for d in dirs if d.is_dir()]


def find_executable(name: str) -> str | None:
    """Resolve a CLI to an executable path, including Windows npm shims.

    ``shutil.which`` uses PATHEXT and resolves ``codex.cmd``; PowerShell's
    ``Get-Command`` would instead report ``codex.ps1``, which ``Popen``
    cannot execute.
    """
    found = shutil.which(name)
    if found:
        return str(Path(found).resolve())
    for directory in _extra_dirs():
        for candidate_name in (name, name + ".cmd", name + ".exe", name + ".bat"):
            candidate = directory / candidate_name
            if candidate.is_file():
                return str(candidate.resolve())
    if sys.platform == "win32":
        for directory in _extra_dirs():
            ps1 = directory / (name + ".ps1")
            if ps1.is_file():
                return str(ps1.resolve())
    return None


def load_registry() -> dict[str, Any]:
    """Load the bundled ACP registry snapshot."""
    try:
        data = json.loads(_REGISTRY_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data.get("agents"), list) else {"agents": []}
    except (OSError, ValueError):
        logger.warning("ACP registry snapshot missing or invalid: %s", _REGISTRY_FILE)
        return {"agents": []}


def save_registry(data: dict[str, Any]) -> None:
    """Persist a refreshed registry snapshot."""
    if not isinstance(data.get("agents"), list):
        raise ValueError("Registry must contain an 'agents' list")
    _REGISTRY_FILE.parent.mkdir(parents=True, exist_ok=True)
    _REGISTRY_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _npm_package_name(package: str) -> str:
    """``@scope/name@1.2.3`` → ``@scope/name``; ``cline@3`` → ``cline``."""
    at = package.rfind("@")
    return package if at <= 0 else package[:at]


def _npm_installed(package: str) -> bool:
    """True when the package is already in a global node_modules tree."""
    name = _npm_package_name(package)
    for directory in _extra_dirs():
        if (directory / "node_modules" / name).is_dir():
            return True
    for node_modules in (Path("/usr/local/lib/node_modules"), Path.home() / ".npm-global" / "lib" / "node_modules"):
        if (node_modules / name).is_dir():
            return True
    return False


def _platform_binary(entry: dict[str, Any]) -> dict[str, Any] | None:
    binaries = (entry.get("distribution") or {}).get("binary")
    if not isinstance(binaries, dict):
        return None
    for key in _PLATFORM_KEYS.get(sys.platform, ()):
        if key in binaries:
            return binaries[key]
    return None


def _binary_names(cmd: str) -> tuple[str, ...]:
    """``./dist-package\\cursor-agent.cmd`` → ``cursor-agent``."""
    base = cmd.replace("\\", "/").rsplit("/", 1)[-1]
    return (base, Path(base).stem)


def _distribution(entry: dict[str, Any]) -> str:
    dist = entry.get("distribution") or {}
    if _platform_binary(entry):
        return "binary"
    if "npx" in dist:
        return "npx"
    if "uvx" in dist:
        return "uvx"
    return "unknown"


def _runner(name: str) -> str | None:
    return find_executable(name)


def _acp_argv(entry: dict[str, Any]) -> tuple[list[str] | None, str, bool]:
    """Return (argv, kind, installed) for one registry entry."""
    agent_id = str(entry.get("id", ""))
    dist = entry.get("distribution") or {}
    binary = _platform_binary(entry)

    if binary:
        for name in _binary_names(str(binary.get("cmd", ""))):
            executable = find_executable(name)
            if executable:
                return [executable, *binary.get("args", [])], "native", True

    for name, kind, args in _ALIASES.get(agent_id, ()):
        executable = find_executable(name)
        if not executable:
            continue
        if kind == "adapter":
            npx = dist.get("npx")
            runner = _runner("npx")
            if npx and runner:
                return [runner, "-y", str(npx["package"]), *npx.get("args", [])], "adapter", True
            continue
        return [executable, *args], "native", True

    npx = dist.get("npx")
    if npx and _npm_installed(str(npx.get("package", ""))):
        runner = _runner("npx")
        if runner:
            return [runner, "-y", str(npx["package"]), *npx.get("args", [])], "adapter", True

    uvx = dist.get("uvx")
    if uvx:
        runner = _runner("uvx")
        if runner:
            return [runner, str(uvx["package"]), *uvx.get("args", [])], "adapter", True

    return None, _distribution(entry), False


def describe(entry: dict[str, Any]) -> dict[str, Any]:
    """Public description of one registry or custom agent."""
    argv, kind, installed = _acp_argv(entry)
    return {
        "id": str(entry.get("id", "")),
        "title": str(entry.get("name") or entry.get("id") or "Unnamed agent"),
        "version": entry.get("version"),
        "description": entry.get("description"),
        "website": entry.get("website"),
        "source": entry.get("source", "registry"),
        "distribution": _distribution(entry),
        "installed": installed,
        "acp_available": argv is not None,
        "acp_command": argv,
        "acp_kind": kind,
        "install_hint": entry.get("install_hint") or _install_hint(entry),
    }


def _install_hint(entry: dict[str, Any]) -> str:
    dist = entry.get("distribution") or {}
    npx = dist.get("npx")
    if npx:
        return f"Install with: npm install -g {npx['package']}"
    uvx = dist.get("uvx")
    if uvx:
        return f"Install with: uv tool install {uvx['package']}"
    binary = _platform_binary(entry)
    if binary:
        return f"Download {binary.get('archive', 'the ACP binary')} and put it on PATH."
    return "Install an ACP-compatible build of this agent."


def _custom_entries() -> list[dict[str, Any]]:
    try:
        data = json.loads(_CUSTOM_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (OSError, ValueError):
        return []


def list_custom_agents() -> list[dict[str, Any]]:
    """Return user-registered ACP commands."""
    return [describe_custom(entry) for entry in _custom_entries()]


def add_custom_agent(name: str, command: list[str]) -> dict[str, Any]:
    """Register an arbitrary ACP command and return its description."""
    cleaned_name = name.strip()
    cleaned_command = [str(part) for part in command if str(part).strip()]
    if not cleaned_name or not cleaned_command:
        raise ValueError("A name and a command are required")
    if find_executable(cleaned_command[0]) is None:
        raise ValueError(f"Executable not found: {cleaned_command[0]}")
    entries = _custom_entries()
    agent_id = "custom-" + "".join(c if c.isalnum() else "-" for c in cleaned_name.lower()).strip("-")[:40]
    entry = {
        "id": agent_id,
        "name": cleaned_name,
        "version": None,
        "description": "User-defined ACP agent",
        "website": None,
        "source": "custom",
        "distribution": "custom",
        "command": cleaned_command,
        "install_hint": "Registered manually in Settings.",
    }
    entries = [item for item in entries if item.get("id") != agent_id]
    entries.append(entry)
    _CUSTOM_FILE.parent.mkdir(parents=True, exist_ok=True)
    _CUSTOM_FILE.write_text(json.dumps(entries, indent=2), encoding="utf-8")
    return describe_custom(entry)


def remove_custom_agent(agent_id: str) -> bool:
    """Remove a user-registered ACP command by id."""
    entries = _custom_entries()
    kept = [item for item in entries if item.get("id") != agent_id]
    if len(kept) == len(entries):
        return False
    _CUSTOM_FILE.write_text(json.dumps(kept, indent=2), encoding="utf-8")
    return True


def describe_custom(entry: dict[str, Any]) -> dict[str, Any]:
    """Describe a custom agent whose argv is stored verbatim."""
    command = [str(part) for part in entry.get("command", []) if str(part).strip()]
    executable = find_executable(command[0]) if command else None
    installed = executable is not None
    if executable:
        command = [executable, *command[1:]]
    return {
        "id": entry.get("id", ""),
        "title": entry.get("name") or entry.get("id"),
        "version": entry.get("version"),
        "description": entry.get("description"),
        "website": None,
        "source": "custom",
        "distribution": "custom",
        "installed": installed,
        "acp_available": installed,
        "acp_command": command if installed else None,
        "acp_kind": "custom",
        "install_hint": entry.get("install_hint", ""),
    }


def detect_available() -> list[dict[str, Any]]:
    """Describe every registry agent plus user-defined ones."""
    results: list[dict[str, Any]] = []
    for entry in load_registry().get("agents", []):
        try:
            results.append(describe(entry))
        except Exception:
            logger.debug("ACP detection failed for %s", entry.get("id"), exc_info=True)
    for entry in _custom_entries():
        try:
            results.append(describe_custom(entry))
        except Exception:
            logger.debug("Custom ACP detection failed for %s", entry.get("id"), exc_info=True)
    # Installed agents first so the useful ones fit on screen.
    results.sort(key=lambda item: (not item["installed"], item["title"].lower()))
    return results


def acp_command_for(agent_id: str) -> list[str] | None:
    """Resolve an ACP argv by agent id (registry or custom)."""
    for entry in _custom_entries():
        if entry.get("id") == agent_id:
            description = describe_custom(entry)
            return description["acp_command"]
    for entry in load_registry().get("agents", []):
        if entry.get("id") == agent_id:
            return describe(entry)["acp_command"]
    return None
