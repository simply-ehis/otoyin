# eSpeak-ng Runtime Assets (On-Demand Download)

PURPOSE: eSpeak-ng runtime (shared library + phonemizer data) for the audiocpp TTS engines that phoneme-ize.
OWNS: backend/services/espeak_assets.py, data/bin/espeak-ng/ (runtime download dir, gitignored), the audiocpp `--session-option <family>.espeak_library_path|espeak_data_path` contract.
READ-WHEN: Kokoro/Piper/Inflect/Kitten engines fail with "Could not load eSpeak-ng", or you touch audiocpp session options.
KEY-FILES: backend/services/espeak_assets.py, backend/backends/audio_cpp.py (espeak_family arg), backend/backends/kokoro_tts_backend.py, backend/backends/kitten_tts_backend.py, backend/backends/oneshot_audiocpp.py (spec.family in ESPEAK_FAMILIES), backend/routes/models/download.py (install-time ensure), backend/tests/test_espeak_assets.py.
INVARIANTS: eSpeak-ng is NEVER bundled in the app or installer. It is downloaded on first install of any eSpeak-dependent engine (SHA-256-verified, atomic) and reused by every eSpeak engine afterwards. Absent assets => clear error, never silent fallback. One shared install per machine.
GOTCHAS: (1) audiocpp wants FAMILY-PREFIXED session options (`piper_tts.espeak_library_path`), not bare `espeak_library_path` - bare options error out and look exactly like a missing library. (2) Data extraction from the wheel must preserve the top-level entries in espeak-ng-data/ (phontab etc.) - a "no phontab" error means the extractor dropped them. (3) GPL-3.0-or-later: the wheel is fetched at install like any other model weight; nothing is redistributed inside the app. (4) Windows-only for now; the other platforms use the system package (sudo apt install espeak-ng libespeak-ng1) or a system install with the session options pointed at it.
UPDATED: 2026-11-16

## Why this exists
- audio.cpp (like Kokoro/Piper upstream) does not bundle eSpeak-ng in the Windows CLI release we stage. The `EspeakPhonemizer` adapter dlopens a system/shared library; the app must provide it at runtime.
- The upstream `espeakng_loader` wheel is just a zip containing `espeak-ng.dll` (~419 KB) and `espeak-ng-data/` (~8.5 MB of dictionaries). It is downloaded from PyPI at first need, SHA-256 pinned, and extracted atomically into `data/bin/espeak-ng/`.
- `is_espeak_installed()` is a cheap file check; generation calls `ensure_espeak_installed()` lazily so engines already installed before this change self-heal on first use.

## Install flow
1. `/models/download` for any of `{kokoro, piper_tts, inflect_v2, kitten_tts}` calls `ensure_espeak_for_engine(engine)` before touching the network for the model itself.
2. The wheel is fetched to a sibling `.part` file with SHA-256 + size verification, extracted with phontab/phondata/phonindex + `*_dict` + `lang/`/`voices/`, sanity-checked, then swapped into place atomically under the install lock.
3. At generation time, the engine passes `<family>.espeak_library_path=<dll>` and `<family>.espeak_data_path=<data>` as audiocpp session options via `run_one_shot(..., espeak_family=...)`.
