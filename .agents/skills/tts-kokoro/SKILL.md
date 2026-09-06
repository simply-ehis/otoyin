---
name: tts-kokoro
description: Generate speech with Kokoro-82M — pick/blend preset voices, handle the long-text hang with chunking+timeout, use POST /speak or 21labs.speak.
---

# Kokoro TTS (Kokoro-82M)

## Purpose
Kokoro-82M is the lightest, fastest TTS engine in otoyin (~82M params, CPU realtime,
24kHz mono). It has NO zero-shot cloning — it uses 50 preset style vectors plus optional
voice blending and custom `.pt` VoicePacks. Use it for fast, cheap, multi-language
narration where a cloned voice is not required.

## When to use
- User wants fast, low-VRAM speech and a preset voice is acceptable.
- Multi-language short/medium text in en/es/fr/hi/it/pt/ja/zh.
- Need two+ voices blended or a custom `.pt` pack (no reference-audio cloning).

## Prerequisites
- Engine/model: `kokoro` — `hexgrad/Kokoro-82M` (350 MB). Download via `POST /models/download` (model_name `kokoro`) or MCP `21labs.models_download`.
- Tool surface: MCP `21labs.speak`; REST `POST /speak`; assistant `apply_effects`.
- Voice/profile: pick a preset (`preset_voice_id`) or blend via comma list; no reference audio needed.

## Parameters / Schema (REAL from code)
| param | range | default | notes |
|-------|-------|---------|-------|
| engine | `kokoro` | — | pass to `21labs.speak` / `POST /speak` |
| voice / preset_voice_id | any `KOKORO_VOICES` id, or `"id1,id2"` blend | `af_heart` (`KOKORO_DEFAULT_VOICE`) | blend averages style vectors |
| language | en,es,fr,hi,it,pt,ja,zh | `en` | mapped to Kokoro lang char: a/e/f/h/i/p/j/z (`LANG_CODE_MAP`) |
| seed | int | none | per-chunk seed = seed + chunk_index (deterministic) |
| speed | — | 1.0 | **hardcoded** to 1.0 in `kokoro_backend._generate_chunk` (`speed=1.0`); KPipeline accepts a speed arg but this backend never passes it, so any speed value sent for Kokoro is ignored |
| KOKORO_CHUNK_MAX_CHARS | 250 | 250 | split threshold in `kokoro_backend.py` |
| KOKORO_CHUNK_TIMEOUT (s) | 120 | 120 | wall-clock per chunk (multi-chunk path) |
| KOKORO_SINGLE_TIMEOUT (s) | 300 | 300 | wall-clock for a single short sentence |
| KOKORO_CROSSFADE_MS | 50 | 50 | crossfade when re-joining chunks |

Output: mono 24 kHz float32 (`KOKORO_SAMPLE_RATE`). 50 voices incl. af_bella/af_sky (us),
am_* (us m), bf_*/bm_* (uk), ef_*/em_* (es), ff_siwis (fr), hf_*/hm_* (hi), if_*/im_* (it),
jf_*/jm_* (ja), pf_*/pm_* (pt), zf_* (zh). List at runtime via `GET /profiles/presets/kokoro`.

## Agent procedure
1. Ensure `kokoro` downloaded: `21labs.models_download(model_name="kokoro")`.
2. Choose a voice. To blend: `"af_bella,af_sky"`. To use a custom pack: set
   `preset_voice_id` to a `.pt` path (KokoroVoicePack) — `[VERIFY IN CODE]` wiring status.
3. Match `language` to the voice's language family (a British voice is still `en`).
4. Generate:
   - MCP: `21labs.speak(text=..., profile=..., engine="kokoro", language="en")`
   - REST: `POST /speak` with `{"text": "...", "engine": "kokoro", "language": "en"}`
5. Long text (any paragraph) is auto-split at ≤250 chars and each chunk bounded by a
   timeout — a hung chunk is skipped + logged, the rest is crossfaded back.

## Worked example
```jsonc
// REST — blend two US female voices, English
POST /speak
{ "text": "Welcome to otoyin, your offline voice studio.",
  "engine": "kokoro", "language": "en", "profile": "Kokoro Bella+Sky" }
// profile was created with preset_voice_id = "af_bella,af_sky"
```
```python
# MCP
21labs.speak(text="Welcome to otoyin.", engine="kokoro",
                 profile="Kokoro Bella+Sky", language="en")
```

## Pitfalls / Gotchas
- **No zero-shot cloning.** Kokoro cannot clone from arbitrary reference audio — only
  preset blending + custom `.pt` packs. For a real clone use `../tts-qwen/SKILL.md` (Fish Speech removed: CC-BY-NC weights),
  or see `../engine-atlas/SKILL.md` for CLONING_ENGINES.
- **Long-text hang (fixed):** KPipeline only splits on `\n`; a long paragraph fed whole to
  misaki G2P could stall forever. The backend pre-splits at 250 chars and bounds each chunk
  with a timeout, so a bad chunk is skipped instead of pinning the serial queue.
- A stalled Python worker thread cannot be force-killed — it lingers until it exits
  naturally. Under normal load chunks finish in <1 s, so pool exhaustion is not a concern.
- `speed` is currently fixed at 1.0 in this backend.
- First-call model load is slow on CPU-only machines (env-specific).

## Cross-links
- [engine-atlas](../engine-atlas/SKILL.md)
- [voice-profiles](../voice-profiles/SKILL.md)
- [voice-cloning](../voice-cloning/SKILL.md)

## Validation
- `GET /profiles/presets/kokoro` returns the voice list.
- Generation returns a `generation_id`; poll `GET /generate/{id}/status` → completed,
  audio at 24 kHz mono. A deliberately hung sentence raises `TimeoutError` (no infinite hang).
