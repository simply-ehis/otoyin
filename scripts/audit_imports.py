"""One-off audit: broken internal imports + unused/missing deps."""

import ast
from pathlib import Path

repo = Path(__file__).resolve().parent.parent
root = repo / "backend"
errors = []


def resolve(mod: str, level: int, src_file: Path):
    """Resolve an import target; return True if it exists."""
    if level > 0:
        # relative: walk up from the file's package dir (level-1 extra ups)
        base = src_file.parent
        for _ in range(level - 1):
            base = base.parent
        rel = mod.replace(".", "/") if mod else ""
        cand = base / rel if rel else base
    else:
        if not mod.startswith("backend"):
            return True  # external/stdlib — skip
        rel = mod.split(".", 1)[1] if "." in mod else ""
        cand = root / rel.replace(".", "/")
    return (
        cand.with_suffix(".py").exists()
        or (cand / "__init__.py").exists()
        or cand.is_dir()
    )


for p in root.rglob("*.py"):
    parts = p.parts
    if "venv" in parts or "__pycache__" in parts or "build" in parts or "dist" in parts:
        continue
    try:
        tree = ast.parse(
            p.read_text(encoding="utf-8", errors="ignore"), filename=str(p)
        )
    except SyntaxError as e:
        errors.append(f"{p}: SYNTAX ERROR {e}")
        continue
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            if not resolve(node.module or "", node.level or 0, p):
                errors.append(
                    f"{p}:{node.lineno}: broken -> {'.' * node.level}{node.module}"
                )
        elif isinstance(node, ast.Import):
            for a in node.names:
                if a.name.startswith("backend") and not resolve(a.name, 0, p):
                    errors.append(f"{p}:{node.lineno}: broken -> {a.name}")

print(f"=== BROKEN INTERNAL IMPORTS ({len(errors)}) ===")
for e in errors[:60]:
    print(" ", e)

# --- deps audit ---
req_file = root / "requirements.txt"
declared = set()
for line in req_file.read_text().splitlines():
    line = line.strip()
    if line and not line.startswith("#"):
        pkg = (
            line.split(";")[0]
            .split("==")[0]
            .split(">=")[0]
            .split("<")[0]
            .split("[")[0]
            .strip()
        )
        declared.add(pkg.lower())

# pip-name -> import-name(s); first match wins
pip_to_imports = {
    "pillow": {"pil"},
    "scikit-learn": {"sklearn"},
    "pyyaml": {"yaml"},
    "beautifulsoup4": {"bs4"},
    "python-dotenv": {"dotenv"},
    "python-multipart": set(),  # fastapi form runtime dep — never imported directly
    "llama-cpp-python": {"llama_cpp"},
    "faster-whisper": {"faster_whisper"},
    "parler-tts": {"parler_tts"},
    "pocket-tts": {"pocket_tts"},
    "silero-vad": {"silero_vad"},
    "webrtcvad-wheels": {"webrtcvad"},
    "sse-starlette": {"sse_starlette"},
    "yt-dlp": {"yt_dlp"},
    "onnxruntime-coreml": set(),  # mac provider extra
    "fish-speech": set(),
    "misaki": {"misaki"},
    "pymupdf": {"fitz", "pymupdf"},
    "accelerate": {"accelerate"},
    "numba": {"numba"},
}

imported_modules = set()
for p in root.rglob("*.py"):
    if "venv" in p.parts or "__pycache__" in p.parts:
        continue
    try:
        tree = ast.parse(p.read_text(encoding="utf-8", errors="ignore"))
    except SyntaxError:
        continue
    for node in ast.walk(tree):
        mods = []
        if isinstance(node, ast.ImportFrom) and node.module:
            mods.append(node.module)
        elif isinstance(node, ast.Import):
            mods = [a.name for a in node.names]
        for m in mods:
            imported_modules.add(m.split(".")[0].lower())
    src = p.read_text(encoding="utf-8", errors="ignore")
    for tok in ("__import__(", "import_module('", 'import_module("'):
        idx = 0
        while True:
            i = src.find(tok, idx)
            if i == -1:
                break
            j = src.find(tok[-1], i + len(tok))
            if j != -1:
                imported_modules.add(src[i + len(tok) : j].split(".")[0].lower())
            idx = i + 1

stdlib_like = {
    "os",
    "sys",
    "json",
    "re",
    "time",
    "logging",
    "asyncio",
    "pathlib",
    "typing",
    "datetime",
    "collections",
    "itertools",
    "functools",
    "contextlib",
    "dataclasses",
    "enum",
    "abc",
    "io",
    "base64",
    "hashlib",
    "uuid",
    "random",
    "math",
    "threading",
    "subprocess",
    "shutil",
    "tempfile",
    "socket",
    "struct",
    "signal",
    "traceback",
    "warnings",
    "inspect",
    "importlib",
    "urllib",
    "http",
    "email",
    "unittest",
    "sqlite3",
    "csv",
    "textwrap",
    "copy",
    "string",
    "argparse",
    "glob",
    "platform",
    "ctypes",
    "wave",
    "array",
    "types",
    "multiprocessing",
    "queue",
    "secrets",
    "zipfile",
    "xml",
    "html",
    "ast",
    "__future__",
    "builtins",
    "statistics",
    "difflib",
    "shlex",
    "fnmatch",
    "weakref",
    "gc",
    "atexit",
    "codecs",
    "numbers",
    "operator",
    "heapq",
    "calendar",
    "zoneinfo",
    "tomllib",
    "concurrent",
    "contextvars",
}
internal_tops = {"backend"} | {
    d.name.lower()
    for d in root.iterdir()
    if d.is_dir() and not d.name.startswith((".", "_"))
}

used_external = {
    m
    for m in imported_modules
    if m.lower() not in stdlib_like and m.lower() not in internal_tops
}

never_used = sorted(
    d
    for d in declared
    if not any(
        imp in used_external for imp in pip_to_imports.get(d, {d.replace("-", "_")})
    )
)
missing = sorted(
    m
    for m in used_external
    if m.lower()
    not in {imp.lower() for imps in pip_to_imports.values() for imp in imps}
    and m.lower() not in {d.replace("-", "_").lower() for d in declared}
)

print(f"\n=== DECLARED BUT NEVER IMPORTED ({len(never_used)}) ===")
for pkg in never_used:
    print(" ", pkg)
print(f"\n=== IMPORTED BUT NOT DECLARED ({len(missing)}) ===")
for m in missing[:40]:
    print(" ", m)
