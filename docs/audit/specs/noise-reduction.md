# Spec: Noise Reduction

## Goal
Remove background noise with AI or profile-based mode, strength control, A/B.

## User story
User imports audio → picks mode + strength → processes → compares A/B → exports.

## Layout
- Top: file info + waveform/spectrogram
- Middle: mode selector (AI/profile), strength slider, model picker
- Bottom: A/B toggle, progress, export

## States
- Empty: drop zone
- Loading: processing
- Done: result playable
- Error: toast + retry

## Controls/defaults
- Mode: AI (DeepFilter) default; strength 0.5
- Model not installed: install button

## Backend calls
- noise reduction route/service, deepfilter backend.

## Acceptance criteria
- Cancel stops processing and frees memory.
- A/B switches between original and processed.
- Model picker shows installed state.