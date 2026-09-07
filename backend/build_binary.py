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
            # --- New TTS engine backends (Phase 1/2 consolidation) ---
            # kokoro_backend REMOVED (bloat) — never bundled
            "--hidden-import",
            "backend.backends.zonos_backend",
            "--hidden-import",
            "backend.backends.pocket_tts_backend",
            "--hidden-import",
            "backend.backends.parler_tts_backend",
            "--hidden-import",
            "torch",
            "--hidden-import",
            "transformers",
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
        for pkg in [
            "kokoro",
            "misaki",
            "faster_whisper",
            "ctranslate2",
            "language_tags",
            "espeakng_loader",
            "en_core_web_sm",
            "unidic_lite",
            "unidic",
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
        "typing",  # obsolete backport, conflicts with PyInstaller
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
