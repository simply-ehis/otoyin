"""
Guard the fixes behind the blank-window / ghost-server bugs.

These are source-level assertions because the bugs were packaging- and
platform-selection problems that unit tests of the individual functions cannot
catch: they only manifest in the built artifact or in a browser.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
TAURI = REPO / "tauri"
SRC_TAURI = TAURI / "src-tauri" / "src"
APP = REPO / "app" / "src"

pytestmark = pytest.mark.filterwarnings("ignore::DeprecationWarning")


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _strip_comments(text: str) -> str:
    """Remove `//` and `/* */` comments, keeping string literals intact.

    Several fixes carry a long comment explaining the bug they prevent. Those
    comments legitimately mention the removed APIs, so assertions about *code*
    have to look at code only.
    """
    out: list[str] = []
    i = 0
    n = len(text)
    quote: str | None = None
    while i < n:
        ch = text[i]
        if quote:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if ch == quote:
                quote = None
            i += 1
            continue
        if ch in "\"'`":
            quote = ch
            out.append(ch)
            i += 1
            continue
        if text.startswith("//", i):
            while i < n and text[i] != "\n":
                i += 1
            continue
        if text.startswith("/*", i):
            end = text.find("*/", i + 2)
            i = n if end == -1 else end + 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def _interface_members(code: str, name: str) -> list[str]:
    """Member names declared by `interface <name> { ... }` in stripped code.

    Multi-line signatures are joined first so a parameter list never gets
    mistaken for a member.
    """
    start = code.index(f"interface {name}")
    depth = 0
    end = start
    for i in range(start, len(code)):
        if code[i] == "{":
            depth += 1
        elif code[i] == "}":
            depth -= 1
            if depth == 0:
                end = i
                break
    block = code[start + len(f"interface {name}") : end]

    # Join wrapped signatures: "...(\n  a,\n  b\n): Promise<T>;" -> one line.
    joined = re.sub(r"\(\s*(?:\n|.)*?\)\s*:", lambda m: m.group(0).replace("\n", " "), block)
    members: list[str] = []
    for stmt in joined.split(";"):
        stmt = stmt.strip()
        if not stmt:
            continue
        head = stmt.split("(")[0].strip().rstrip("?:").strip()
        if not head or head.startswith("interface") or "{" in head:
            continue
        members.append(head)
    return members


# ── Web/platform selection ────────────────────────────────────────────────


def test_entrypoint_uses_web_platform_outside_tauri():
    """A plain browser must not be handed the Tauri platform.

    Regression (2026-10-03): ``tauri/src/main.tsx`` hardcoded
    ``tauriPlatform`` even when served by ``vite dev`` in a browser. Every
    browser session therefore threw
    ``Cannot read properties of undefined (reading 'transformCallback')`` from
    the Tauri IPC bridge and logged a close-handler failure on every mount,
    because ``window.__TAURI_INTERNALS__`` only exists inside the webview. A
    complete ``webPlatform`` already existed but was never selected, so the web
    build was unusable for testing.
    """
    main = _read(TAURI / "src" / "main.tsx")

    assert "__TAURI_INTERNALS__" in main, "main.tsx must detect the Tauri runtime before choosing a platform"
    assert "webPlatform" in main, "main.tsx must be able to select webPlatform"
    assert "isTauriRuntime" in main, "the platform choice must be derived from the runtime, not hardcoded"
    # The provider must receive the chosen platform, not the Tauri one
    # directly. Compare against code with comments stripped so the rationale
    # we left in the file cannot satisfy (or fail) the assertion.
    code = _strip_comments(main)
    assert "<PlatformProvider platform={platform}>" in code, (
        "PlatformProvider must receive the runtime-selected platform"
    )
    assert "<PlatformProvider platform={tauriPlatform}>" not in code, (
        "PlatformProvider is still hardcoded to tauriPlatform"
    )


def test_web_platform_satisfies_the_platform_contract():
    """webPlatform must implement every PlatformLifecycle member.

    Selecting it in a browser only works if it is structurally complete; a
    missing member is a runtime crash on that code path, which is how the web
    build failed in the first place.
    """
    web = _read(APP / "platform" / "webPlatform.ts")
    types = _read(APP / "platform" / "types.ts")

    members = _interface_members(_strip_comments(types), "PlatformLifecycle")
    assert members, "could not parse PlatformLifecycle members"

    # Optional members (`foo?:`) need not be implemented — an absent optional
    # is a valid object under structural typing.
    required = [m for m in members if f"{m}?:" not in _strip_comments(types)]
    missing = [m for m in required if m not in web]
    assert not missing, f"webPlatform is missing required PlatformLifecycle members: {missing}"


# ── CSP must allow the loopback host the backend actually binds ────────────


def test_csp_allows_the_backend_host_from_server_rs():
    """connect-src must permit the host the sidecar is told to bind.

    Regression (2026-10-03): ``SERVER_HOST`` is ``127.0.0.1``, so
    ``start_server`` hands the frontend ``http://127.0.0.1:<port>``. The CSP
    only allowed ``http://localhost:*``. CSP matches on host string and
    ``127.0.0.1`` is not ``localhost``, so every fetch to the backend was
    blocked and ``useBootReadiness`` — which polls forever by design — never
    cleared, leaving the app stuck on a splash screen.
    """
    server_rs = _read(SRC_TAURI / "server.rs")
    conf = _read(TAURI / "src-tauri" / "tauri.conf.json")

    host = next(line.split('"')[1] for line in server_rs.splitlines() if line.startswith("pub const SERVER_HOST"))

    connect = next(part for part in conf.split('"csp":')[1].split(";") if "connect-src" in part)
    assert f"http://{host}:*" in connect, (
        f"CSP connect-src does not allow the backend host {host}. Got: {connect.strip()}"
    )


# ── The backend must be stopped when the window closes ────────────────────


def test_window_close_unconditionally_stops_the_backend():
    """Closing the app must kill the backend Rust-side, with no renderer gate.

    Regression (2026-10-03): a close left an orphaned ``otoyin-server.exe``
    holding the port, so the next launch adopted a stale backend or rotated
    ports. The kill was gated on ``window.__TWENTYLABSServerStartedByApp``,
    which is declared in ``global.d.ts`` but never assigned anywhere — always
    ``false``, so ``stop_server`` never ran. Two handlers also raced on the
    same event (Rust ``on_window_event`` plus a JS ``onCloseRequested``), each
    calling ``preventDefault``, with the kill in a fire-and-forget ``catch {}``.

    This test pins: one owner (Rust), unconditional kill, no JS gate.
    """
    lib_rs = _read(SRC_TAURI / "lib.rs")

    close_branch = lib_rs[lib_rs.index("WindowEvent::CloseRequested") :]
    close_branch = close_branch[: close_branch.index(".build(")]

    assert "stop_if_ours" in close_branch, "the close handler must stop the backend via stop_if_ours"
    # No renderer permission round-trip, and no keep-running escape hatch.
    assert "window-close-requested" not in close_branch, (
        "the close path must not depend on a renderer round-trip; that race is what let the backend survive a close"
    )
    assert "keep_running" not in close_branch, "closing must always stop the backend; keep_running reintroduces ghosts"
    # The window must not be destroyed before the kill is issued.
    assert close_branch.index("stop_if_ours") < close_branch.index("destroy"), (
        "the backend must be stopped before the window is destroyed, or the child can be orphaned"
    )


def test_keep_server_running_is_fully_removed():
    """The keep-running setting must be gone from every layer.

    Closing the app now always stops the backend, so the toggle could not
    change behaviour. Leaving it in place would show a switch in Settings that
    silently does nothing.
    """
    forbidden = [
        APP / "features" / "settings" / "GeneralPage.tsx",
        APP / "stores" / "serverStore.ts",
        APP / "platform" / "types.ts",
        APP / "platform" / "tauriPlatform.ts",
        APP / "platform" / "webPlatform.ts",
        TAURI / "src" / "platform" / "lifecycle.ts",
        SRC_TAURI / "server.rs",
        SRC_TAURI / "lib.rs",
    ]
    for path in forbidden:
        text = _read(path)
        for needle in ("keepServerRunning", "set_keep_server_running"):
            assert needle not in text, f"{path.name} still references {needle}"

    # No locale should advertise the removed setting either.
    locales = REPO / "app" / "src" / "i18n" / "locales"
    offenders = [p.parent.name for p in locales.glob("*/translation.json") if "keepServerRunning" in _read(p)]
    assert not offenders, f"locale files still define keepServerRunning: {offenders}"


def test_no_second_webview_close_handler():
    """Only Rust may handle window close.

    A JS ``onCloseRequested`` handler that also calls ``preventDefault`` races
    the Rust handler; whichever loses can leave the child alive.
    """
    platform_ts = _strip_comments(_read(APP / "platform" / "tauriPlatform.ts"))
    assert "onCloseRequested" not in platform_ts, "tauriPlatform must not register a window close handler; Rust owns it"

    lifecycle_ts = _strip_comments(_read(TAURI / "src" / "platform" / "lifecycle.ts"))
    assert "onCloseRequested" not in lifecycle_ts
    assert "window-close-requested" not in lifecycle_ts, "lifecycle.ts must not listen for the removed close round-trip"
