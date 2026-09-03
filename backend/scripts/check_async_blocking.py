#!/usr/bin/env python3
"""CI gate: detect blocking calls inside async def handlers.

Scans every ``async def`` in ``routes/**/*.py`` and reports any call to
a known blocking function that should be wrapped in ``asyncio.to_thread``
(or replaced with an async equivalent).

Skips:
- Calls already wrapped in ``asyncio.to_thread()``
- ``sf.write()`` to in-memory buffers (BytesIO / io.BytesIO)
- Helper functions in ``utils/async_audio.py`` that are wrappers by design

Exit code 0 = clean, 1 = violations found.

Usage::

    python -m scripts.check_async_blocking          # scan routes/
    python scripts/check_async_blocking services/   # scan custom dir
"""

from __future__ import annotations

import ast
import io
import os
import sys
from pathlib import Path

# ── Blocking call patterns ───────────────────────────────────────────────

BLOCKING_CALLS: set[str] = {
    # Audio I/O (soundfile / librosa)
    "load_audio",
    "save_audio",
    "sf.read",
    "sf.write",
    "soundfile.read",
    "soundfile.write",
    "librosa.load",
    "librosa.resample",
    "librosa.effects.trim",
    "librosa.effects.split",
    "librosa.feature.rms",
    "librosa.feature.melspectrogram",
    "librosa.feature.chroma_stft",
    "librosa.get_duration",
    "librosa.effects.time_stretch",
    "librosa.effects.pitch_shift",
    # Noise reduction
    "reduce_noise",
    "reduce_noise_deepfilternet",
    "reduce_noise_rnnoise",
    "enhance_tts",
    "enhance_audio",
    # Subprocess (CPU-bound, blocks event loop)
    "subprocess.run",
    "subprocess.call",
    "subprocess.check_output",
    "subprocess.check_call",
    "subprocess.Popen",
    # Sleep / blocking I/O
    "time.sleep",
    "os.system",
    "os.popen",
    # Heavy numpy disk I/O
    "np.load",
    "np.save",
    "numpy.load",
    "numpy.save",
}

# Calls that are explicitly allowed (false-positive guards).
ALLOWED_CALLS: set[str] = {
    "asyncio.to_thread",
    "async_load_audio",
    "async_save_audio",
    "async_reduce_noise",
    "async_reduce_noise_deepfilter",
    "np.array",
    "np.zeros",
    "np.empty",
    "np.ones",
    "np.linspace",
    "np.arange",
    "np.concatenate",
    "np.stack",
    "np.mean",
    "np.std",
    "np.max",
    "np.min",
    "np.sum",
    "np.abs",
    "np.clip",
    "np.int16",
    "np.float32",
    "np.float64",
    "np.int32",
    "np.asarray",
    "np.frombuffer",
}


def _call_name(node: ast.Call) -> str | None:
    """Extract the dotted name of a Call node, e.g. 'subprocess.run'."""
    func = node.func
    parts: list[str] = []
    while isinstance(func, ast.Attribute):
        parts.append(func.attr)
        func = func.value
    if isinstance(func, ast.Name):
        parts.append(func.id)
    elif isinstance(func, ast.Attribute):
        parts.append(func.attr)
    else:
        return None
    return ".".join(reversed(parts))


def _is_to_thread_wrapped(call_node: ast.Call, parent_stack: list[ast.AST]) -> bool:
    """Check if this call is nested inside ``asyncio.to_thread()``.

    Walks the parent stack to find a Call to asyncio.to_thread that
    contains this call node (e.g. inside a lambda or function arg).
    Also detects the ``def _run(): <blocking>; await to_thread(_run)``
    idiom where a nested sync helper is passed to ``to_thread``.
    """
    for parent in reversed(parent_stack):
        if isinstance(parent, ast.Call):
            name = _call_name(parent)
            if name in ("asyncio.to_thread", "to_thread"):
                return True
    # Detect ``def _run(): <blocking>`` helper passed to to_thread:
    # if any enclosing function is a sync def defined inside an async def
    # and that helper is later referenced in a ``to_thread(helper)`` call,
    # treat its body as thread-wrapped. We approximate by checking whether
    # the blocking call lives inside a FunctionDef that itself lives inside
    # an AsyncFunctionDef which also contains a to_thread reference to it.
    for node in parent_stack:
        if isinstance(node, ast.FunctionDef) and not isinstance(node, ast.AsyncFunctionDef):  # sync helper
            for anc in parent_stack:
                if isinstance(anc, ast.AsyncFunctionDef):
                    helper_name = node.name
                    for sub in ast.walk(anc):
                        if (
                            isinstance(sub, ast.Call)
                            and _call_name(sub)
                            in (
                                "asyncio.to_thread",
                                "to_thread",
                            )
                            and sub.args
                            and isinstance(sub.args[0], ast.Name)
                            and sub.args[0].id == helper_name
                        ):
                            return True
                    break
    return False


def _is_buffer_write(call_node: ast.Call) -> bool:
    """Check if ``sf.write(buf, ...)`` is writing to an in-memory buffer.

    Heuristics:
    - First arg is named ``buf`` / ``buffer`` / ``output``
    - First arg is ``io.BytesIO(...)`` or ``BytesIO(...)``
    """
    if not call_node.args:
        return False

    first = call_node.args[0]

    # sf.write(buf, ...) where buf is a variable
    if isinstance(first, ast.Name) and first.id.lower() in (
        "buf",
        "buffer",
        "output",
        "wav_buf",
        "audio_buf",
        "mp3_buf",
    ):
        return True

    # sf.write(io.BytesIO(...), ...)  # noqa: ERA001
    if isinstance(first, ast.Call):
        name = _call_name(first)
        if name in ("io.BytesIO", "BytesIO"):
            return True

    # sf.write(some_func(...), ...) — check if the function name contains "buffer"
    return bool(isinstance(first, ast.Call) and isinstance(first.func, ast.Name) and "buf" in first.func.id.lower())


def scan_file(filepath: str) -> list[tuple[int, str, str]]:
    """Scan a single Python file for blocking calls in async handlers."""
    try:
        source = Path(filepath).read_text(encoding="utf-8")
        tree = ast.parse(source, filename=filepath)
    except (SyntaxError, UnicodeDecodeError) as exc:
        print(f"  WARNING: could not parse {filepath}: {exc}", file=sys.stderr)
        return []

    source_lines = source.splitlines()
    violations: list[tuple[int, str, str]] = []

    # Walk async functions and collect blocking calls
    for node in ast.walk(tree):
        if not isinstance(node, ast.AsyncFunctionDef):
            continue

        func_name = node.name

        # Skip async_audio wrappers by design
        if "_audio" in func_name and func_name.startswith("async_"):
            continue
        if "_noise" in func_name and func_name.startswith("async_"):
            continue

        # Walk all Call nodes inside this async function, tracking parents
        _scan_node(node, source_lines, filepath, violations)

    return violations


def _scan_node(
    node: ast.AST,
    source_lines: list[str],
    filepath: str,
    violations: list[tuple[int, str, str]],
    parent_stack: list[ast.AST] | None = None,
) -> None:
    """Recursively walk AST nodes, tracking parent context for to_thread detection."""
    if parent_stack is None:
        parent_stack = []

    for child in ast.iter_child_nodes(node):
        child_stack = [*parent_stack, node]

        if isinstance(child, ast.Call):
            name = _call_name(child)
            if name and _is_blocking(name):
                # Skip if inside asyncio.to_thread
                if _is_to_thread_wrapped(child, child_stack):
                    continue
                # Skip sf.read/write to in-memory buffers
                if name in ("sf.read", "soundfile.read", "sf.write", "soundfile.write") and _is_buffer_write(child):
                    continue

                line_text = source_lines[child.lineno - 1].strip() if child.lineno <= len(source_lines) else ""
                violations.append((child.lineno, name, line_text))

        _scan_node(child, source_lines, filepath, violations, child_stack)


def _is_blocking(name: str) -> bool:
    """Check if a call name matches a blocking pattern."""
    if name in ALLOWED_CALLS:
        return False
    if name in BLOCKING_CALLS:
        return True
    return any(name.startswith(pattern) for pattern in BLOCKING_CALLS)


def scan_directory(root: str) -> dict[str, list[tuple[int, str, str]]]:
    """Scan all .py files under root for blocking calls in async handlers."""
    results: dict[str, list[tuple[int, str, str]]] = {}

    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [
            d for d in dirnames if d not in ("__pycache__", ".git", "node_modules", ".mypy_cache", ".ruff_cache")
        ]
        for filename in sorted(filenames):
            if not filename.endswith(".py"):
                continue
            filepath = os.path.join(dirpath, filename)
            violations = scan_file(filepath)
            if violations:
                results[filepath] = violations

    return results


def main() -> int:
    # Force UTF-8 output on Windows
    if hasattr(sys.stdout, "buffer") and sys.stdout.encoding != "utf-8":
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

    root = sys.argv[1] if len(sys.argv) > 1 else "routes"

    if not os.path.isdir(root):
        print(f"ERROR: directory not found: {root}", file=sys.stderr)
        return 2

    print(f"Scanning {root}/ for blocking calls in async handlers...")
    results = scan_directory(root)

    if not results:
        print("PASS: No blocking calls found in async handlers.")
        return 0

    total = sum(len(v) for v in results.values())
    print(f"\nFAIL: {total} violation(s) in {len(results)} file(s):\n")

    for filepath, violations in sorted(results.items()):
        print(f"  {filepath}:")
        for line_no, call_name, line_text in violations:
            print(f"    line {line_no}: {call_name}()")
            if line_text:
                print(f"      {line_text}")
        print()

    print("Fix: wrap blocking calls in asyncio.to_thread() or use async_* wrappers.")
    print("See backend/utils/async_audio.py for examples.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
