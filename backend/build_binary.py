"""
PyInstaller build script for creating standalone Python server binary.

Usage:
    python build_binary.py           # Build default (CPU) server binary
    python build_binary.py --cuda    # Build CUDA-enabled server binary
"""

import argparse
import importlib
import logging
import os
import platform
import sys
from pathlib import Path

import PyInstaller.__main__

logger = logging.getLogger(__name__)


def _remove_typing_backport():
    """Uninstall the ``typing`` backport distribution if installed.

    resemblyzer depends on ``typing``; the only publishable release is
    3.7.4.3, which PyInstaller refuses to freeze ("obsolete backport...
    incompatible with PyInstaller"). Python's stdlib typing covers
    resemblyzer at runtime, so removing the backport is safe.
    """
    import subprocess

    try:
        probe = subprocess.run(
            [sys.executable, "-m", "pip", "show", "typing"],
            capture_output=True,
            text=True,
            check=False,
        )
    except Exception:
        logger.debug("suppressed exception in build_binary.py:typing-probe", exc_info=True)
        return
    if probe.returncode != 0:
        return  # not installed - nothing to do
    logger.info("Uninstalling obsolete 'typing' backport before PyInstaller build")
    subprocess.run(
        [sys.executable, "-m", "pip", "uninstall", "-y", "typing"],
        capture_output=True,
        check=False,
    )


def _filter_missing_deps(args):
    """Drop collect/hidden-import/copy-metadata entries whose target can't be imported.

    Gated by the TWENTYLABS_BUILD_SKIP_MISSING env var. When set (e.g. in an
    offline environment where optional deps like inflect/unidic_lite aren't
    installed), the build skips those targets instead of failing. In CI the
    flag is unset, so missing required deps still fail the build as before.
    """
    skip = set()
    for i, a in enumerate(args):
        if a in ("--collect-all", "--collect-submodules", "--hidden-import", "--copy-metadata") and i + 1 < len(args):
            name = args[i + 1]
            # Repo modules (backend.*) are always present; the build runs
            # from backend/ so they aren't resolvable via importlib here.
            if name.startswith("backend"):
                continue
            try:
                importlib.import_module(name)
            except Exception:
                logger.debug("suppressed exception in build_binary.py:40", exc_info=True)
                skip.add(name)
    if not skip:
        return args
    out = []
    i = 0
    while i < len(args):
        a = args[i]
        if a in ("--collect-all", "--collect-submodules", "--hidden-import", "--copy-metadata") and (
            i + 1 < len(args) and args[i + 1] in skip
        ):
            logger.warning("Skipping missing build dependency: %s", args[i + 1])
            i += 2
            continue
        out.append(a)
        i += 1
    return out


def build_server(cuda=False):
    """Build Python server as standalone binary.

    Args:
        cuda: If True, build with CUDA support and name the binary
              otoyin-server-cuda instead of otoyin-server.
    """
    backend_dir = Path(__file__).parent

    _remove_typing_backport()

    binary_name = "otoyin-server-cuda" if cuda else "otoyin-server"

    # PyInstaller arguments
    # All builds use --onedir (directory of files, not a single .exe).
    # --onefile needs 4-6 GB RAM to pack; --onedir needs ~1 GB.
    pack_mode = "--onedir"
    args = [
        "server.py",  # Use server.py as entry point instead of main.py
        pack_mode,
        "--name",
        binary_name,
    ]

    # Hide console window on Windows only. On macOS/Linux the sidecar needs
    # stdout/stderr for Tauri to capture logs.
    if platform.system() == "Windows":
        args.append("--noconsole")

    # numpy 2.x / torch ABI mismatch fix: install memmove fallback for
    # torch.from_numpy() before the app starts. Runtime hooks run after
    # FrozenImporter is registered so frozen torch/numpy are importable.
    # Paths are passed relative to backend_dir because os.chdir(backend_dir)
    # runs before PyInstaller. Absolute paths would get baked into the
    # generated .spec, breaking reproducible builds on other machines / CI.
    args.extend(
        [
            "--runtime-hook",
            "pyi_rth_numpy_compat.py",
            # Stub torch.compiler.disable before transformers imports
            # flex_attention, which otherwise triggers torch._dynamo →
            # torch._numpy._ufuncs and crashes at module load under
            # PyInstaller. See pyi_rth_torch_compiler_disable.py.
            "--runtime-hook",
            "pyi_rth_torch_compiler_disable.py",
            # Per-module collection overrides (e.g. forcing scipy.stats._distn_infrastructure
            # to bundle .py source alongside .pyc so the runtime hook can source-patch it).
            "--additional-hooks-dir",
            "pyi_hooks",
        ]
    )

    # Add common hidden imports
    args.extend(
        [
            "--hidden-import",
            "backend",
            "--hidden-import",
            "backend.main",
            "--hidden-import",
            "backend.config",
            "--hidden-import",
            "backend.database",
            "--hidden-import",
            "backend.models",
            "--hidden-import",
            "backend.services.profiles",
            "--hidden-import",
            "backend.services.history",
            "--hidden-import",
            "backend.services.tts",
            "--hidden-import",
            "backend.services.transcribe",
            "--hidden-import",
            "backend.utils.platform_detect",
            "--hidden-import",
            "backend.backends",
            "--hidden-import",
            "backend.utils.audio",
            "--hidden-import",
            "backend.utils.cache",
            "--hidden-import",
            "backend.utils.progress",
            "--hidden-import",
            "backend.utils.hf_progress",
            "--hidden-import",
            "backend.services.cuda",
            "--hidden-import",
            "backend.services.effects",
            "--hidden-import",
            "backend.utils.effects",
            "--hidden-import",
            "backend.services.versions",
            "--hidden-import",
            "pedalboard",
            # --- New TTS engine backends (GGUF/ONNX, no torch) ---
            "--hidden-import",
            "backend.backends.zonos_gguf_backend",
            "--hidden-import",
            "backend.backends.parler_tts_gguf_backend",
            "--hidden-import",
            "backend.backends.pocket_tts_backend",
            # whisper.cpp STT backend (GGML, CPU-only, no PyTorch).
            "--hidden-import",
            "backend.backends.whisper_cpp_backend",
            "--hidden-import",
            "pywhispercpp",
            "--hidden-import",
            "fastapi",
            "--hidden-import",
            "uvicorn",
            "--hidden-import",
            "sqlalchemy",
            # librosa uses lazy_loader which generates .pyi stub files at
            # install time and reads them at runtime to discover submodules.
            # --hidden-import alone doesn't bundle the stubs, causing
            # "Cannot load imports from non-existent stub" at runtime.
            "--collect-all",
            "lazy_loader",
            "--collect-all",
            "librosa",
            "--hidden-import",
            "soundfile",
            "--copy-metadata",
            "requests",
            "--copy-metadata",
            "transformers",
            "--copy-metadata",
            "huggingface-hub",
            "--copy-metadata",
            "tokenizers",
            "--copy-metadata",
            "safetensors",
            "--copy-metadata",
            "tqdm",
            "--hidden-import",
            "requests",
            # Fix for pkg_resources and jaraco namespace packages
            "--hidden-import",
            "pkg_resources.extern",
            "--collect-submodules",
            "jaraco",
            # inflect uses typeguard @typechecked which calls inspect.getsource()
            # at import time — needs .py source files, not just .pyc bytecode
            "--collect-all",
            "inflect",
            # Kokoro 82M — REMOVED (bloat). Never auto-install or bundle.
            # kokoro / misaki / language_tags / espeakng_loader / en_core_web_sm
            # / unidic_lite are intentionally NOT bundled. Backend degrades
            # gracefully (501) if kokoro is absent. Use Pocket-TTS / Parler-TTS instead.
            "--hidden-import",
            "loguru",
            # MCP server — Streamable-HTTP endpoint and the 4 21-labs.* tools.
            # FastMCP pulls in a chain of deps (mcp, cyclopts, openapi-pydantic,
            # etc.) that don't auto-discover cleanly under PyInstaller, so we
            # collect them whole. Small compared to torch.
            "--hidden-import",
            "backend.mcp_server",
            "--hidden-import",
            "backend.mcp_server.server",
            "--hidden-import",
            "backend.mcp_server.tools",
            "--hidden-import",
            "backend.mcp_server.context",
            "--hidden-import",
            "backend.mcp_server.resolve",
            "--hidden-import",
            "backend.mcp_server.events",
            "--collect-all",
            "fastmcp",
            "--collect-all",
            "mcp",
            "--hidden-import",
            "sse_starlette",
            # --- Audio cleanup / enhance stack (DeepFilterNet, LavaSR, VAD) ---
            # These services are imported lazily at request time, so
            # PyInstaller's static analysis misses them entirely — the frozen
            # binary then silently skips denoise/enhance features.
            "--hidden-import",
            "backend.services.deepfilter_onnx",
            "--hidden-import",
            "backend.services.noise_reduction",
            "--hidden-import",
            "backend.services.audio_enhancer",
            "--hidden-import",
            "backend.services.streaming_lavasr",
            "--hidden-import",
            "backend.services.vad",
            "--hidden-import",
            "backend.services.reference_voices",
            "--collect-submodules",
            "backend.voice_changer",
            # --- New engine backends loaded lazily by the registry ---
            "--hidden-import",
            "backend.backends.kokoro_onnx_backend",
            "--hidden-import",
            "backend.backends.gguf_server_backend",
            "--hidden-import",
            "backend.backends.orpheus_backend",
            "--hidden-import",
            "backend.backends.neutts_backend",
            # Route auto-discovery (routes/__init__.py) and the engine registry
            # resolve modules via importlib/pkgutil at RUNTIME, which static
            # analysis cannot see — without explicit collection the frozen
            # binary boots with "No module named 'backend.routes.health'" and
            # exits. NOTE: --collect-submodules does NOT cover this layout
            # (verified: top-level route modules missing from PYZ-00.toc), so
            # enumerate the files and pin each as a --hidden-import instead.
            # The pyi_rth_pkgutil runtime hook then also finds them for the
            # iter_modules auto-discovery scan.
            "--collect-submodules",
            "backend.routes",
            "--collect-submodules",
            "backend.routes.assistant_tools",
            "--collect-submodules",
            "backend.routes.audio_pipeline",
            "--collect-submodules",
            "backend.routes.models",
            # Engine backend modules resolve via registry import_module()
            # literals — same invisibility, same fix.
            "--collect-submodules",
            "backend.backends",
            "--collect-submodules",
            "backend.backends.registry",
            # ONNX runtime powers DeepFilter/LavaSR; bundle the provider DLLs.
            # audiosronnx carries the DeepFilter model artifacts. kokoro and
            # faster_whisper/ctranslate2 are REMOVED (bloat) — never bundled.
            # GGUF models are served by the bundled llama-server.exe (no Python llama_cpp).
            "--collect-all",
            "onnxruntime",
            "--collect-all",
            "audiosronnx",
        ]
    )

    # Belt and braces: --collect-submodules misses top-level modules in this
    # layout (verified: backend.routes.health absent from PYZ-00.toc despite
    # the collect lines above), so enumerate every routes/backends .py file
    # and pin each as an explicit --hidden-import. Resolved from __file__
    # (absolute) — backend_dir itself may be relative at this point.
    _enum_root = Path(__file__).resolve().parent
    for _pkg in (
        "backend.routes",
        "backend.routes.assistant_tools",
        "backend.routes.audio_pipeline",
        "backend.routes.models",
        "backend.backends",
        "backend.backends.registry",
    ):
        _pkg_dir = _enum_root / Path(*_pkg.split(".")[1:])
        if not _pkg_dir.is_dir():
            logger.warning("Build package dir missing: %s", _pkg_dir)
            continue
        for _py in sorted(_pkg_dir.glob("*.py")):
            _mod = _pkg if _py.stem == "__init__" else f"{_pkg}.{_py.stem}"
            args.extend(["--hidden-import", _mod])

    # Silero VAD weights: services/vad.py falls back to <bundle>/data/*.onnx
    # in frozen builds. Bundle the file when it exists locally (torch.hub or
    # HF cache); otherwise the bootstrap script fetches it into the HF cache.
    _vad_src = next(
        (
            c
            for c in (
                *Path.home().glob(".cache/torch/hub/snakers4_silero-vad*/src/silero_vad/data/silero_vad_16k_op15.onnx"),
                *Path.home().glob(".cache/huggingface/hub/models--snakers4*silero*vad*/**/silero_vad_16k_op15.onnx"),
            )
            if c.is_file()
        ),
        None,
    )
    # Silero VAD weights: the silero-vad wheel carries its own onnx files;
    # bundle its data dir so services/vad.py's package fallback works frozen.
    args.extend(["--collect-data", "silero_vad"])

    if _vad_src is not None:
        args.extend(["--add-data", f"{_vad_src}{os.pathsep}data"])
        logger.info("Bundling Silero VAD weights from %s", _vad_src)
    else:
        logger.warning("Silero VAD onnx not found locally — run download_required_models first")

    # In-app Help Center catalog (backend/data/app_features.json, force-tracked
    # despite the data/ ignore). Without it the frozen backend serves an empty
    # catalog and Help search goes dark. SRC is absolute (relative --add-data
    # sources resolve against the pre-chdir cwd, not backend_dir).
    _help_catalog_src = backend_dir / "data" / "app_features.json"
    if _help_catalog_src.is_file():
        args.extend(["--add-data", f"{_help_catalog_src}{os.pathsep}backend/data"])
        logger.info("Bundling help catalog from %s", _help_catalog_src)
    else:
        logger.warning("Help catalog %s missing — Help Center will be empty", _help_catalog_src)

    # Marketplace license verifying key (backend/data/marketplace_public_key.txt,
    # force-tracked despite the data/ ignore). services/licensing.py loads it
    # from <bundle>/backend/data when frozen; without it a production build
    # falls back to the dev key and the production check rejects EVERY license.
    _license_pubkey_src = backend_dir / "data" / "marketplace_public_key.txt"
    if _license_pubkey_src.is_file():
        args.extend(["--add-data", f"{_license_pubkey_src}{os.pathsep}backend/data"])
        logger.info("Bundling marketplace public key from %s", _license_pubkey_src)
    else:
        logger.warning(
            "Marketplace public key %s missing — paid licenses will NOT verify in this build",
            _license_pubkey_src,
        )

    # Store test-mode marker (backend/data/store_test_mode.flag): only
    # bin/build-test.ps1 creates it, before the build, and strips it right
    # after — production bundles never carry it. licensing.store_test_mode()
    # honors the flag ONLY when bundled (env vars cannot activate test mode
    # in frozen builds). Absent is the production norm: stay quiet.
    _test_flag_src = backend_dir / "data" / "store_test_mode.flag"
    if _test_flag_src.is_file():
        args.extend(["--add-data", f"{_test_flag_src}{os.pathsep}backend/data"])
        logger.info("TEST BUILD: bundling store test-mode flag from %s", _test_flag_src)

    # In-app content feed (backend/data/content.json: whats-new, banners,
    # offers). _content_dir() looks for <bundle>/data/content.json when
    # frozen; without this the support/content routes fall back to empty
    # defaults (and previously crashed on a missing _DEFAULT_CONTENT).
    _content_src = backend_dir / "data" / "content.json"
    if _content_src.is_file():
        args.extend(["--add-data", f"{_content_src}{os.pathsep}data"])
        logger.info("Bundling content feed from %s", _content_src)
    else:
        logger.warning("Content feed %s missing — support/content routes will be empty", _content_src)

    # Python sources that tool_registry_populate.populate() parses from disk at
    # runtime (ast.parse + exec / regex scan) instead of importing:
    #   * backend/routes/assistant_tools/*.py  -> ENDPOINT_MAP + TOOLS schemas
    #   * backend/mcp_server/tools/*.py         -> @mcp.tool decorator metadata
    # PyInstaller ships bytecode, not .py, so without these the frozen backend
    # raises FileNotFoundError on the first /mcp request, ensure_mcp_built()
    # swallows it, /mcp stays unmounted (404), and the MCP tool surface is dead
    # in the installer while working fine in dev. Even with the first set
    # bundled, the missing mcp_server/tools sources silently truncated the
    # registry from 203 tools to 29 — so both directories are required.
    for _rel in ("routes/assistant_tools", "mcp_server/tools"):
        _src_dir = backend_dir / _rel
        _py_files = sorted(_src_dir.glob("*.py")) if _src_dir.is_dir() else []
        if _py_files:
            for _f in _py_files:
                args.extend(["--add-data", f"{_f}{os.pathsep}backend/{_rel}"])
            logger.info("Bundling %d tool-registry source files from %s", len(_py_files), _src_dir)
        else:
            logger.warning(
                "Tool-registry sources missing at %s — MCP tool surface will be incomplete",
                _src_dir,
            )

    # Plugin manifest schema (backend/plugins/manifest_schema.json).
    # manifest.py resolves it via Path(__file__).with_name(...), which lands
    # at <bundle>/backend/plugins/ when frozen — bundle it there so the
    # plugins-marketplace route imports instead of failing the whole module.
    _plugin_schema_src = backend_dir / "plugins" / "manifest_schema.json"
    if _plugin_schema_src.is_file():
        args.extend(["--add-data", f"{_plugin_schema_src}{os.pathsep}backend/plugins"])
        logger.info("Bundling plugin manifest schema from %s", _plugin_schema_src)
    else:
        logger.warning("Plugin schema %s missing — plugins-marketplace route will be skipped", _plugin_schema_src)

    # YAMNet audio-event classifier (bundled model, ~16 MB). The backend
    # resolves <bundle>/yamnet/ when frozen, <models>/yamnet/ in dev.
    # Fetch once from HF when absent everywhere — weights are never committed
    # (*.onnx is gitignored).
    _yamnet_files = ["yamnet.onnx", "yamnet_class_map.csv"]
    _yamnet_srcs = [backend_dir.parent / "data" / "models" / "yamnet" / f for f in _yamnet_files]
    if not all(p.is_file() for p in _yamnet_srcs):
        try:
            from huggingface_hub import hf_hub_download

            _cached = Path(hf_hub_download(repo_id="audiomagic/yamnet-onnx", filename="yamnet.onnx")).parent
            _yamnet_srcs = [_cached / f for f in _yamnet_files]
        except Exception as exc:
            logger.warning("YAMNet fetch failed (%s) — event detection will be unavailable", exc)
            _yamnet_srcs = []
    if _yamnet_srcs and all(p.is_file() for p in _yamnet_srcs):
        for _src in _yamnet_srcs:
            args.extend(["--add-data", f"{_src}{os.pathsep}yamnet"])
        logger.info("Bundling YAMNet model from %s", _yamnet_srcs[0].parent)
    else:
        logger.warning("YAMNet weights missing — event detection will be unavailable")

    # DeepFilterNet ONNX denoiser (bundled model, ~8.6 MB). The voice
    # changer and audio-cleanup paths need it on a fresh install:
    # services/deepfilter_onnx.py resolves <bundle>/deepfilter/ when frozen
    # and never downloads weights on first use, so without this copy the
    # denoiser is silently skipped for every installer user. Stem separation
    # (Demucs, 300 MB) is deliberately NOT bundled — too large to ship; it
    # stays a first-run download.
    # Source of truth is the app folder (populated by
    # download_required_models.py); HF is only the fallback fetch.
    _deepfilter_src = backend_dir / "data" / "models" / "soniqo--DeepFilterNet3-ONNX" / "deepfilter.onnx"
    if not _deepfilter_src.is_file():
        _deepfilter_src = None
    try:
        if _deepfilter_src is None:
            from huggingface_hub import hf_hub_download

            _deepfilter_src = Path(hf_hub_download(repo_id="soniqo/DeepFilterNet3-ONNX", filename="deepfilter.onnx"))
    except Exception as exc:
        logger.warning("DeepFilterNet fetch failed (%s) — denoise will be unavailable", exc)
    if _deepfilter_src is not None and _deepfilter_src.is_file():
        args.extend(["--add-data", f"{_deepfilter_src}{os.pathsep}deepfilter"])
        logger.info("Bundling DeepFilterNet ONNX from %s", _deepfilter_src)
    else:
        logger.warning("DeepFilterNet weights missing — denoise will be unavailable")

    # Add CUDA-specific hidden imports
    if cuda:
        logger.info("Building with CUDA support")
        args.extend(
            [
                "--hidden-import",
                "torch.cuda",
                "--hidden-import",
                "torch.backends.cudnn",
            ]
        )
    else:
        # Exclude NVIDIA CUDA packages from CPU-only builds to keep binary small.
        # When building from a venv with CUDA torch installed, PyInstaller would
        # bundle ~3GB of NVIDIA shared libraries. We exclude both the Python
        # modules and the binary DLLs.
        nvidia_packages = [
            "nvidia",
            "nvidia.cublas",
            "nvidia.cuda_cupti",
            "nvidia.cuda_nvrtc",
            "nvidia.cuda_runtime",
            "nvidia.cudnn",
            "nvidia.cufft",
            "nvidia.curand",
            "nvidia.cusolver",
            "nvidia.cusparse",
            "nvidia.nccl",
            "nvidia.nvjitlink",
            "nvidia.nvtx",
        ]
        for pkg in nvidia_packages:
            args.extend(["--exclude-module", pkg])

        # Bloat exclusion — kokoro + faster-whisper must NEVER be bundled.
        # Requirements intentionally do not include them; this guarantees
        # the frozen binary never pulls them even if present in the venv.
        # Same treatment for the other heavy optionals: the collect-submodules
        # lines above would otherwise drag them in, and every one of these
        # degrades gracefully (501/degraded path) when absent — exactly like
        # a venv without the optional installed.
        for pkg in [
            "kokoro",
            "misaki",
            "faster_whisper",
            "ctranslate2",
            "av",
            "language_tags",
            "espeakng_loader",
            "en_core_web_sm",
            "unidic_lite",
            "unidic",
            "demucs",
            "julius",
            "lameenc",
            "sphn",
            "argostranslate",
            "stanza",
            # NOTE: do NOT add numba or llvmlite here, despite llvmlite looking
            # like 115 MB of dead weight. librosa/core/audio.py does a
            # module-level `from numba import guvectorize, jit, stencil`, so
            # excluding numba makes librosa.load() raise ModuleNotFoundError
            # and 500s every audio route in the packaged app — while the dev
            # server keeps passing, because dev has numba installed. Verified
            # against the frozen binary on 2026-10-03; pinned by
            # backend/tests/test_release_audit_regressions.py
            # ::test_librosa_load_requires_numba_so_bundle_must_keep_it
        ]:
            args.extend(["--exclude-module", pkg])

    if not cuda:
        logger.info("Building for non-CUDA platform - PyTorch only")

    dist_dir = str(backend_dir / "dist")
    build_dir = str(backend_dir / "build")

    args.extend(
        [
            "--distpath",
            dist_dir,
            "--workpath",
            build_dir,
            "--noconfirm",
            "--clean",
        ]
    )

    # Change to backend directory
    os.chdir(backend_dir)

    # For CPU builds on Windows, ensure we're using CPU-only torch.
    # If CUDA torch is installed (local dev), swap to CPU torch before building,
    # then restore CUDA torch after. This prevents PyInstaller from bundling
    # ~3GB of CUDA DLLs into the CPU binary.
    restore_cuda = False
    original_cuda_tag = None
    if not cuda and platform.system() == "Windows":
        import subprocess

        result = subprocess.run(
            [sys.executable, "-c", "import torch; print(torch.version.cuda or '')"], capture_output=True, text=True
        )
        has_cuda_torch = bool(result.stdout.strip())
        if has_cuda_torch:
            # Save the original CUDA version for restore (e.g. "12.6" → "cu126")
            original_cuda = result.stdout.strip()
            cuda_parts = original_cuda.split(".")[:2]
            original_cuda_tag = f"cu{''.join(cuda_parts)}"
            logger.info("CUDA torch detected (%s) — installing CPU torch for CPU build...", original_cuda)
            subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "pip",
                    "install",
                    "torch",
                    "torchvision",
                    "torchaudio",
                    "--index-url",
                    "https://download.pytorch.org/whl/cpu",
                    "--force-reinstall",
                    "-q",
                ],
                check=True,
            )
            restore_cuda = True

    # Run PyInstaller
    if os.environ.get("TWENTYLABS_BUILD_SKIP_MISSING"):
        args = _filter_missing_deps(args)
    try:
        PyInstaller.__main__.run(args)
    finally:
        # Restore CUDA torch if we swapped it out (even on build failure)
        if restore_cuda:
            logger.info("Restoring CUDA torch...")
            import subprocess

            # Restore to the same CUDA version that was installed before the build
            restore_index = f"https://download.pytorch.org/whl/{original_cuda_tag}"
            subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "pip",
                    "install",
                    "torch",
                    "torchvision",
                    "torchaudio",
                    "--index-url",
                    restore_index,
                    "--force-reinstall",
                    "-q",
                ],
                check=True,
            )

    logger.info("Binary built in %s", backend_dir / "dist" / binary_name)


def build_shim():
    """Build the otoyin-mcp stdio shim as a tiny standalone binary.

    This is the bridge for MCP clients that only speak stdio — it proxies
    JSON-RPC to the main otoyin-server's /mcp endpoint. Keep it small: no
    torch, no ML deps, just httpx + asyncio.
    """
    backend_dir = Path(__file__).parent

    _remove_typing_backport()

    args = [
        "mcp_shim/__main__.py",
        "--onefile",
        "--name",
        "otoyin-mcp",
        # Stdio-only — no console hiding needed on Windows since the parent
        # MCP client is spawning this as a child process and wants stdio.
        "--hidden-import",
        "backend.mcp_shim",
        "--hidden-import",
        "backend.mcp_shim.__main__",
        "--hidden-import",
        "httpx",
        "--hidden-import",
        "httpx._transports.default",
        "--hidden-import",
        "anyio",
        # Exclude everything heavy that httpx/asyncio don't actually need so
        # the binary stays tiny (~15 MB instead of ~400 MB).
        "--exclude-module",
        "torch",
        "--exclude-module",
        "transformers",
        "--exclude-module",
        "zipvoice",
        "--exclude-module",
        "kokoro",
        "--exclude-module",
        "misaki",
        "--exclude-module",
        "spacy",
        "--exclude-module",
        "librosa",
        "--exclude-module",
        "numba",
        "--exclude-module",
        "numpy",
        "--exclude-module",
        "pedalboard",
        "--exclude-module",
        "fastapi",
        "--exclude-module",
        "uvicorn",
        "--exclude-module",
        "sqlalchemy",
        "--exclude-module",
        "fastmcp",
        "--exclude-module",
        "mcp",
    ]

    dist_dir = str(backend_dir / "dist")
    build_dir = str(backend_dir / "build")
    args.extend(
        [
            "--distpath",
            dist_dir,
            "--workpath",
            build_dir,
            "--noconfirm",
            "--clean",
        ]
    )

    os.chdir(backend_dir)
    PyInstaller.__main__.run(args)
    logger.info("Shim built: %s", backend_dir / "dist" / "otoyin-mcp")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build otoyin binaries")
    parser.add_argument(
        "--cuda",
        action="store_true",
        help="Build CUDA-enabled binary (otoyin-server-cuda)",
    )
    parser.add_argument(
        "--shim",
        action="store_true",
        help="Build the otoyin-mcp stdio shim binary instead of the server",
    )
    cli_args = parser.parse_args()
    if cli_args.shim:
        build_shim()
    else:
        build_server(cuda=cli_args.cuda)
