# 06 — Multi-Track Mixer

## MixerView at `/workspace/mixer`
- **Component:** `MixerView` in `app/src/features/workspace/MixerView.tsx`
- **What:** Channel strips with VU meters, volume faders, pan indicators, mute/solo buttons, and master channel.

## Channel Strips
- **Layout:** Horizontal row of channel strip cards, each in a `min-w-[80px]` card
- **Mock channels:** Voice 1, Voice 2, BG Music, SFX (with per-channel state)

### VU Meters
- **What:** Vertical level meter bar in each channel strip
- **Dimensions:** 12px wide × 96px tall, rounded bar inside a secondary background
- **Color coding:**
  - Green (accent): 0–60% level
  - Yellow (`hsl(48, 96%, 53%)`): 60–80% level
  - Red (destructive): 80–100% level
- **Transition:** Smooth CSS transition on height change

### Volume Faders
- **What:** Vertical slider per channel (0.0–1.0 range, 0.01 step)
- **Orientation:** Vertical via CSS (`flex-col` on slider track)
- **Default:** Per-channel initial values (0.75, 0.6, 0.4, 0.5)

### Pan Indicators
- **What:** Small horizontal bar with centered indicator (L–R)
- **Position:** `left: ((pan + 1) / 2) * 100%` maps -1..1 to 0..100%
- **Display:** L label left, R label right, indicator dot

### Mute/Solo Buttons
- **Mute:** Red highlight when active, "M" label, toggles on click
- **Solo:** Yellow highlight when active, "S" label, toggles on click

## Master Channel
- **What:** Final channel strip with master volume fader
- **Features:** VU meter, volume slider, channel label "Master"

## Mixer Engine (Backend)
- **What:** Mix multiple tracks with volume, pan, mute, solo, bus routing
- **Where:** `backend/services/mixer.py`, `POST /mixer/preview`
- **Channel-level LUFS metering via:** `POST /audio/loudness` (appears as VU meter levels)

## Agent Callable
- **MCP Tools:** `21labs.bounce`, `21labs.bounce_preview`, `21labs.analyze_loudness`, `21labs.list_channels`, `21labs.get_channel`, `21labs.create_channel`, `21labs.get_channel_voices`
- **REST Endpoints:** `POST /audio/bounce`, `POST /audio/bounce-preview`, `POST /audio/loudness`, `GET /channels`, `POST /channels`, `GET /channels/{id}`, `PUT /channels/{id}`, `DELETE /channels/{id}`, `GET /channels/{id}/voices`, `PUT /channels/{id}/voices`
- **Key Backend Files:** `backend/routes/audio.py`, `backend/services/mixer.py`, `backend/routes/channels.py`, `backend/services/channels.py`
- **Key Frontend Files:** `app/src/features/workspace/MixerView.tsx`, `app/src/stores/playerStore.ts`
