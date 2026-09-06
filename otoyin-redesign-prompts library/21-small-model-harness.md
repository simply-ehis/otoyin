# Prompt: Harness for the Small Bundled Models

## Context

The four always-bundled small models (DeepFilterNet, Demucs/stem
separation, Silero VAD, LavaSR — per `backend/scripts/
download_required_models.py`) are integrated as one-off services in
`backend/services/`, not through the same `backends/registry.py` +
`backends/protocols.py` pattern used for every TTS/STT/VC/Music engine.
That's a reasonable initial choice (they're utility preprocessing steps,
not full generation engines), but the audit found real fragmentation
worth cleaning up, since these four models are used constantly — VAD gates
STT, DeepFilter cleans generated audio, stem separation feeds dubbing and
the audiobook pipeline — any inconsistency here has wide blast radius.

## Confirmed gaps

1. **Duplicate implementations, unclear which is canonical.**
   `backend/services/deepfilter_cleanup.py` (100 lines) and
   `backend/services/deepfilter_onnx.py` (167 lines) both integrate
   DeepFilterNet. Same pattern with `stem_separation.py` (92 lines) and
   `stem_separation_onnx.py` (103 lines) for Demucs. **First task: figure
   out if this is intentional** (e.g. ONNX path for CPU-only/lighter
   deployment targets, PyTorch path for GPU) **or leftover duplication**
   from a migration that never finished. If intentional, document the
   selection logic clearly (which one runs when, and why) — the audit
   couldn't find that decision point recorded anywhere. If it's leftover,
   consolidate to one implementation and delete the other.
2. **Not lifecycle-managed.** `backend/utils/model_lifecycle.py` (the
   idle-unload + circuit-breaker system from 06) has zero references to
   deepfilter/demucs/vad/lavasr. That may be fine if these are cheap enough
   to just instantiate per-call with no meaningful load cost — confirm
   that's actually true (measure it, don't assume it) — but if any of them
   have real load time or can fail repeatedly (a corrupt cached model file,
   a missing ONNX runtime provider), they'd benefit from the same
   circuit-breaker protection everything else has. Given 01 flagged the
   circuit breaker as a likely source of perceived "flakiness" precisely
   *because* it currently has no UI surface — an unmanaged small-model
   backend that fails silently and repeatedly on every request is an even
   worse version of that same problem, with no cooldown at all.
3. **Thin test coverage.** Only `backend/tests/test_vad.py` was found for
   this group — no test files matched for deepfilter, stem separation, or
   LavaSR by name. Given these are load-bearing, cross-cutting utilities,
   this is a good candidate to fold into 14 (testing strategy) rather than
   treat as a separate testing effort — but flag it explicitly there so it
   doesn't get lost among the much larger frontend testing scope.
4. **Consistency of interface.** Since these aren't using the shared
   `protocols.py` interface, check whether their input/output contracts
   (audio format in/out, error types raised, how they report progress for
   longer operations) are at least *consistent with each other*, even if
   they don't formally implement the same protocol as the bigger engines.
   Inconsistent error handling between these four specifically is the kind
   of thing that produces confusing, hard-to-debug failures precisely
   because they're invoked so often across so many different features.

## Scope of the fix

1. Resolve the duplication (consolidate or document-and-keep-both with a
   clear selection rule).
2. Decide, with actual measurement, whether these need lifecycle
   management — if yes, integrate them into `model_lifecycle.py` the same
   way the bigger engines are; if no, document why not so a future agent
   doesn't "fix" this by adding unnecessary overhead.
3. Bring test coverage up to parity with the rest of the backend's
   standard (130 test files exist for everything else — these four
   shouldn't be the exception).
4. Normalize error handling/logging across the four, even without a formal
   shared protocol.

## Deliverable

A short doc recording the ONNX-vs-non-ONNX decision (or the consolidation,
if it turns out to be dead-code duplication), a lifecycle-management
decision backed by real measurement, and test files bringing these four to
the same coverage standard as the rest of the backend.
