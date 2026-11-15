# 86 - Audio.cpp Unification (Plan + Inventory)

PURPOSE: Consolidate every audio.cpp-supported model path onto a single `audiocpp_cli` one-shot runner, delete the bespoke per-model Python backends, and grow the Store catalog with new audio.cpp families.
OWNS: backend/backends/audio_cpp.py, backend/backends/heartmula_backend.py, backend/services/marketplace_catalog.py, app/src/features/store/, backend/backends/configs/tts.py, backend/backends/configs/music.py, backend/backends/registry/tts.py
READ-WHEN: Before touching any TTS/Music/SFX backend, before adding a catalog entry, or when an audio.cpp migration behaves differently from the model it replaced.
KEY-FILES: backend/backends/audio_cpp.py, backend/backends/configs/tts.py, app/src/features/store/storeUtils.ts
INVARIANTS: audiocpp_cli is the ONLY one-shot runner; models are downloaded by the user, never by the app at build time; NC models are tagged cc-by-nc-4.0 + commercial_use:false; no torch/onnx one-shots remain for migrated families; bare model names everywhere except the Store.
GOTCHAS: Audio.cpp families are chosen by `--family` and `--task`, args differ per family (interpolation is NOT uniform); Q8_0 is the only quant we ship; GGUF dirs under audio-cpp/audio.cpp-gguf are directories on HF, not standalone repos.
UPDATED: 2026-11-14

## Executive summary

The app ships a matrix of per-model Python backends (torch / ONNX / llama sidecars / CrispASR / s2.cpp). Almost all of the TTS engines it supports already have an audio.cpp family — the consolidation win is structural: one sidecar binary, one subprocess pattern, one config-driven catalog. Adding a model becomes a `ModelConfig` entry, not 200 lines of backend. Once migrated, delete the bespoke backends outright (no fallbacks — a "fallback" keeps a maintenance load that never pays back).

Measured surface for this pass: ~3,225 lines of deletable backend code across 14 files, minus ~100 lines each for the replacement wrappers (net ~-2,400).

## Sidecar policy — cross-platform, not Windows-locked

Audio.cpp publishes per-OS / per-GPU binaries (verified v0.9.4 assets):

| Platform | Assets |
|---|---|
| macOS | `bin-macos-arm64-metal.tar.gz` (35 MB), `bin-macos-x64-metal.tar.gz` (38 MB) |
| Ubuntu x64 | `bin-ubuntu-x64-{cpu,cpu-portable,vulkan,vulkan-portable,cuda12.8}.tar.gz`, rocm10.0.0-test (670 MB) |
| Windows x64 | `bin-windows-x64-{cpu,cpu-portable,vulkan,vulkan-portable,cuda12.4,cuda13.3,rocm10.0.0-test}.zip` |

The app's downloader (`backend/utils/sidecar_downloader.py`) currently refuses non-Windows. This plan expands it to mac-arm64/x64 (metal), ubuntu x64 (cpu → vulkan upgrade), and windows x64, picking CUDA>vulkan>cpu by detected GPU probe on each platform. The expansion itself is Phase 0 of the implementation order (trivial, localized to sidecar_downloader.py) and is what makes later mac/linux phases free; the actual mac/linux QA is out of scope for this pass (no hardware available), but nothing in the code may hardcode Windows.

Binary selection rule (documented, not hardcoded): probe platform + GPU vendor; order preference = `cuda12.4`/`cuda12.8` (NVIDIA) > `vulkan` (AMD/Intel or unknown) > `metal` (macOS) > `cpu`. Windows-load-fail falls back cleanly with an install-needed message; it does NOT silently fall back to a different runner.

## Phase 1 — Migrate existing engines to audio.cpp (the hard delete)

File deletes required (verified on disk):

| App engine (db id) | audio.cpp family | Files deleted | HF Q8_0 (in audio-cpp/audio.cpp-gguf) |
|---|---|---|---|
| `kokoro`, `kokoro_onnx` | `kokoro_tts` | backend/backends/kokoro_backend.py (315), backend/backends/kokoro_onnx_backend.py (311) | Kokoro-82M-GGUF — 889 MB |
| `pocket_tts`, `pocket_tts_onnx` | `pocket_tts` | backend/backends/pocket_tts_backend.py (104), backend/backends/pocket_tts_onnx_backend.py (96), backend/backends/_pocket_tts_onnx.py (542) | PocketTTS-GGUF (per-language dirs, e.g. english/pocket-tts-english-q8_0.gguf) |
| `kitten_tts`, `kitten_tts_onnx` | `kitten_tts2` | backend/backends/kitten_tts_onnx_backend.py (80), backend/backends/_kitten_tts_onnx.py (119) | KittenTTS2-GGUF — 3.2 GB |
| `moss_tts_nano` | `moss_tts_nano` | backend/backends/moss_tts_nano_onnx_backend.py (115), backend/backends/_moss_tts_nano_onnx.py (574) | MOSS-TTS-Nano-GGUF |
| `qwen3_tts` | `qwen3_tts` | backend/backends/qwen3_tts_backend.py (193) | Qwen3-TTS-12Hz-1.7B-Base-GGUF — 2.57 GB |
| `fish_speech_s2` | `fish_audio` | backend/backends/fish_speech_s2_backend.py (172) | Fish-Audio-S2-Pro-GGUF — 6.0 GB |
| `voxcpm2` | `voxcpm2` | backend/backends/voxcpm2_backend.py (239) | VoxCPM2-GGUF |
| `zonos_gguf` — **REMOVED** | `zonos2` / `zonos3` | backend/backends/zonos_gguf_backend.py (179) | superseded by ZONOS3-Mini-GGUF (new catalog row) |
| `neutts` | `neutts` | backend/backends/neutts_backend.py (315) | NeuTTS-2E-GGUF (`neutts-2e-orig.gguf`; NO q8_0 in tree — migrate at published quant, user decision 2026-11-14) |
| `bark_small` | n/a — **kept, not migrated** (user decision 2026-11-14: no audio.cpp family accepted; backend stays) | n/a | kept | — |
| `steer_tts` | n/a — **kept, not migrated** (user decision 2026-11-14) | n/a | kept | — |

Deletable totals: 3,031 lines backend code (14 files incl. steer/bark TBD ~ unaffected), plus ModelConfig.pip_packages trimming (`kokoro>=0.9.4`, `misaki[en,ja,zh]`, `pocket-tts`, `sentencepiece`, `steertts` etc. — every migrated row goes to `pip_packages=[]`).

Kept (no audio.cpp equivalent this pass): stable_audio (own C++ port), acestep (ace.cpp — audio.cpp lists ACE-Step1.5-GGUF but the app's own port already covers generation and stable/ace are not one-shot TTS), faster_whisper / moonshine / parakeet / qwen3_asr (STT — separate migration), bark / steer_tts (until audio.cpp families are verified), orpheus / parler_tts (unmapped), all ONNX STT backends, all VC backends.

## Phase 2 — Store catalog additions (Q8_0 only, models live on HF, downloaded by the user)

Family semantics per the audio.cpp TTS doc (authoritative): `tts` alias to clone synthesis; `clon` = explicit clone route; `vdes` = voice-design; `gen` = music/SFX-ish generation. `--voice-ref` carries clone audio; `--reference-text` its transcript when the family wants one.

**License policy (user decision 2026-11-14): the app is open source with a user-side license disclaimer — licenses do NOT gate distribution. Free-but-non-commercial models (CC-BY-NC-4.0 etc.) are added to the Store like anything else, tagged with the existing red "Non-commercial" chip.**

| Entry | family | task | ~Q8 size | license (verified where possible) | Lane |
|---|---|---|---|---|---|
| Phonon-31m-en | `gradium_phonon` | `tts` | 65 MB | Apache-2.0 (upstream Gradium phonon-31m-en) | TTS |
| Audio8-TTS | `audio8_tts` — **VERIFIED 2026-11-14** (`docs/models/audio8_tts.md`; HF repo `audio-cpp/Audio8-TTS-Realistic-0.6b-GGUF`, Apache-2.0, file `audio8-tts-realistic-0.6b-q8_0.gguf` = 1,363 MB; tasks `tts`, `clon`; 12 langs; 44.1 kHz) | `tts`, `clon` | 1.33 GB | Apache-2.0 | TTS + clone |
| MOSS-SoundEffect v2 | `moss_soundeffect` | `gen` | 3.8 GB | Apache-2.0 (verified on card) | **SFX** (new section) |
| OmniVoice-GGUF | `omnivoice` | `tts`, `clon`, `vdes` | 1.29 GB | CC-BY-NC-4.0 → `commercial_use:false` + `license_note` | TTS |
| Yue2-3B-GGUF | `yue2` | `gen` | 2.3–4.3 GB + VAE | CC-BY-NC-4.0 → NC tag | Music |
| ZONOS3-Mini | `zonos3` | `tts`, `clon` | 1.11 GB total (3 files: backbone-ptq.gguf 632 MB + zac-keep2.gguf 431 MB + spk-encoder.gguf 43 MB) | Apache-2.0 | TTS |
| Drama-3-GGUF | `fish_drama3` | `tts`, `clon` | **23.5 GB — Q4_K_S official (user decision 2026-11-14, overrides Q8_0-only rule; no reasonable Q8_0 published — official Jmica has only Q2_K/Q3_K_S/Q4_K_S). File: `Jmica/Drama-3-GGUF/drama-3-backbone-8bit-experts-Q4_K_S.gguf`** | Fish Audio Community License v1.0 — user ruled license note unnecessary; keep attribution out of store note; `gpu_only:true`, `min_vram_mb:16_000`; CUDA-only | TTS, CUDA-only |
| Stable Audio 3 Small Music | `stable_audio` | `gen` | **1,606 MB** (`Stable-Audio-3-Small-Music-GGUF/stable-audio-3-small-music-q8_0.gguf`) | Stability AI (Stable Audio 3 Small Music; upstream `stabilityai/stable-audio-3-small-music`) | Music — added to Phase 2 list per user 2026-11-14 (user called it "Stable Audio 4"; does not exist; this is the nearest/currently newest SA3 small music GGUF). **Overlap risk:** app owns an SA port (`stable_audio` C++ backend) for SA1.0 + SA3 SFX; decide catalog-only-row via audiocpp vs reuse own port |

### "Good ones" found in the audio.cpp GGUF org (Q8_0 verified, candidates)

Sizes verified from the `audio.cpp-gguf` tree (2026-11-14):

| Candidate | family | Q8_0 size | License | Why it made the cut (quality/capability/unique/ size) | Decision |
|---|---|---|---|---|---|
| Application row decision (2026-11-14) | — | — | — | — |
| ✅ Supertonic 3 | `supertonic` | 433 MB | Apache-2.0 (Supertone; sanity-check card at implementation) | **ADD this pass** |
| ✅ Chatterbox-Turbo | `chatterbox_turbo` | 667 MB | MIT (community repack) | **ADD this pass — no voice cloning, built-in English voice only; doc must say so** |
| ✅ Piper TTS | `piper_tts` | 60 MB (no q8; upstream default package) | MIT (OHF) | **ADD this pass — featherweight offline fallback, 100+ voices** |
| ✅ MagpieTTS 357M | `magpie_tts` | 1.49 GB | Apache-2.0 (NVIDIA) | **ADD this pass — 10 langs, baked speaker prompts** |
| ✅ CosyVoice3 | `cosyvoice3` | 2.15 GB | Apache-2.0 (FunAudioLLM) | **ADD this pass — Mandarin flagship** |
| MioTTS 1.7B | `miotts` | 2.1 GB | Apache-2.0? (MioCodec dep chain — verify) | serious audio quality per param; needs MioCodec GGUF alongside | defer — dependency chain too heavy for this pass |
| VibeVoice 1.5B | `vibevoice` | 3.08 GB | MIT | long-form multi-speaker podcast synthesis | defer — niche; app has ORPHEUS-style path already? no; candidate but heavy |
| FireRedTTS3-Base | `fireredtts3` | 3.99 GB | Apache-2.0? (verify) | vdes + zh/en, very capable | defer — validate demand first |
| Voxtral-4B-TTS | `voxtral_tts` | 4.5 GB | **cc-by-nc-4.0** (verified on card) | Mistral flagship, 20 langs | defer — NC wall not needed now |
| Maya1 | `maya1` | 3.85 GB | `other` (verify) | expressive vdes | defer — license `other`, unknown |
| ControlFoley | `controlfoley` | 11.98 GB | unknown | video→foley; SFX but 12 GB and specialized | NO — not a general-purpose add |
| Kokoro-82M | `kokoro_tts` | 889 MB | Apache-2.0 | the migration target; first-run starter | **already the migration target** |

Worth cataloging as **variants of existing families** rather than new rows:
Qwen3-TTS-12Hz-1.7B-VoiceDesign-GGUF / -CustomVoice-GGUF (voice-design and packaged-voice routes — same `qwen3_tts` family, one extra `ModelConfig` row each if store demand exists).

### Models deliberately NOT added this pass

- **Inflect-Mini-v3** — not in released audio.cpp (`inflect_v2` is Inflect-*Micro*, different lineage/feature set). Needs an upstream family or a bespoke backend; separate task.
- **samplegen-small** (MusicGen-class) — torch-only, F32, CC-BY-NC, duplicates ACE-Step + HeartMuLa. No realistic path.
- **Irodori-TTS v4 Small** — user decision 2026-11-14: skip, do not add.
- **NeuTTS-2E-GGUF ships no q8_0** in that tree — user decision 2026-11-14: migrate NeuTTS anyway, using the published 2E package whatever quant it is (note: NOT Q8_0, the sole planned exception).
- **Typhoon? / others not audited** — no others made the cut.
- **Audio8-TTS — VERIFIED 2026-11-14.** `docs/models/audio8_tts.md` exists upstream; Apache-2.0; HF repo `audio-cpp/Audio8-TTS-Realistic-0.6b-GGUF` hosts `audio8-tts-realistic-0.6b-q8_0.gguf` (1,363 MB); tasks `tts`, `clon`; 12 languages; 44.1 kHz. Entry reinstated (Phase 2, TTS + clone).
- **Yue2** — verify §-annotated GGUF split (main + VAE) lands as TWO downloadable files in the SFX/Music config (`quant` field = "Q8_0", `download_files` list must carry both).

## SFX — new store section (decided)

- New `CategoryId: "sfx"` alongside `music`; label "Sound Effects" in the store tab strip (speaker-wave icon, `border-t-[3px]` hue identity in storeUtils).
- Entries: `sa3_sfx` (existing, moved category `music` → `sfx`) and `moss_soundeffect` (new). ACE-style/CosyVoice-type entries join later as audio.cpp lists them.
- `Marketplace_catalog.py` SFX rows carry `"category": "sfx"`; `StorePage` needs zero new components beyond the CATEGORIES/RULES additions in `storeUtils.ts`.
- Backend stays `sa3_sfx_backend.py`-shaped: one singleton `.wav` out, `--task gen` in.

## Warm multi-model pool (user decision 2026-11-14)

The old **single resident TTS slot** (any load evicts every other loaded TTS engine) is REPLACED by a capacity-bound warm pool — see `backend/services/warm_pool.py`:

- **Stays resident together**: multiple engines may stay loaded at once (e.g. fast-whisper + Kokoro + Stable Audio C++ + planner LLM). One-shot audiocpp engines keep `is_loaded() == False`, so they never occupy pool slots.
- **Caps (both counted POST-load — the requester counts)**: `TWENTYLABS_WARM_POOL_MAX_ENGINES` (default 4) and `TWENTYLABS_WARM_POOL_MAX_MB` (default 16000 resident MB, sizes from `ModelConfig.size_mb`).
- **Eviction**: least-recently-used first (`lifecycle_manager`'s `mark_model_used` stamps). Keep-warm engines from Performance Mode (`services/always_on.py`) are never evicted; if not enough units can be freed, the load proceeds anyway — never hard-fails.
- **Not audiocpp processes themselves** — audiocpp_cli is still one-shot subprocesses per request; the pool only governs in-process resident models.

## Audio.cpp special flags honoured (`._usage.md` research, 2026-11-14)

`audiocpp_cli` has no llama.cpp-style flash-attn / KV-cache-quant flag; the equivalents map onto (a) `--backend`, (b) per-family session options. The app runs one-shots with:

- `--backend best` — ggml picks the fastest available device. **This was missing before 2026-11-14 — every migrated engine ran on CPU even on GPU machines.** Override with `TWENTYLABS_AUDIOCPP_BACKEND` (`cpu|cuda|vulkan|metal|best`).
- `--threads N` only when `TWENTYLABS_AUDIOCPP_THREADS` is set (CLI default 4 otherwise).
- `TWENTYLABS_AUDIOCPP_SESSION_OPTS` — power user escape hatch: comma-separated `key=value` appended as `--session-option` (e.g. `fish_audio.mem_saver=true,kokoro_tts.weight_type=f16`). Documented use-cases: `<family>.weight_type=q8_0|f16` (memory-heavy families), `<family>.mem_saver=true` (peak RAM/VRAM reduction), `moe_disk_experts=true,moe_cpu_expert_layers=N` (Drama 3, Nemotron, Ming 3 — and Drama 3's `moe_disk_experts` is the answer for its 24 GB VRAM floor).
- `--metrics` / `--log` remain user-visible debugging knobs (deliberately NOT default-on — stdout is parsed by the app).

## Naming pass (decided)

Everywhere **outside the Store**, model display names carry NO runtime/quant suffixes:
`Kokoro-82M-GGUF` shown as "Kokoro" in logs, tooltips, registry names, docs. Store catalog entries keep full descriptive names ("Kokoro 82M") but the chip/tags carry quant. Code-wise: `ModelConfig.name="Kokoro"`, `qualified_name` stays internal. Update in docs, tab titles, registry, onboarding prompts, error strings.

## Onboarding / first-run

Swap the free starter so it needs no torch: Kokoro stays the free onboarding model but now resolves through `kokoro_tts` (GGUF) rather than the torch path; the app's first-run path then loads zero torch. Any stale `kokoro>=0.9.4` / `misaki` pip requirements disappear from the default install.

## Success criteria (agreed)

1. backend Python file count ≤ ~15 (from ~40 today).
2. Zero torch-loading path in default first-run (whisper/kokoro torch wheels absent from default requirements).
3. ≥ 2,500 LOC reduction in `backend/backends/` (measured 3,031 at Phase-1 delete list).
4. Every migrated engine resolves to `audiocpp_cli`; `audio_cpp.py` + `heartmula_backend.py`-pattern singletons only.
5. Store: SFX tab renders, NC models show the red chip, Drama-3 shows FACL restriction text, all downloads link to HF repos (documented as user-downloaded).
6. Gate: existing backend unit suite green with mocked audiocpp_cli; new backends get arg-builder mock tests (mirror HeartMuLa tests).
7. `ruff check backend/`, `biome check`, `tsc --noEmit`, `cargo check --locked` green.

## Status (2026-11-14)

**Phase 0 — done & tested.** `sidecar_downloader.py`: audio.cpp auto-download now resolves per platform (Windows x64 / Linux x64 portable & opt-in CUDA,Vulkan / macOS arm64+x64 Metal; GPU builds opt-in via `TWENTYLABS_AUDIOCPP_VARIANT={cpu|vulkan|cuda}`; CPU-portable is the default everywhere). `.tar.gz` support added; binary located via rglob so versioned subdirs are fine; chmod +x on unix. `audio_cpp.py`: new shared `run_one_shot(args, *, sample_rate, prefix, timeout_s=None)` runner (owns `--out`, return-code→tail error, TimeoutError, temp WAV cleanup) — every migrated backend uses it. Pre-existing test hermeticity bug in `test_heartmula_backend.py::test_find_audiocpp_missing` (order/state-dependent on machines with a downloaded `backend/data/bin/audiocpp/`) fixed same way in `test_sa3_sfx_backup.py`. Note: one earlier test run accidentally downloaded the 31 MB audiocpp sidecar into a tmp dir before the pin existed — nothing persisted, no repo pollution.

**Pilot migration — qwen3_tts (`llama-tts` → audio.cpp `qwen3_tts`) — done & tested.** Migrated before the main batch; 16 tests green.

**Phase 1 — ALL MIGRATIONS DONE (2026-11-14).**
| Engine | audio.cpp family | Note |
|---|---|---|
| `qwen3_tts` | `qwen3_tts` | single GGUF (q8_0_v2, 2.57 GB), `download_file` |
| `fish_speech_s2` | `fish_audio` | single GGUF (6.0 GB), `--temperature` preserved; `S2_CPP` world fully gone |
| `voxcpm2` | `voxcpm2` | single GGUF; CrispASR fully gone from this path |
| `kokoro` | `kokoro_tts` | 181 MB GGUF w/ 54 voice packs; `KokoroONNX`/`misaki`/`kokoro>=0.9.4` pip deps DELETED; kokoro_tts_backend.py replaces both backends; first-run now torch-free |
| `pocket_tts` | `pocket_tts` | **English package only**: q8_0 122 MB + embeddings subtree (`download_subtree="PocketTTS-GGUF/english"`, ~270 MB); multi-lang (fr/de/pt/it/es) can ship later |
| `kitten_tts` | `kitten_tts` | orig GGUF 288 MB (upstream ships NO quant) — original-precision exception |
| `moss_tts_nano` | `moss_tts_nano` | q8_0 184 MB; **CUDA/HIP caveat:** upstream warns q8 incremental-decode drift → `moss_tts_nano.weight_type=f16` session option or bf16 GGUF on affected GPUs; CPU exact |
| `neutts_2e` | `neutts` | **user decision 2026-11-14: migrate; zero-shot cloning LOST (family has none)**; 9 built-in voices + 7 emotions; orig GGUF 2.9 GB (no q4/q8 published); `neutts` Air stays (Apache-2.0, clone, llama-cpp-python, torch-free) |
| `zonos_gguf` | — | **DELETED entirely** (user decision: replaced by ZONOS3-Mini); catalog/registry/configs/frontend/backend/test references removed |

`ModelConfig` gained `download_file`/`download_subtree` (config-driven single-file / subtree install; generic branch runs BEFORE the elif ladder). Installed engines hit `is_model_installed`/`resolve_model_file` with repo-relative paths. `_ENGINE_PIP_DEPS`/`_ENGINE_IMPORT_PROBES` cleaned of migrated engines. Frontend engine tables (`engines.ts`, `types.ts`, `format.ts`, `languages.ts`, `useGenerationForm.ts`) rewritten to the new reality; Kokoro/Kitten/MOSS preset voice tables REPLACED with the audiocpp-packaged truth (54 / 8 / 26 voices).

**Deletions (~2,480 LOC across 10 backends + 2 helpers):** kokoro_backend.py, kokoro_onnx_backend.py, pocket_tts_onnx_backend.py, _pocket_tts_onnx.py, kitten_tts_onnx_backend.py, _kitten_tts_onnx.py, moss_tts_nano_onnx_backend.py, _moss_tts_nano_onnx.py, zonos_gguf_backend.py, plus trimmed NeuTTS2EBackend class. Backend test files rewritten (arg-builder + mocked subprocess, mirror HeartMuLa pattern); obsolete ONNX regression tests deleted or rewritten.

**Full backend suite (2026-11-14): 2676 passed, 36 skipped, 12 deselected, 4 failed → all 4 fixed same day (test_bark_backend/test_heartmula-style hermeticity pins; stale `test_llm_ram_fallback` invariant rewritten against the real catalog; neutts_2e registration map; stale `_VERIFIED_QUANT_SOURCES` entry for moss-tts-nano). Ruff clean on touched files.**
**Phase 2 — catalog additions — NOT STARTED.**
**SFX Store section — NOT STARTED.** Drama-3 quant decision applied (Q4_K_S official). Sidecar matrix verified per-platform (Phase 0).
**VC migration — DONE (2026-11-15).** RVC/OpenVoice deleted; MeanVC2 + Tone-Color-VC added (audiocpp one-shots); Seed-VC replaced in-place with audiocpp family (GPL-3.0 tag retained); voice-conversion entry points + MCP tools rewired; frontend picker with 3 zero-shot options + bytes path. 81 unit tests green.
**PyTorch removal - DONE (2026-11-15, torch excision executed).** Pinned torch/torchaudio removed from requirements.txt; resemblyzer/silero-vad/scikit-learn removed (transitive torch pullers); PyInstaller torch runtime hook + scipy pyi_hooks deleted; build_binary exclusion list cleaned; no torch imports remain in-tree at all (GPU probes moved to nvidia-smi via backend/utils/gpu_query.py; diarization was removed outright, FEATURES.md no longer offers it). `utils/cache.py` reduced to cache-clear helpers only.

**New model catalog (2026-11-15) — DONE.** **14 entries wired + 1 SFX category added.** All new engines (phonon, inflect_v2, supertonic, piper_tts, chatterbox_turbo, audio8_tts, cosyvoice3, magpie_tts, omnivoice, yue2, zonos3, fish_drama3, moss_soundeffect, sa3_music) are audio.cpp one-shots via the generic `oneshot_audiocpp.py` factory (no per-model Python backend duplication). Small emotion-tag wiring: Chatterbox-Turbo carries the 19 documented paralinguistic tags ([advertisement], [angry], [chuckle], [clear throat], [cough], [crying], [dramatic], [fear], [gasp], [groan], [happy], [laugh], [narration], [sarcastic], [shush], [sigh], [sniff], [surprised], [whispering]); Bark Small now exposes the 6 officially documented non-verbal tags ([laughter], [laughs], [sighs], [gasps], [clears throat], [music]). SFX tab added to the Store as its own category (`CategoryId: "sfx"`, icon = SpeakerWaveIcon). Yue2's `download_patterns` mechanism added for multi-file installs (main + VAE). ZONOS3-Mini via `download_patterns` (backbone-ptq.gguf + zac-keep2.gguf + spk-encoder.gguf). NC-tagged entries (omnivoice, yue2) ship with the red non-commercial chip; Drama-3 gated `gpu_only:true` + `min_vram_mb:16_000`; Stable Audio 3 Small Music uses Stability Community License attribution note.
**Capability tags/badges — DONE.** Model status endpoint reports voice-design/emotion/etc. through `supported_tags` for the Store to render chips (already wired baseline).

**ZONOS3-Mini specifics - DONE.** 0.8B total (11 layers, dim 1024; ~100M active per token; latent top-2-of-64 MoE from layer 1). 43 languages per the official card; catalog languages updated to all 43. The official gguf/voices pack carries 27 default voices with ids for Zyphra's own server (`--tts-default-voices-dir` / `GET /v2/speakers`) - audiocpp_cli's zonos3 family does **not** expose `--voice-id` (clone via `--voice-ref` only), so no preset voices are wired. AtomicChat's third-party `ZONOS3-Mini-GGUF` (llama.cpp PR #32020 packages, verified: backbone + mmproj, llama-tts binary, 27 built-in voices, **no cloning**, AD-Q4_K_M ≈ within noise of BF16) was evaluated and **rejected** as a backend source; audiocpp `zonos3` (Zyphra official 3-file subtree via `download_patterns`) remains the single ZONOS3 path.

**Low memory mode / chunking controls - DONE (2026-11-15).** Generation settings gained `low_memory_mode` (BOOLEAN, default 0; migrated into existing `generation_settings` rows via `database/migrations.py`; GET/PUT `/settings/generation` roundtrip; UI toggle next to chunking). When on, audiocpp one-shots emit `--session-option <fam>.mem_saver=true` for the families implementing it (fish_audio, qwen3_tts, omnivoice, cosyvoice3, audio8_tts, stable_audio, yue2, voxcpm2); everything else silently skips. Chunking settings (`max_chunk_chars` default 800, `crossfade_ms` default 50) documented with the default behavior in the UI copy: sentence-boundary split (abbreviation-aware, CJK punctuation, tag-safe), all engines route the TTS path through the app-side `chunked_tts` with voice consistency kept by the engine's internal reference logic; music/SFX ignore the setting. No KV-cache quantization exists anywhere in audiocpp for TTS as of upstream main (qwen3_tts KV is f32/f16 only).

**HF path verification - complete (2026-11-15).** Every migration/catalog file confirmed on the hub: Fish-Audio-S2-Pro q8_0 6.0 GB, VoxCPM2 q8_0 2.8 GB, Kokoro q8_0 181 MB (+multilingual 889 MB), KittenTTS2 q8_0 3.2 GB, PocketTTS per-language (e.g. english q8_0 122 MB), MOSS-TTS-Nano-100M q8_0 184 MB, NeuTTS (no q8_0; published `neutts-2e-orig.gguf` 2.9 GB), MOSS-SoundEffect-v2 q8_0 3.8 GB, OmniVoice q8_0 1.29 GB, Yue2-3B q8_0 4.07 GB + VAE f16 253 MB, ZONOS3-Mini (Zyphra official) Q4-ish PTQ backbone 632 MB + spk-encoder 43 MB + zac-keep2 431 MB ("ptq" scheme unpublished by upstream; the card says quantization variants undetermined), Phonon-31m q8_0 81 MB (gradium/phonon-31m-en-audiocpp + default-voice.safetensors), Supertonic-3 q8_0 433 MB, MagpieTTS-357M q8_0 1.49 GB, CosyVoice3 q8_0 2.15 GB, Chatterbox-Turbo q8_0 667 MB, Piper (en-us-lessac-medium-orig, 60 MB), Audio8-TTS-Realistic q8_0 1,363 MB (audio-cpp). Drama-3 (user decision): official Jmica Q4_K_S only.

## Execution order

1. Expand `sidecar_downloader.py` to mac/ubuntu/windows (Phase 0 enabler — no behaviour change on Windows).
2. `audio_cpp.py` helpers: `resolve_out_wav(request) -> Path`, `build_args(family, task, request) -> list[str]` shared by all wrappers; wrappers reuse HeartMuLa/SA3 one-shot scaffolding (load_model no-op, is_loaded False, generate → np.ndarray).
3. Migration batch, smallest blast radius first: qwen3_tts → voxcpm2 → fish_speech_s2 → neutts → zonos (delete) → pocket/kokoro/kitten/moss group (deletes + registry rewire) → steer/bark disposition.
4. Catalog additions in the order: phonon → supertonic → piper → chatterbox_turbo → audio8_tts → kokoro migration public-test → kitten/kokoro flip → magpie → cosyvoice3 → moss_soundeffect → omnivoice (NC) → yue2 (NC) → zonos3 → fish_drama3 (CUDA-only, add last, clearly gated). (Irodori dropped — user decision; shortlist adds embedded here.)
5. SFX section in the Store (storeUtils + catalog + SA3 category move).
6. Naming sweep (docs, registry, error strings).
7. Doc 86 updated in-place with final verified states; IMPACT_MAP.md updated.

## Voice conversion (VC) — what audio.cpp ships (researched 2026-11-14)

The upstream `docs/` tree lists four documented VC families. All take source audio (`--audio`) plus target voice reference (`--voice-ref`)-style cloning; none is a preset-voice preset argument like TTS.

| Family | Tasks / routes | ~size (GGUF) | License | Verdict |
|---|---|---|---|---|
| `meanvc2` (MeanVC2, ASLP Lab) | `vc` — language-agnostic, streaming 110 ms, zero-shot | q8_0 not listed; **q4_k 326 MB / fp32 1.55 GB** (fp32 default) | **Apache-2.0** (repo + model card) | **Recommend (license sellable, tiny q4_k)** — strongest per-byte option; 120 ms / 40 ms FRC path |
| `tone_color_vc` (OpenVoice V2 standalone) | `vc` — tone-color from reference | **F16 62.6 MB / F32 125 MB**; output 22.05 kHz | **MIT** (LICENSE shipped in the umbrella; MyShell) | **Recommend — matches app's current OpenVoice-ONNX use case; ~60 MB is essentially free** |
| `seed_vc` (seed-vc, Plachta) | `vc` (v2_vc, v1_whisper_bigvgan_vc, v1_xlsr_hift_vc) + `svc` (singing) | Q8_0 2.98 GB / F16 3.46 GB / orig 6.69 GB | Upstream seed-vc — **license unverified** (repo shows no clear permissive tag) | Candidate only after license verification; SVC is the unique capability here |
| `vevo2` (Vevo2, Amphion / RMSnow) | `tts`, `vc`, `svc`, `s2s` — includes editing routes (s2s) & singing conversion | Q8_0 3.09 GB / F16 4.79 GB / orig 7.10 GB | Amphion/RMSnow per-model terms — **UNVERIFIED** (vllm-omni issue 3391 itself flags this) | Defer — license unknown; heavy; unique but needs diligence |
| `rvc` (`RVC-GGUF/rvc-f16.gguf` exists) | ? | 1.2 GB | Undocumented — no docs page, no README | **Skip — undocumented orphan, no docs, don't ship** |

**Port recommendation (not yet executed):** Tone-Color-VC as the OpenVoice replacement lane (replaces `openvoice_onnx_v2` — same upstream lineage, same legal posture, 60× smaller), optionally MeanVC2 as the quality/streaming lane, Seed-VC only after license re-verification, VeVo2 only after license re-verification or Amphion confirmation. RVC stays out.

`._*` naming note: `SeedVC-MLX-GGUF` naming suggests MLX-first packaging but the GGUF packages are GGUF (they pass `--backend cuda`/`--backend cpu` in the docs' quick-start); `MLX` refers to the upstream converted-from-MLX provenance, not a platform gate. Verify a real CPU run before wiring.

## Risks

- ~~audio8_tts unverified~~ — **RESOLVED 2026-11-14** (verified: `docs/models/audio8_tts.md`, HF `audio-cpp/Audio8-TTS-Realistic-0.6b-GGUF`, q8_0 1,363 MB, Apache-2.0).
- **drama-3 CUDA-only** — add `gpu_only:true` + `min_vram_mb` gate so 12 GB cards can't download it; failure mode must be an explicit loader error, not a silent CPU hang.
- **Yue2 two-file weights** (main GGUF + VAE) — generic `download_model` must know the file list; if the current downloader is single-file, extend it minimally (audio.cpp-side `--model` paths for Yue2 reference the directory anyway).
- **Deletion without fallback** means a broken audiocpp_cli on a user's machine = silent failure. Mitigation: clear load-error message telling the user which sidecar asset failed to download and where to retry; no in-app torch reintroduction.
- **Registered voices / cloning transcript parity** — each companion GGUF's `--voice-ref`/`--reference-text` semantics differ per family; arg-builder tests per family are mandatory.
- **Concurrent agents** — stage explicit paths only; NEVER `git add -A` / `git add -p`.

## Open items (before implementation)

1. ~~Verify `audio8_tts`~~ — **done 2026-11-14** (verified: family doc, HF repo, 1,363 MB q8_0, Apache-2.0, `tts`/`clon`).
2. ~~bark_small / steer_tts~~ — **kept, not migrated** (user decision 2026-11-14).
3. `gradium_phonon` — confirm the `gradium/phonon-31m-en` license field via the model card (Apache-2.0 per upstream README; NC-free).
4. Yue2 VAE repo/filesplit — the GGUF directory listing showed the umbrella folder; the actual `yue-s3-0-3B-Q8_0.gguf` + `music-v1` VAE names need confirming to build the download manifest.
5. ~~NeuTTS quant~~ — **ship NeuTTS at its published quant (not q8_0)** (user decision 2026-11-14; sole Q8 exception).
6. Kokoro first-run — confirm the UI shows "model downloads on first generation" correctly with the new GGUF starter (no torch prompts lingering).
7. Final: decide whether SFX also gets a voices/pack-level UX split in future (out of scope now).
