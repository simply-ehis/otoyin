# 20 — Legacy Tools (Inherited from Voicebox)

Tools inherited from the original Voicebox fork that remain in 21labs.

## Audio Capture
- **What:** Capture system audio output for recording.
- **Where:** `app/src/components/CapturesTab/`
- **Rust:** `start_system_audio_capture`, `stop_system_audio_capture`, `is_system_audio_supported`

## Audio Playback
- **What:** Play audio to system output devices.
- **Where:** `app/src/components/AudioPlayer/AudioPlayer.tsx`
- **Rust:** `play_audio_to_devices`, `stop_audio_playback`, `list_audio_output_devices`

## History
- **What:** Browse and manage previously generated audio.
- **Where:** `app/src/components/HistoryTab/`
- **API:** `GET /history`, query by profile, engine, text

## Transcription
- **What:** Transcribe audio to text using Whisper.
- **Where:** `backend/routes/transcription.py`
- **API:** `POST /transcribe`

## Dictation
- **What:** Real-time speech-to-text dictation with global hotkey activation.
- **Where:** `app/src/components/Dictation/`
- **Rust:** `hotkey_monitor`, `input_monitoring`, `speak_monitor`
- **Flow:** Hotkey → show dictate window → capture audio → transcribe → paste text

## Clipboard Operations
- **What:** Save/restore clipboard for auto-paste pipeline.
- **Where:** `tauri/src-tauri/src/clipboard.rs`
- **Rust:** `save_clipboard`, `restore_clipboard`, `write_text`, `paste_final_text`

## Focus Capture
- **What:** Capture the currently focused application for context.
- **Where:** `tauri/src-tauri/src/focus_capture.rs`
- **Rust:** `debug_capture_focus`, `debug_focus_roundtrip`

## Synthetic Keys
- **What:** Simulate keyboard input for auto-paste.
- **Where:** `tauri/src-tauri/src/synthetic_keys.rs`
- **Rust:** `paste_final_text` (uses platform-specific key simulation)

## Keyboard Layout
- **What:** Map keycodes across different keyboard layouts for chord detection.
- **Where:** `tauri/src-tauri/src/keyboard_layout.rs`
- **Functions:** `paste_keycode_v()`, `V_KEYCODE` (atomic for thread-safe access)
