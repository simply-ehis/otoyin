# BUILD_CHECKLIST.md
# Build Verification & Completion Checklist

> This document verifies that the implementation satisfies the engineering standards defined by AGENT.md.
>
> AGENT.md is the source of truth.
>
> BUILD_CHECKLIST.md is its verification layer.
>
> A task is not complete until this checklist has been reviewed.

---

# Scope

## New Projects

For new software:

Review every section.

No section should be skipped unless it is genuinely not applicable.

---

## Existing Projects

For edits, bug fixes, refactors and feature additions:

Only review the sections affected by the change.

However—

If a shared system, architecture or core component was modified:

Review every affected dependency listed inside APP_MAP.md.

---

# 1. Planning

☐ Problem fully understood.

☐ Better solutions considered.

☐ Existing solutions researched.

☐ Open-source alternatives evaluated.

☐ Build vs Integrate decision made.

☐ Version 1 foundation improved where possible.

☐ Planning documentation updated.

---

# 2. Decision Making

☐ Simpler solution considered.

☐ Long-term maintainability considered.

☐ Future scalability considered.

☐ Trade-offs evaluated.

☐ Significant engineering decisions documented.

---

# 3. Research

☐ Official documentation consulted.

☐ Official repositories reviewed.

☐ Recommended implementation followed.

☐ Critical assumptions verified.

---

# 4. Architecture

☐ Responsibilities clearly separated.

☐ Components remain modular.

☐ Shared systems remain stable.

☐ Dependencies remain intentional.

☐ No unnecessary duplication.

☐ Large systems split appropriately.

☐ Existing architecture respected.

---

# 5. Maintainability

☐ Code is understandable.

☐ Naming is clear.

☐ Files remain manageable.

☐ No unnecessary abstraction.

☐ No unnecessary complexity.

☐ Technical debt minimized.

---

# 6. Design

☐ DESIGN.md followed.

☐ Design remains consistent.

☐ Hardware-conscious decisions maintained.

☐ No unnecessary visual complexity.

☐ UI remains consistent.

---

# 7. User Experience

☐ Empty states implemented.

☐ Loading states implemented.

☐ Success states implemented.

☐ Error states implemented.

☐ Help section available.

☐ User messaging matches product context.

---

# 8. Error Handling

☐ Validation exists.

☐ Errors are context-aware.

☐ Recovery considered.

☐ Graceful failure implemented.

☐ Logging included where appropriate.

☐ Silent failures avoided.

---

# 9. Performance

☐ Heavy systems lazy loaded.

☐ Expensive systems cold-loaded.

☐ RAM usage reviewed.

☐ CPU usage reviewed.

☐ Rendering optimized.

☐ Background work minimized.

---

# 10. Hardware

☐ Low-end hardware considered.

☐ Optional heavy features remain optional.

☐ Resource budgets respected.

☐ Efficient alternatives evaluated.

---

# 11. AI

(If Applicable)

☐ Latest supported models used.

☐ Deprecated models avoided.

☐ Better model options evaluated.

☐ BYOK supported where practical.

☐ OpenAI-compatible endpoints supported where practical.

☐ Community fallback implemented where appropriate.

☐ Smaller models evaluated.

☐ AI used only where it adds value.

---

# 12. Connectivity

☐ Online behavior defined.

☐ Offline behavior defined.

☐ Transition behavior defined.

☐ Synchronization behavior defined.

☐ Failure behavior defined.

---

# 13. Documentation

☐ README updated.

☐ USAGE updated.

☐ DESIGN updated.

☐ APP_MAP updated.

☐ Planning documents updated.

☐ Documentation matches implementation.

---

# 14. Skills

☐ Appropriate skills consulted.

☐ Recommendations applied.

☐ Domain-specific guidance followed.

---

# 15. Security

(If Applicable)

☐ SECURITY.md followed.

☐ Inputs validated.

☐ Outputs validated.

☐ Secrets protected.

☐ Permissions reviewed.

☐ External resources trusted appropriately.

---

# 16. Data

(If Applicable)

☐ DATA.md followed.

☐ Data integrity preserved.

☐ Migrations documented.

☐ Import compatibility maintained.

☐ Export compatibility maintained.

☐ Existing user data preserved.

---

# 17. Existing Systems

☐ Existing functionality preserved.

☐ Shared systems remain compatible.

☐ No unintended regressions.

☐ Related modules reviewed using APP_MAP.md.

---

# 18. Configuration

☐ Hardcoded values avoided where appropriate.

☐ Configurable values centralized.

☐ Environment configuration verified.

---

# 19. Completion

☐ Feature fully implemented.

☐ Fully integrated.

☐ Properly documented.

☐ Properly tested.

☐ Maintainable.

☐ Ready for future development.

---

# Final Build Summary

## Build Type

☐ New Project

☐ Major Feature

☐ Minor Feature

☐ Bug Fix

☐ Refactor

☐ Documentation

☐ Hotfix

---

## Documents Updated

☐ README

☐ USAGE

☐ DESIGN

☐ APP_MAP

☐ SECURITY

☐ DATA

☐ Other

---

## Architecture

☐ Changed

☐ Unchanged

---

## Shared Systems

☐ Modified

☐ Unchanged

---

## Migration Required

☐ Yes

☐ No

---

## Checklist Status

☐ Passed

☐ Passed With Documented Exceptions

☐ Requires Additional Work

---

## Final Status

☐ Ready For Release

☐ Ready For Review

☐ Continue Development Required

---

# otoyin — Phases 0–7 Completion Status

## Phase 0 — API Dynamization ✅
- `config.get_server_base_url()` / `get_server_host()` / `get_server_port()` centralized
- Hardcoded `http://127.0.0.1:8000` removed from `voice_chat.py:218`
- MCP `_common.py` reads `TWENTYLABS_HOST` env
- `main.py` / `server.py` default port 17493, read env as fallback

## Phase 1 — ONNX Device Strategy ✅
- `bin/setup-onnx.ps1`: GPU detection → `onnxruntime-directml` or `onnxruntime`
- `_onnx_precision.py`: `resolve_providers()` reads `data/runtime/onnx_provider.json`
- `record_onnx_provider()` persists choice
- `onnxruntime-directml` 1.24.4 installed

## Phase 2 — Unified API Keys Manager ✅
- `model_providers` domain enum extended: `tts|music|sfx|vc|llm|stt`
- `freesound.py` rewritten: DB key via `_get_api_key()` with env fallback
- `clientProviders.ts` API client for CRUD
- `ApiKeysPage.tsx` settings UI (grouped by domain, CRUD, encrypted keys)
- Router wired `/settings/api-keys`
- Translation keys added in en/ja/zh-CN/zh-TW

## Phase 3 — Headless Voice-Changer Service ✅
- `backend/voice_changer/` package: subprocess spawn/kill/status
- Pipeline: VAD → denoise → transcribe → TTS → enhance (LavaSR)
- WS endpoint: OpenAI-Realtime protocol on port 17494
- `VoiceChatSettings`: `voice_changer_enabled`, `voice_changer_port`
- Settings UI: spawn/kill buttons, status indicator

## Phase 4 — LavaSR Streaming Wrapper ✅
- `StreamingLavaSR`: sliding 2–4s windows, overlap-add crossfade, 16k→48k
- `audio_enhancer.py`: `get_streaming_lavasr()` factory
- `audiosronnx` installed

## Phase 5 — Emotion Tags Tier 1 ✅
- `EMOTION_PRESETS` dict (11 presets) in `audio_tags.py`
- `apply_emotion_dsp()`: pitch shift, energy scaling, jitter, brightness filter
- `GenerationRequest.emotion` field (backend + frontend)
- Emotion selector dropdown in `GenerationControlsRow.tsx`
- `/audio/emotion-presets` endpoint
- All 11 presets verified

## Phase 7 — UI Polish ✅
- Settings two-column layout, sidebar collapsible
- Darker palette, pulse animations, logo CSS breath
- Amplitude-reactive warm rose glow

## Verification Status
- ✅ 619 tests passed, 6 skipped (all legitimate)
- ✅ Frontend typecheck clean (6 pre-existing TS6133 warnings only)
- ✅ Vite build successful
- ✅ IMPACT_MAP.md updated
- ⬜ Binary build (`just build`) — pending verification
- ⬜ Steam Audio SDK — user says installed, not yet verified

## Remaining Blockers
- `llama-cpp-python` — source build failed; may need prebuilt Windows wheel
- Steam Audio SDK — user says installed; verification pending
- ~~Tauri MSI/NSIS installer bundling fails (WiX tools issue) — exe itself works~~
  RESOLVED 2026-10-13: `npx tauri build` produced both the release exe and
  `Otoyin Studio_0.1.0_x64-setup.exe` (NSIS). Only the updater-signing step
  exits non-zero on a local machine (no `TAURI_SIGNING_PRIVATE_KEY` env) —
  expected; CI sets the secret (see DEPLOY.md signing-key lifecycle).

# Completion Rule

A task is complete only when:

- Every applicable checklist section has been reviewed.
- APP_MAP.md reflects structural changes.
- Documentation matches the implementation.
- Required companion documents are updated.
- AGENT.md principles have been upheld.

Only then should the Builder declare the task complete.