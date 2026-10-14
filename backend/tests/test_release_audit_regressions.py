"""Regression tests for bugs found in the 2026-10 release audit.

Each test here pins a bug that actually shipped and was fixed, so a future
refactor cannot silently reintroduce it:

1. ``test_static_route_not_shadowed_by_catchall`` — FastAPI matches routes in
   declaration order. ``/audiobooks/{book_id}`` was registered before the static
   ``/audiobooks/formats`` and ``/audiobooks/cached-engines``, so both static
   paths were swallowed by the catch-all and returned 404 on a book lookup.
   That broke the audiobook render engine list and the export-format picker.

2. ``test_ogg_conversion_uses_quality_mode`` — libvorbis is a VBR codec and
   refuses to open the encoder for arbitrary bitrates ("Error while opening
   encoder" for ``-b:a 128k``), so ogg export silently produced nothing. It must
   use ``-q:a`` quality mode instead.

3. ``test_every_supported_format_converts`` — end-to-end proof that every format
   advertised by ``SUPPORTED_FORMATS`` actually produces non-empty audio, so the
   advertised list can never drift from what ffmpeg can really write.

4. ``test_librosa_load_requires_numba_so_bundle_must_keep_it`` — numba and
   llvmlite (115 MB) were dropped from the frozen bundle on the strength of a
   probe that only exercised ``librosa.resample``. It never called
   ``librosa.load``, which is what the app actually uses. Dev kept passing while
   the packaged app 500'd on every audio route — the worst possible split, since
   dev has numba installed and the bundle does not.

Tests requiring the ``ffmpeg`` binary skip cleanly when it is absent, so the suite
stays green on machines without it (CI, dev laptops).
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from backend.services import audio_conversion as ac, dubbing

REPO = Path(__file__).resolve().parents[2]
_FFMPEG_EXE = "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg"


def _bundled_ffmpeg() -> str | None:
    """Locate an ffmpeg for the ffmpeg-backed tests.

    `ffmpeg_path()` only knows about PATH and the frozen layout, so in a dev
    checkout it returns None even though the repo ships a working ffmpeg at
    `tauri/src-tauri/binaries/ffmpeg/bin/`. Those tests therefore skipped on
    every dev machine. Resolve the way packaging does (bundled included) so
    they actually run.

    OTOYIN_FFMPEG overrides, exactly as it does at runtime.
    """
    if ac.ffmpeg_available():
        return ac.ffmpeg_path()
    override = os.environ.get("OTOYIN_FFMPEG")
    if override and Path(override).is_file():
        return override
    for candidate in (
        REPO / "tauri" / "src-tauri" / "binaries" / "ffmpeg" / "bin" / _FFMPEG_EXE,
        REPO / "data" / "ffmpeg" / "bin" / _FFMPEG_EXE,
    ):
        if candidate.is_file():
            return str(candidate)
    return None


requires_ffmpeg = pytest.mark.skipif(
    _bundled_ffmpeg() is None,
    reason="no ffmpeg available (PATH, OTOYIN_FFMPEG, or bundled) - conversion tests cannot run",
)

pytestmark = pytest.mark.filterwarnings("ignore::DeprecationWarning")


@pytest.fixture(autouse=True)
def _clear_ffmpeg_cache():
    """ffmpeg_path() is lru_cached process-wide; isolate it per test.

    Without this, whichever test resolves first pins the path for every later
    test, so monkeypatched OTOYIN_FFMPEG values would be ignored. Also points
    the app at the bundled ffmpeg so the tests exercise the same resolver the
    packaged app uses.
    """
    bundled = _bundled_ffmpeg()
    if bundled and not os.environ.get("OTOYIN_FFMPEG"):
        os.environ["OTOYIN_FFMPEG"] = bundled
    _prev = os.environ.get("OTOYIN_FFMPEG")
    ac.ffmpeg_cache_clear()
    yield
    ac.ffmpeg_cache_clear()
    if _prev is None:
        os.environ.pop("OTOYIN_FFMPEG", None)
    else:
        os.environ["OTOYIN_FFMPEG"] = _prev


# ── 1. Route shadowing ─────────────────────────────────────────────────────


def _paths() -> list[str]:
    from backend.routes import audiobooks

    return [r.path for r in audiobooks.router.routes]


def test_static_route_not_shadowed_by_catchall():
    """Static /audiobooks sub-paths must be declared before /audiobooks/{book_id}.

    Starlette resolves in registration order, so a static path registered after
    the catch-all is unreachable — the catch-all claims it and 404s.
    """
    paths = _paths()
    catchall = "/audiobooks/{book_id}"

    for static in ("/audiobooks/formats", "/audiobooks/cached-engines"):
        assert static in paths, f"{static} is not registered at all"
        assert paths.index(static) < paths.index(catchall), (
            f"{static} is declared AFTER {catchall} and will be shadowed by it (returns 404 instead of its own handler)"
        )


# ── ffmpeg-backed conversion tests ─────────────────────────────────────────


def _bundled_ffmpeg() -> str | None:
    """Locate an ffmpeg for the ffmpeg-backed tests.

    `ffmpeg_path()` only knows about PATH and the frozen layout, so in a dev
    checkout it returns None even though the repo ships a fully working ffmpeg
    at `tauri/src-tauri/binaries/ffmpeg/bin/`. Those tests were silently
    skipping on every dev machine. Resolve the same way the packaging does
    (bundled first) so they actually run.

    Set OTOYIN_FFMPEG to override, exactly as the app does at runtime.
    """
    if ac.ffmpeg_available():
        return ac.ffmpeg_path()
    override = os.environ.get("OTOYIN_FFMPEG")
    if override and Path(override).is_file():
        return override
    for candidate in (
        REPO / "tauri" / "src-tauri" / "binaries" / "ffmpeg" / "bin" / _FFMPEG_EXE,
        REPO / "data" / "ffmpeg" / "bin" / _FFMPEG_EXE,
    ):
        if candidate.is_file():
            return str(candidate)
    return None


_FFMPEG_EXE = "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg"
requires_ffmpeg = pytest.mark.skipif(
    _bundled_ffmpeg() is None,
    reason="no ffmpeg available (PATH, OTOYIN_FFMPEG, or bundled) - conversion/export tests cannot run",
)


@pytest.fixture
def tone_wav(tmp_path):
    """A 1s 440Hz WAV — real audio, not silence, so encoders do no shortcut."""
    path = tmp_path / "tone.wav"
    t = np.linspace(0, 440 * np.pi * 2, 24000, dtype="float32")
    sf.write(path, (np.sin(t) * 0.3).astype("float32"), 24000)
    return path


@requires_ffmpeg
def test_every_supported_format_converts(tone_wav):
    """Every advertised format must produce a real, non-empty file."""
    failures = []
    for fmt in ac.SUPPORTED_FORMATS:
        try:
            out = ac.convert_audio_file(tone_wav, fmt)
            size = out.stat().st_size
            if size < 512:
                failures.append(f"{fmt}: produced only {size} bytes")
        except Exception as exc:  # report every failure, not just the first
            failures.append(f"{fmt}: {exc}")
    assert not failures, "conversion failures:\n  " + "\n  ".join(failures)


@requires_ffmpeg
def test_ogg_conversion_uses_quality_mode(tone_wav):
    """ogg must be VBR (quality mode) — libvorbis rejects arbitrary bitrates.

    Regression: ogg was passed ``-b:a 128k`` like every other format, which made
    ffmpeg fail to open the encoder and write nothing.
    """
    assert "ogg" not in ac._BITRATE_FORMATS, (
        "ogg must not be encoded with -b:a; libvorbis is VBR and fails on arbitrary bitrates"
    )
    out = ac.convert_audio_file(tone_wav, "ogg")
    assert out.stat().st_size > 512, f"ogg output suspiciously small: {out.stat().st_size} bytes"
    info = sf.info(str(out))
    assert info.duration > 0.5, f"ogg duration looks wrong: {info.duration}"


@requires_ffmpeg
def test_bitrate_still_applies_to_cbr_formats(tone_wav):
    """The ogg fix must not have silently dropped -b:a from the CBR formats."""
    assert {"mp3", "m4a", "m4b", "opus"}.issubset(ac._BITRATE_FORMATS)
    out = ac.convert_audio_file(tone_wav, "mp3", bitrate="64k")
    assert out.stat().st_size > 512


@requires_ffmpeg
def test_build_m4b_produces_playable_audiobook(tmp_path, tone_wav):
    """Two chapters -> one .m4b (the Audible-style audiobook export path).

    Probed with ffprobe, not soundfile: m4b is AAC-in-MP4, which libsndfile
    cannot open.
    """
    chapters = []
    for i in range(2):
        p = tmp_path / f"ch{i}.wav"
        t = np.linspace(0, (440 + i * 220) * np.pi * 2, 12000, dtype="float32")
        sf.write(p, (np.sin(t) * 0.3).astype("float32"), 24000)
        chapters.append(p)

    out = tmp_path / "book.m4b"
    ac.build_m4b(chapters, ["Chapter One", "Chapter Two"], out, title="Test Book", author="21labs")
    assert out.exists() and out.stat().st_size > 512

    probe_bin = dubbing._which_ffprobe()
    assert probe_bin, "ffprobe unavailable (bundled alongside ffmpeg?)"
    probe = subprocess.run(
        [
            probe_bin,
            "-v",
            "error",
            "-show_entries",
            "format=duration,format_name",
            "-of",
            "default=noprint_wrappers=1:nokey=0",
            str(out),
        ],
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert probe.returncode == 0, f"ffprobe could not read the m4b: {probe.stderr[:300]}"
    assert "mp4" in probe.stdout.lower(), f"unexpected container: {probe.stdout}"
    dur = next(
        (float(line.split("=")[1]) for line in probe.stdout.splitlines() if line.startswith("duration=")),
        0.0,
    )
    assert dur > 0.9, f"expected ~2s of audio, got {dur}"


@requires_ffmpeg
def test_build_m4b_rejects_empty_chapter_list(tmp_path):
    with pytest.raises(ValueError):
        ac.build_m4b([], [], tmp_path / "empty.m4b")


def test_convert_rejects_unsupported_format(tone_wav):
    with pytest.raises(ValueError, match="Unsupported format"):
        ac.convert_audio_file(tone_wav, "aiff-not-real")


def test_convert_rejects_bitrate_injection(tone_wav):
    """Bitrate is interpolated into the ffmpeg argv — must be validated."""
    with pytest.raises(ValueError, match="Invalid bitrate"):
        ac.convert_audio_file(tone_wav, "mp3", bitrate="128k -y /etc/passwd")


def test_convert_missing_input_raises():
    with pytest.raises(FileNotFoundError):
        ac.convert_audio_file("nope-does-not-exist.wav", "mp3")


# ── Bundled-ffmpeg resolution (install safety) ────────────────────────────


def test_ffmpeg_resolver_prefers_env_override(monkeypatch, tmp_path):
    """OTOYIN_FFMPEG must win — that is how a custom install is pointed at ffmpeg."""
    fake = tmp_path / "my-ffmpeg.exe"
    fake.write_text("stub")
    monkeypatch.setenv("OTOYIN_FFMPEG", str(fake))
    ac.ffmpeg_cache_clear()
    assert ac.ffmpeg_path() == str(fake)


def test_ffmpeg_resolver_ignores_bad_override(monkeypatch, tmp_path):
    """A stale override path must not shadow a working ffmpeg."""
    monkeypatch.setenv("OTOYIN_FFMPEG", str(tmp_path / "does-not-exist.exe"))
    ac.ffmpeg_cache_clear()
    # Falls through to PATH resolution rather than returning the bogus path.
    resolved = ac.ffmpeg_path()
    assert resolved is None or Path(resolved).is_file()


def test_ffmpeg_resolver_finds_sibling_of_bundle(tmp_path, monkeypatch):
    """A frozen install ships ffmpeg beside the server; the resolver must find it.

    Simulates the bundle layout: <root>/otoyin-server/ and <root>/ffmpeg/bin/.
    """
    root = tmp_path / "resources"
    bin_dir = root / "ffmpeg" / "bin"
    bin_dir.mkdir(parents=True)
    stub = bin_dir / ("ffmpeg.exe" if sys.platform == "win32" else "ffmpeg")
    stub.write_text("stub")
    server_dir = root / "otoyin-server"
    server_dir.mkdir()

    monkeypatch.setenv("OTOYIN_FFMPEG", "")
    monkeypatch.setattr(ac, "_candidate_dirs", lambda: [server_dir, bin_dir])
    monkeypatch.setattr(ac.shutil, "which", lambda _n: None)
    ac.ffmpeg_cache_clear()

    assert ac.ffmpeg_path() == str(stub)
    assert ac.ffmpeg_available() is True


def test_every_ffmpeg_callsite_uses_resolver():
    """No module may shell out to a bare "ffmpeg" — that misses the bundled copy.

    Guards the class of bug where a new call site is added that only works when
    the user happens to have ffmpeg installed system-wide. Scoped to the modules
    that actually shell out, so the test stays fast.
    """
    import re

    backend = Path(ac.__file__).resolve().parent.parent
    modules = [
        "services/audio_conversion.py",
        "services/audiobook_render.py",
        "services/extended_import.py",
        "services/dubbing.py",
        "routes/audiobooks.py",
    ]
    offenders = []
    for rel in modules:
        src = (backend / rel).read_text(encoding="utf-8")
        for m in re.finditer(r"""\[\s*["']ffmpeg["']""", src):
            offenders.append(f"{rel}:{src[: m.start()].count(chr(10)) + 1}")
    assert not offenders, "bare 'ffmpeg' argv literal(s) found — use ffmpeg_path():\n  " + "\n  ".join(offenders)


# ── Model quantization honesty ────────────────────────────────────────────


def test_librosa_load_requires_numba_so_bundle_must_keep_it():
    """numba/llvmlite must stay in the frozen bundle — librosa.load needs numba.

    Regression (caught 2026-10-03): numba + llvmlite were excluded from the
    PyInstaller bundle because an earlier probe showed `librosa.resample` and
    `feature.rms` working without them. That probe was incomplete — it never
    called `librosa.load`, which backend/utils/audio.py uses for every audio
    load. `librosa.core.audio` does a module-level
    `from numba import guvectorize, jit, stencil`, so excluding numba turns
    librosa.load into ModuleNotFoundError and 500s every audio route in the
    packaged app while the dev server (numba installed) keeps working.

    This test pins both halves of that contract so the exclusion cannot be
    reintroduced on the strength of a partial probe.
    """
    build_script = Path(ac.__file__).resolve().parent.parent / "build_binary.py"
    text = build_script.read_text(encoding="utf-8")

    # Scope to build_server() only. build_shim() is the tiny MCP stdio proxy
    # (httpx + asyncio, ~19 MB) and *should* keep excluding numba/llvmlite —
    # it never touches librosa. Only the full server must carry them.
    start = text.index("def build_server(")
    end = text.index("def build_shim(")
    server_args = text[start:end]

    for banned in ("numba", "llvmlite"):
        assert f'"{banned}",' not in server_args, (
            f"build_server() excludes {banned!r}; librosa.core.audio imports numba "
            "at module level, so this breaks librosa.load() in the frozen app"
        )

    # Sanity: the shim is still allowed to drop them.
    assert '"numba",' in text[end:], "build_shim() should keep excluding numba"

    # 2. librosa.load genuinely needs numba — assert the import edge exists so
    #    the reason above stays true if librosa is ever upgraded.
    probe = subprocess.run(
        [
            sys.executable,
            "-c",
            "import librosa.core.audio as a, inspect, sys; "
            "src = inspect.getsource(a); "
            "sys.exit(0 if 'numba' in src else 1)",
        ],
        capture_output=True,
        text=True,
        timeout=180,
    )
    assert probe.returncode == 0, (
        "librosa.core.audio no longer references numba — the exclusion may now be "
        "safe, but re-verify with a frozen-binary smoke test before removing it"
    )


def test_kokoro_local_names_match_precision_resolver():
    """Kokoro variant filenames must use the resolver's underscore convention.

    Regression: the local name was derived by slicing '.onnx' off the release
    filename, but the stem 'kokoro-v1.0' itself ends in '.0' — so the slice left
    'kokoro-v1.0.int8.onnx' (dot) instead of 'kokoro-v1.0_int8.onnx' (underscore),
    and resolve_session_path() never found the downloaded file. It silently fell
    back to the 326 MB fp32 mirror.
    """
    from backend.backends.kokoro_onnx_backend import KOKORO_ONNX_VARIANTS

    stem = "kokoro-v1.0"
    names = {local for _release, local, _size in KOKORO_ONNX_VARIANTS}
    assert names == {
        "kokoro-v1.0_int8.onnx",
        "kokoro-v1.0_fp16.onnx",
        "kokoro-v1.0.onnx",
    }, f"unexpected local variant names: {sorted(names)}"

    # Every local name must be one the resolver would actually probe.
    for local in names:
        assert local in (f"{stem}.onnx", f"{stem}_int8.onnx", f"{stem}_fp16.onnx"), (
            f"{local} is not a filename resolve_session_path() looks for"
        )


def test_kokoro_variant_ladder_is_ordered_smallest_first():
    """int8 must be attempted before fp16/fp32 so users get the smallest graph."""
    from backend.backends.kokoro_onnx_backend import KOKORO_ONNX_VARIANTS

    sizes = [size for _r, _l, size in KOKORO_ONNX_VARIANTS]
    assert sizes == sorted(sizes), f"variant ladder not smallest-first: {sizes}"
    assert KOKORO_ONNX_VARIANTS[0][1].endswith("_int8.onnx"), "first choice must be int8"


def test_kokoro_config_advertises_downloaded_size():
    """Declared size_mb must match the graph we actually fetch.

    Regression: the config claimed int8 while the only reachable source was the
    fp32 mirror (326 MB), understating the download by ~212 MB.
    """
    from backend.backends.configs.tts import _get_tts_configs

    kokoro = [c for c in _get_tts_configs() if c.model_name == "kokoro-onnx"]
    assert kokoro, "kokoro-onnx config missing"
    cfg = kokoro[0]
    assert cfg.quant == "int8", f"expected int8, got {cfg.quant!r}"
    # int8 graph is 114,119,327 bytes; allow a little slack for rounding.
    assert 100 <= cfg.size_mb <= 130, f"size_mb={cfg.size_mb} does not match the int8 graph (~114 MB)"


def test_parakeet_sizes_are_not_inverted():
    """f16 must not be declared smaller than q8 — both were understated.

    Ground truth (mudler/parakeet-cpp-gguf):
      tdt-0.6b-v3-f16.gguf    1,441,046,400 B (~1375 MB)
      tdt-0.6b-v3-q8_0.gguf    940,663,680 B (~897 MB)
    """
    from backend.backends.configs.stt import _get_parakeet_configs

    by_name = {c.model_name: c for c in _get_parakeet_configs()}
    q8 = by_name.get("parakeet-v3-q8")
    f16 = by_name.get("parakeet-v3-f16")
    assert q8 and f16, "parakeet configs missing"

    assert f16.size_mb > q8.size_mb, (
        f"f16 ({f16.size_mb} MB) must be larger than q8 ({q8.size_mb} MB) — f16 is 16-bit, q8 is 8-bit"
    )
    # Sanity-bound both against the published sizes.
    assert 850 <= q8.size_mb <= 950, f"parakeet-v3-q8 size_mb={q8.size_mb}, expected ~897"
    assert 1300 <= f16.size_mb <= 1450, f"parakeet-v3-f16 size_mb={f16.size_mb}, expected ~1375"


# Quant claims verified against the upstream repos on 2026-10-02. Each entry is
# (model_name, repo, claimed_quant, note). real_quant=None means the source we
# actually fetch has no quantized graph, so the config must not claim one —
# claiming int8/Q8_0 when only fp32 exists misreports both download size and RAM.
_VERIFIED_QUANT_SOURCES: dict[str, tuple[str, str | None, str]] = {
    "kokoro-onnx": (
        "thewh1teagle/kokoro-onnx (GitHub release)",
        "int8",
        "int8/fp16/fp32 all published; backend prefers int8 with fp32 fallback",
    ),
    "kitten-tts-mini": ("KittenML/kitten-tts-mini-0.8", None, "mini has no int8; only nano-0.8-int8 exists"),
    "moss-tts-nano": ("OpenMOSS-Team/MOSS-TTS-Nano-100M-ONNX", None, "reference export ships no int8 graphs"),
    "stable-audio-open-1.0": ("StabilityAI/stable-audio-open-1.0", None, "fp32/bf16 safetensors only"),
    "stable-audio-3-small-sfx": ("stabilityai/stable-audio-open-small", None, "no GGUF/Q8_0 published"),
    "pocket-tts-onnx": ("KevinAHM/pocket-tts-onnx", "int8", "genuine _int8.onnx variants exist"),
}


def test_no_false_quant_claims():
    """Models whose upstream ships no quantized graph must not claim one.

    Regression class found in the 2026-10 audit: several configs advertised
    int8/Q8_0 while the only reachable artefact was an fp32 checkpoint.
    """
    from backend.backends import get_all_model_configs

    by_name = {c.model_name: c for c in get_all_model_configs()}
    offenders = []
    for name, (_repo, real_quant, note) in _VERIFIED_QUANT_SOURCES.items():
        cfg = by_name.get(name)
        if cfg is None:
            continue
        if real_quant is None and cfg.quant not in (None, "", "fp32"):
            offenders.append(f"{name}: claims {cfg.quant!r} but upstream is fp32-only ({note})")
    assert not offenders, "false quant claims:\n  " + "\n  ".join(offenders)


def test_stable_audio_sizes_match_safetensors():
    """Stable Audio declared Q8_0/2500MB; the repo ships a 4.4GB fp32 checkpoint."""
    from backend.backends import get_all_model_configs

    by_name = {c.model_name: c for c in get_all_model_configs()}
    big = by_name.get("stable-audio-open-1.0")
    assert big is not None
    assert big.quant == "fp32", f"expected fp32, got {big.quant!r}"
    # model.safetensors = 4,629,043,112 B (~4415 MB)
    assert 4300 <= big.size_mb <= 4500, f"size_mb={big.size_mb}, expected ~4415"

    small = by_name.get("stable-audio-3-small-sfx")
    assert small is not None
    assert small.quant == "fp32", f"expected fp32, got {small.quant!r}"
    # model.safetensors = 1,676,829,212 B (~1599 MB)
    assert 1500 <= small.size_mb <= 1700, f"size_mb={small.size_mb}, expected ~1599"


# -- Tool registry idempotency ---------------------------------------------

CLIENT_COMMAND_TOOLS = [
    "21labs.studio_add_track",
    "21labs.studio_set_master_volume",
    "21labs.studio_import_session",
    "21labs.voice_changer_enable",
    "21labs.voice_changer_set_profile",
    "21labs.voice_changer_set_preset",
]


def test_tool_registry_populate_is_idempotent():
    """Re-populating must not strip client_command from assistant tools.

    Regression (caught 2026-10-03): the merge branch in populate() rebuilt each
    already-registered ToolDef without carrying over `client_command`, so it
    silently reset to the False default. The six UI-executed assistant tools
    then looked like they had no endpoint, and verify_assistant_vs_tr()
    reported six errors. The test passed in isolation and failed only in the
    full suite, because the failure needs a second populate() to trigger.
    """
    from backend.tool_registry import TR
    from backend.tool_registry_populate import populate, verify_assistant_vs_tr

    populate()
    first = verify_assistant_vs_tr()
    assert first == [], f"first populate() should be clean, got: {first}"

    populate()
    second = verify_assistant_vs_tr()
    assert second == [], f"second populate() regressed: {second}"

    for name in CLIENT_COMMAND_TOOLS:
        td = TR.get(name)
        assert td is not None, f"{name} missing from registry"
        assert td.client_command, f"{name} lost client_command on re-populate"
        assert "assistant" in td.surfaces, f"{name} lost the assistant surface"


# ── Health endpoint must not block the event loop ──────────────────


def test_health_route_offloads_blocking_probes():
    """GET /health must build its snapshot off the event loop.

    Regression (caught 2026-10-03): ``/health`` is ``async def`` but ran every
    probe inline — GPU probe (torch/CUDA init, ~5.2 s cold), TTS engine
    registry scan, model-directory walk, psutil. The first call after startup
    therefore froze the whole loop for >10 s, so the app looked hung right
    after launch and ``test_graceful_shutdown_unloads_models_and_exits_cleanly``
    timed out polling /health (2 of 3 runs failed, each on a different test).

    The route must delegate to the blocking worker via asyncio.to_thread.
    """
    import inspect

    from backend.routes.health import _build_health_response, health

    # The blocking half exists as a plain sync function.
    assert not inspect.iscoroutinefunction(_build_health_response), (
        "_build_health_response must stay sync so it can run in a worker thread"
    )

    src = inspect.getsource(health)
    assert "asyncio.to_thread" in src, (
        "GET /health must offload its probes with asyncio.to_thread; "
        "running them inline blocks the event loop for seconds"
    )


def test_startup_warms_health_snapshot_off_the_readiness_path():
    """Startup must keep the ~6 s health warm-up off the readiness path.

    Staged startup (2026-10-14): ``_signal_ready()`` fires as soon as the DB
    and queue are up so the app is usable immediately, and the expensive
    probes run in a background tier (>1 s later, off the event loop). The
    regression this guards is the warm-up being awaited *before* readiness
    again - that would make every launch pay for torch's import before the
    window is useful.
    """
    app_py = Path(ac.__file__).resolve().parent.parent / "app.py"
    text = app_py.read_text(encoding="utf-8")

    warm_at = text.find("_warm_health_snapshot")
    ready_at = text.find("_signal_ready()")
    tier_at = text.find("_tier1_health_warm")
    assert warm_at != -1, "app.py no longer warms the health snapshot"
    assert ready_at != -1, "app.py no longer calls _signal_ready()"
    assert tier_at != -1, "app.py no longer defers the warm-up to a background tier"

    # The warm-up must live inside the tiered task, not in the core path.
    tier_body = text[tier_at:]
    assert warm_at < len(text) and "_warm_health_snapshot" in tier_body, (
        "the health warm-up must be scheduled by the background tier, not awaited in core startup"
    )
    # Readiness fires before the tier is scheduled, and the tier sleeps first.
    assert ready_at < tier_at, (
        "_signal_ready() must fire before the warm-up tier is scheduled, "
        "otherwise the first launch still blocks on torch's import"
    )
    assert "await asyncio.sleep" in tier_body, "the warm-up tier must yield before heating the GPU probes"
    assert "asyncio.to_thread(_warm_health_snapshot)" in text, (
        "the warm-up must run in a thread so it never blocks the event loop"
    )


# ── Frozen-bundle data files the tool registry reads at runtime ──────


def test_tool_registry_sources_are_bundled_for_frozen_build():
    """populate() reads .py sources from disk; the bundle must ship them.

    Regression (caught 2026-10-03): ``tool_registry_populate.populate()`` does
    not import its metadata — it ``ast.parse``/``exec``s
    ``backend/routes/assistant_tools/*.py`` and regex-scans
    ``backend/mcp_server/tools/*.py`` for ``@mcp.tool`` decorators. PyInstaller
    ships bytecode, not ``.py``, so in the packaged app the first ``/mcp``
    request raised FileNotFoundError, ``ensure_mcp_built()`` swallowed it, and
    ``/mcp`` stayed unmounted — the whole MCP surface was dead in the
    installer while working in dev.

    Bundling only the first directory was not enough: ``/mcp`` mounted but
    exposed 29 tools instead of 203, because the decorator scan found nothing.
    Both directories must be added as data files.
    """
    build_script = Path(ac.__file__).resolve().parent.parent / "build_binary.py"
    text = build_script.read_text(encoding="utf-8")

    for rel in ("routes/assistant_tools", "mcp_server/tools"):
        assert rel in text, (
            f"build_binary.py no longer bundles backend/{rel}/*.py; "
            "populate() parses those files at runtime and MCP tools go missing "
            "in the frozen app"
        )

    # The bundle destination must mirror the source layout under backend/,
    # because populate() resolves those paths via Path(__file__).parent.
    assert "backend/{_rel}" in text, (
        "bundled tool-registry sources must land under backend/ in the bundle, "
        "mirroring the path populate() resolves at runtime"
    )


def test_shim_does_not_exclude_stdlib_typing():
    """The MCP shim must not exclude ``typing``.

    Regression (caught 2026-10-03): build_shim() excluded ``typing`` as an
    "obsolete backport". No such distribution is installed — on Python 3.12
    ``typing`` is stdlib, and ``functools`` imports it. The freshly built shim
    died instantly on every launch with
    ``ModuleNotFoundError: No module named 'typing'``, taking the entire MCP
    stdio bridge with it.
    """
    build_script = Path(ac.__file__).resolve().parent.parent / "build_binary.py"
    text = build_script.read_text(encoding="utf-8")

    start = text.index("def build_shim(")
    shim = text[start:]

    assert '"typing"' not in shim, (
        "build_shim() must not exclude 'typing' — it is stdlib on Python 3.12 "
        "and functools imports it; the shim crashes on launch without it"
    )
