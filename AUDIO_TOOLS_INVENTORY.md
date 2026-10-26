# otoyin — Audio Tools Inventory

> Auto-generated inventory of all audio editing, processing, cleanup, synthesis, and analysis
> capabilities in the otoyin project.

## 1. Editing Primitives

| Tool | Backend | What it does |
|------|---------|--------------|
| Copy segment | `backend/routes/audio.py:625-632` | Copy audio region to clipboard |
| Cut segment | `backend/routes/audio.py:635-642` | Remove audio region, return shortened file |
| Paste segment | `backend/routes/audio.py:645-659` | Insert clip at position with optional crossfade |
| Splice (keep region) | `backend/routes/audio.py:880-886` | Keep only region between start_ms and end_ms |
| Delete region | `backend/routes/audio.py:889-895` | Remove region between start_ms and end_ms |
| Insert silence | `backend/routes/audio.py:904-910` | Insert silence at given position |
| Fade in | `backend/routes/audio.py:848-858` | Apply fade-in with optional start position |
| Fade out | `backend/routes/audio.py:861-871` | Apply fade-out with optional end position |
| Time stretch | `backend/routes/audio.py:662-669` | Stretch duration at constant pitch |
| Blend (crossfade) | `backend/routes/audio.py:682-700` | Merge two clips with crossfade (equal_power/linear/exponential) |
| Shout to whisper | `backend/routes/audio.py:672-679` | Soften projected speech into breathy whisper |

## 2. Cleanup & Enhancement

| Tool | Backend | What it does |
|------|---------|--------------|
| Noise reduction | `backend/routes/features.py:42-79` | DeepFilterNet neural denoising |
| Silence removal | `backend/routes/audio.py:384-445` | Remove silent segments from audio |
| Trim silence | `backend/routes/audio.py:923-956` | Trim leading/trailing silence with fade-out |
| Normalize | `backend/routes/audio.py:503-540` | Normalize to target level with peak control |
| Compress | `backend/routes/audio.py:448-500` | Dynamic range compression (threshold/ratio/attack/release) |
| Sidechain ducking | `backend/routes/audio.py:319-381` | Speech enhancement via sidechain ducking |
| De-esser | `backend/services/effects_extended.py:421-452` | Sibilance reduction (4-8 kHz) |
| Spectral denoise | `backend/services/effects_extended.py:455-490` | Stationary noise reduction via spectral subtraction |
| Master | `backend/routes/audio.py:554-571` | Master to broadcast-ready LUFS/true-peak target |
| Analyze loudness | `backend/routes/audio.py:574-585` | Measure LUFS, true-peak, RMS, crest, LRA |

## 3. Effects Chain (25+ effects)

### Via `backend/utils/effects.py` (pedalboard-based)

| Effect | Description |
|--------|-------------|
| Chorus/Flanger | Modulated delay (short = flanger, long = chorus) |
| Reverb | Room reverb with damping/width |
| Delay | Echo/delay line with feedback |
| Compressor | Dynamic range compression |
| Gain | Volume adjustment in dB |
| High-Pass Filter | Remove low frequencies |
| Low-Pass Filter | Remove high frequencies |
| Pitch Shift | Semitone pitch shifting |
| Gender Swap | Pitch + formant shifting |
| Age Shift | Perceived age manipulation |
| Helium | High-pitch helium voice effect |
| Vocoder | Robotic amplitude modulation |
| Telephone/Radio | Bandpass + compression effect |
| Megaphone | Distortion + bandpass effect |
| Underwater | Lowpass + reverb + tremolo |
| Whisper Transform | Remove fundamental, enhance breathiness |
| Auto-Tune | Scale-aware pitch correction |
| Spectral Ducking | Dynamic EQ sidechaining |
| Multi-Band Pitch | Independent frequency band shifting |
| Resonant Filter Sweep | LFO-modulated filter sweep |
| Spectral Repair | Clicks, sibilance, plosives, hum removal |
| Multi-Mic Phase | Phase alignment for multi-mic bleed |
| Smart Crossfade | Non-linear adaptive crossfade |

### Via `backend/services/effects_chain.py`

| Effect | Description |
|--------|-------------|
| Pitch Shift | Phase-vocoder pitch shifting |
| Formant Shift | FFT frequency-axis scaling |
| Time Stretch | Duration change at constant pitch |
| Reverb | Parallel wet/dry convolution |
| Delay | Feedback delay line |
| Chorus | Modulated delay chorus |
| Distortion | Tanh-based distortion |
| EQ | 3-band equalizer |
| Compressor | Smoothed gain compressor |
| Noise Gate | Threshold-based gate |
| Sidechain Duck | Sidechain attenuation |
| Silence Removal | Remove silent segments |
| Normalize | Peak normalization |
| De-esser | Delegates to extended effects |
| Spectral Denoise | Delegates to extended effects |
| Emotion Tone | Warmth/energy/brightness/formant |

## 4. Voice Conversion

| Tool | Backend | What it does |
|------|---------|--------------|
| RVC v2 | `backend/routes/voice_convert.py:65-125` | Retrieval-based voice conversion |
| Seed-VC | `backend/routes/voice_convert.py:65-125` | Zero-shot voice cloning with reference audio |
| List voice packs | `backend/routes/voice_convert.py:39-62` | List available RVC voice packs |

## 5. Stem Separation

| Tool | Backend | What it does |
|------|---------|--------------|
| Separate audio | `backend/routes/audio.py:588-611` | Demucs stem separation (vocals/drums/bass/other) |

## 6. Emotion & Tone Processing

| Tool | Backend | What it does |
|------|---------|--------------|
| Emotion/tone | `backend/routes/audio.py:714-749` | Post-process with warmth/energy/brightness/formant controls |
| Breath/pause control | `backend/routes/audio.py:762-794` | Insert breath sounds and scale pause durations |
| Adjust pauses | `backend/routes/audio.py:804-835` | Extend short pauses, trim long pauses |

## 7. DSP Synthesizers

| Synth | Backend | What it does |
|-------|---------|--------------|
| Subtractive | `backend/routes/dsp.py:132-143` | Oscillator -> filter -> ADSR envelope |
| FM | `backend/routes/dsp.py:144-145` | DX7-style 4-operator FM synthesis |
| Drum | `backend/routes/dsp.py:146-147` | Kick/snare/hihat/clap/tom/cymbal synthesis |
| Chiptone | `backend/routes/dsp.py:148-149` | Retro game console chip tones |
| Pluck | `backend/routes/dsp.py:150-151` | Karplus-Strong string synthesis |
| Dial-up | `backend/routes/dsp.py:152-153` | Vintage modem connection sounds |
| Robot Speech | `backend/routes/dsp.py:154-155` | Synthesized robotic speech |

## 8. Classical DSP Effects

| Effect | Backend | What it does |
|--------|---------|--------------|
| Vocoder | `backend/routes/dsp.py:166-167` | Robotic amplitude modulation |
| Bitcrush | `backend/routes/dsp.py:168-169` | Bit depth reduction distortion |
| Distortion | `backend/routes/dsp.py:170-171` | Drive-based distortion |
| Tape saturation | `backend/routes/dsp.py:172-173` | Analog tape warmth |
| Filter | `backend/routes/dsp.py:174-175` | Lowpass/highpass/bandpass filter |
| Delay | `backend/routes/dsp.py:176-177` | Echo/delay line with feedback |
| Phaser | `backend/routes/dsp.py:178-179` | Phaser/flanger effect |
| Pitch drift | `backend/routes/dsp.py:180-181` | Pitch modulation/drift |
| Ring modulation | `backend/routes/dsp.py:182-183` | Amplitude modulation at carrier frequency |
| Reverb | `backend/routes/dsp.py:184-185` | Convolution reverb |
| Robotize | `backend/routes/dsp.py:186-187` | Combined vocoder + bitcrush |

## 9. Spatial Audio

| Tool | Backend | What it does |
|------|---------|--------------|
| Binaural panning | `backend/routes/spatial.py:135-150` | HRTF-based 3D positioning |
| Convolution reverb | `backend/routes/spatial.py:153-176` | Environmental reverb (car/coffee shop/bedroom/church/booth) |
| Doppler effect | `backend/routes/spatial.py:179-188` | Speed-based pitch shift |
| Full spatial render | `backend/routes/spatial.py:191-236` | Combined doppler + binaural + convolution |

## 10. Audio Analysis & Visualization

| Tool | Backend | What it does |
|------|---------|--------------|
| Spectrogram | `backend/routes/spectrogram.py:17-59` | Compute spectrogram data for visualization |
| Pitch analysis | `backend/routes/pitch.py:92-129` | YIN pitch detection algorithm |
| Loudness measurement | `backend/routes/features.py:82-97` | ITU-R BS.1770-4 loudness measurement |

## 11. Generation

| Tool | Backend | What it does |
|------|---------|--------------|
| Music generation | `backend/routes/generate.py:35-77` | ACE-Step music generation |
| SFX generation | `backend/routes/generate.py:80-121` | Stable Audio Open sound effects |
| Bark sounds | `backend/routes/generate.py:124-170` | Non-verbal sounds (laughs, sighs, etc.) |

## 12. Procedural Instruments

| Tool | Backend | What it does |
|------|---------|--------------|
| Piano note | `backend/routes/instruments.py:98-102` | Additive synthesis piano |
| Drum pad | `backend/routes/instruments.py:105-109` | Synthesized drum hits |
| Synth note | `backend/routes/instruments.py:112-116` | Oscillator-based synth |
| Noise generator | `backend/routes/instruments.py:119-123` | White/pink/brown noise |
| GM instruments | `backend/routes/instruments.py:144-151` | General MIDI SoundFont rendering |
| Drum machine | `backend/routes/instruments.py:154-164` | Lane-grid (per-step velocity + swing) or step-list loop synthesis |

## 13. Multi-track & Mixing

| Tool | Backend | What it does |
|------|---------|--------------|
| Bounce mix | `backend/routes/audio.py:288-302` | Mix multiple tracks with effects/automation |
| Mixer preview | `backend/routes/mixer.py:16-113` | Preview mixed audio with bus routing |
| Channels | `backend/routes/channels.py:13-98` | Manage audio channels and voice assignments |

## 14. Import/Export

| Tool | Backend | What it does |
|------|---------|--------------|
| Extract from video | `backend/routes/extended_import.py:88-97` | Extract audio track from video |
| Convert format | `backend/routes/extended_import.py:100-125` | WAV/MP3/FLAC/OGG + optional cleanup |
| Audio info | `backend/routes/extended_import.py:128-133` | Get metadata (duration, sample rate, channels) |
| Bridge import | `backend/routes/audio_bridge.py:27-43` | Import audio from Library/Motion |
| Bridge export | `backend/routes/audio_bridge.py:46-90` | Export as WAV/MP3/FLAC/OGG with normalization |

## 15. Platform Export Presets

| Preset | Backend | Target |
|--------|---------|--------|
| Podcast | `backend/routes/platform_export.py:31-37` | MP3, -16 LUFS |
| Audiobook | `backend/routes/platform_export.py:38-44` | MP3 mono, -18 LUFS |
| Movie audio | `backend/routes/platform_export.py:45-51` | WAV 24-bit, -24 LUFS |
| Voiceover | `backend/routes/platform_export.py:52-58` | WAV 24-bit, -12 LUFS |
| Social media | `backend/routes/platform_export.py:59-65` | MP3, -14 LUFS |

## 16. Transcription & Subtitles

| Tool | Backend | What it does |
|------|---------|--------------|
| Transcribe | `backend/routes/transcription.py:22-87` | Whisper speech-to-text |
| Export subtitles | `backend/routes/transcription.py:135-162` | SRT/VTT/ASS subtitle export |
| Word timestamps | `backend/routes/transcript_edit.py:30-52` | Word-level timing for transcript editing |

## 17. Audio Tags & Non-verbal Sounds

| Tool | Backend | What it does |
|------|---------|--------------|
| Apply audio tags | `backend/routes/audio.py:971-1041` | Parse [laughs], [sigh], [pause] tags and synthesize |
| List audio tags | `backend/routes/audio.py:1044-1064` | List supported tags with sample availability |
| Tag preview | `backend/routes/audio.py:1081-1144` | Preview single audio tag generation |

## 18. Recipe System

| Tool | Backend | What it does |
|------|---------|--------------|
| Run recipe | `backend/routes/recipe.py:26-48` | Orchestrate content-type recipes (podcast, etc.) |

## 19. Compedits

| Tool | Backend | What it does |
|------|---------|--------------|
| Assemble comp | `backend/routes/comping.py:69-86` | Concatenate selected take regions with crossfade |

## 20. TTS Engines (16)

| Engine | File | Description |
|--------|------|-------------|
| Qwen TTS | `registry.py:197-206` | Default engine (MLX or PyTorch) |
| Kokoro | `registry.py:223-241` | ONNX optimized |
| Zonos | `registry.py:247-249` | Zero-shot voice cloning |
| F5-TTS | `registry.py:276-293` | ONNX optimized |
| StyleTTS2 | `registry.py:254-271` | ONNX optimized |
| ChatTTS | `registry.py:272-275` | Conversational TTS |
| Piper TTS | `registry.py:294-311` | Lightweight ONNX |
| Pocket TTS | `registry.py:312-315` | Compact TTS |
| MOSS TTS Nano | `registry.py:316-334` | Nano ONNX |
| Kitten TTS | `registry.py:339-354` | ONNX-based |
| Parler TTS | `registry.py:335-338` | Descriptive TTS |
| Fish Speech | `registry.py:242-245` | Multi-lingual |
| Orpheus | `registry.py:219-221` | Emotional TTS |
| NeuTTS | `registry.py:212-218` | Neural TTS |
| Step Audio EditX | `registry.py:250-253` | Audio editing TTS |
| Bark | `bark_backend.py` | Non-verbal sounds |

## 21. MCP Tools (AI assistant integration)

### Audio Processing
`21labs.spectrogram`, `21labs.noise_reduce`, `21labs.normalize_audio`, `21labs.master_audio`,
`21labs.separate_audio`, `21labs.run_recipe`, `21labs.arrange_music`, `21labs.bounce_preview`,
`21labs.compress_audio`, `21labs.duck_audio`, `21labs.silence_removal`, `21labs.analyze_loudness`,
`21labs.apply_audio_tags`, `21labs.list_audio_tags`, `21labs.sample_manifest`,
`21labs.emotion_tone`, `21labs.breath_pause`, `21labs.adjust_pauses`,
`21labs.fade_in`, `21labs.fade_out`, `21labs.splice`, `21labs.delete_region`,
`21labs.insert_silence`, `21labs.trim_silence`

### DSP
`21labs.dsp_capabilities`, `21labs.dsp_synth`, `21labs.dsp_effect`

### Voice Conversion
`21labs.voice_changer_capabilities`, `21labs.list_voice_packs`, `21labs.convert_voice`

## 22. Frontend Components (UI)

### Effects Tab
- `EffectsChainEditor.tsx` — drag-and-drop effects chain builder
- `EffectsList.tsx` — available effects browser
- `EffectsDetail.tsx` — effect parameter editor

### Audio Studio
- `TrackStripInner.tsx` — individual track controls
- `PluginChainPanel.tsx` — per-track plugin chain
- `WaveformCanvas.tsx` — waveform visualization
- `CrossfadeCanvas.tsx` — crossfade editing
- `AutomationOverlay.tsx` — volume/pan automation
- `MidiPianoRoll.tsx` — MIDI note editing

### Analysis
- `SpectrogramView.tsx` — spectrogram visualization
- `SpectrogramCanvas.tsx` — spectrogram rendering
- `PianoRoll.tsx` — pitch visualization

---

**Total unique capabilities: 150+**
