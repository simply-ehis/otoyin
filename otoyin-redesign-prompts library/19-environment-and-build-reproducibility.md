# Prompt: Environment & Build Reproducibility ("Works On My PC")

## Context

Not a redesign task — this is about closing the gap between "runs on the
dev machine that's been iterated on for months" and "runs correctly on a
fresh clone, a different OS, or a different contributor's machine." Good
news first: device detection is already genuinely solid —
`backend/backends/base.py`'s `get_torch_device()` handles CUDA, Intel XPU,
DirectML, and Apple MPS with sane fallback to CPU, and plugin path
scanning (`backend/services/plugins.py`) is already correctly branched per
platform (Windows/macOS/Linux VST3 and AU paths). Don't touch either of
those — they're not the problem.

## Confirmed gaps

1. **Loose dependency pinning.** `backend/requirements.txt` mostly uses
   `>=` lower-bound constraints (`fastapi>=0.109.0`, `transformers>=4.36.0,
   <=4.57.6`, etc.) rather than exact pins. `torch==2.5.1` and
   `torchaudio==2.5.1` are correctly hard-pinned (the highest-risk one to
   let drift), but most of the rest aren't. A fresh install six months from
   now can silently pull a newer transitive dependency that behaves
   differently — this is one of the most common sources of "works on my
   machine, broken on a fresh clone." **Task:** generate a fully pinned
   lockfile-equivalent (`pip freeze` from a known-good environment, or
   adopt `pip-tools`/`uv` for a proper lockfile) and commit it alongside
   `requirements.txt`, so CI and new contributors install the exact same
   versions you tested against.
2. **No `rust-toolchain.toml`.** The Tauri sidecar (Rust) has no pinned
   compiler version — different contributors' `rustc` versions can produce
   different build behavior or errors. Add a `rust-toolchain.toml` at the
   Tauri project root pinning a specific stable channel version.
3. **Asymmetric environment verification.** `check-env.bat` exists for
   Windows (verifies the Rust/MSVC build environment per the README) but
   there's no equivalent for macOS/Linux. Either write `check-env.sh`
   covering the equivalent checks for those platforms, or fold the check
   into `just setup` so it runs uniformly regardless of OS.
4. **Path handling review.** A first-pass grep found ~15 places in
   `backend/` using string concatenation or f-strings to build paths
   instead of `pathlib.Path` / `os.path.join`. Review each — string-built
   paths are the classic source of "works on Linux/Mac, breaks on Windows"
   bugs (separator differences) or vice versa. Not all matches will be real
   issues (some may be URL paths, not filesystem paths — check each), but
   audit and fix the ones that are.
5. **The bun/pnpm/npm mess (already flagged in 01/03) is itself a
   "works on my PC" bug** — different contributors currently get different
   dependency resolution depending on which tool they happen to run. This
   prompt doesn't duplicate that work, just flags the connection: closing
   it (03's bun→npm section) is part of this same reproducibility goal.

## Also worth a pass

- Confirm the backend's model cache directory logic behaves correctly on a
  machine with **zero cached models** (a genuinely fresh install) — not
  just on dev machines where most models are already downloaded. This is
  easy to miss because it's rarely tested by the people who built it.
- Confirm `.env.example` (root) is actually complete and current against
  every env var the code reads — a new contributor copying it should get a
  working setup, not a silent missing-var failure discovered later.

## Deliverable

A pinned/locked Python dependency set, a `rust-toolchain.toml`, a
cross-platform environment check (`check-env.sh` or folded into `just
setup`), and a fixed set of path-handling call sites where the grep
findings turned out to be real bugs.
