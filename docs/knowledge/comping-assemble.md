# Comping Assembly

PURPOSE: Assemble selected multi-take comp regions into one playable composite clip.
OWNS: backend/routes/comping.py (POST /comping/assemble), app/src/components/Workspace/MultiTakeCompingView.tsx
READ-WHEN: Changing how the Comping view builds or plays a composite take.
KEY-FILES: backend/routes/comping.py, app/src/lib/api/client.ts (assembleComp), MultiTakeCompingView.tsx
INVARIANTS: Segments are assembled in request order; each segment is either a slice of provided base64 WAV (by start/end ms) or a synthesized preview tone.
GOTCHAS: With no take audio the endpoint synthesizes tones so "Play Comp" works end-to-end; the Comping view records real mic takes via useAudioRecording (WAV) and sends them as audio_base64. Crossfade shortens the output by one fade window.
UPDATED: 2026-07-15
