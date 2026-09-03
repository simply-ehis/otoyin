# 19 — Voice Changer (Live Mode)

## VoiceChangerView at `/voice-changer`
- **Component:** `VoiceChangerView` in `app/src/components/Workspace/VoiceChangerView.tsx`
- **What:** Real-time voice transformation UI. Start/stop button with pulsing red dot, pitch/formant sliders, reverb mix, and latency display.

## Start/Stop Button
- **Icon:** Circle icon — pulsing red (`animate-pulse`) when active
- **Label:** "Start" / "Stop" toggle
- **Style:** Destructive variant when active, default when stopped
- **State:** `isActive` boolean toggles on click

## Pitch Slider
- **Range:** -12 to +12 semitones (0.5 step)
- **Label:** "Pitch Shift" with current value (e.g. "+3 st")
- **Display:** Font-mono tabular-nums for the value readout

## Formant Slider
- **Range:** -6 to +6 semitones (0.5 step)
- **Label:** "Formant Shift" with current value
- **Display:** Same style as pitch slider

## Reverb Mix
- **Range:** 0.0–1.0 (0.01 step)
- **Label:** "Reverb Mix" with percentage display
- **Default:** 0.3 (30%)

## Latency Display
- **Icon:** Gauge icon
- **Label:** "Latency:" with badge showing current ms value
- **Format:** Font-mono badge (e.g. "45ms")
- **State:** `latency` state initialized to 45ms, adjustable via capabilities

## Capabilities
- **What:** Fetch available ranges from `GET /voice-changer/capabilities`
- **Returns:** pitch_shift_range, formant_shift_range, min/max latency, reverb_mix support
- **Fallback:** Hardcoded defaults if fetch fails

## Audio Pipeline (Backend)
1. Capture microphone input (10ms frames)
2. Apply effects chain (pitch_shift, formant_shift, reverb, chorus)
3. Output to speakers/headphones
4. Target latency <50ms, max 4 effects per chain

## Agent Callable
- **MCP Tools:** `21labs.voice_changer_capabilities`, `21labs.list_voice_packs`, `21labs.convert_voice`
- **REST Endpoints:** `GET /voice-changer/capabilities`, `GET /voice-packs`, `POST /voice-convert`, `POST /settings/voice-changer/spawn`, `POST /settings/voice-changer/kill`, `GET /settings/voice-changer/status`
- **Key Backend Files:** `backend/routes/voice_convert.py`, `backend/routes/features.py`, `backend/routes/settings.py`, `backend/backends/rvc_backend.py`, `backend/backends/seed_vc_backend.py`, `backend/backends/openvoice_backend.py`
- **Key Frontend Files:** `app/src/components/Workspace/VoiceChangerView.tsx`, `app/src/components/Workspace/VoiceConverterView.tsx`, `app/src/stores/voiceChangerStore.ts`
