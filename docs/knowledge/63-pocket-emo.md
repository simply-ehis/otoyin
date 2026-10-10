# 63 — Pocket-TTS EmoShift (Emotion Steering)

> **REMOVED 2026-08.** EmoShift was removed with the marketplace-launch engine cleanup.
> `pocket_emo_backend.py` no longer exists. Kept for historical reference only.

PURPOSE: Pocket-TTS with SouraTTS's EmoShift activation steering — 6 emotion vectors (27KB total) injected into transformer layer 5 during inference. Adds emotional expressiveness without retraining.
OWNS: backend/backends/pocket_emo_backend.py, routes/audio.py (/audio/pocket-emo/emotions)
READ-WHEN: Adding emotion control to TTS, or modifying the EmoShift steering layer.
KEY-FILES: backend/backends/pocket_emo_backend.py, backend/backends/pocket_tts_backend.py
INVARIANTS: Emotion steering vectors are frozen — never retrained. Pocket-TTS base model is frozen. Only the steering vectors and intensity parameter change.
GOTCHAS: Requires PyTorch version of Pocket-TTS (not ONNX). Hook on layer 5 — if Pocket-TTS architecture changes, update _injection_layer.
UPDATED: 2026-08-02

---

## Architecture

```
Text input ──→ [ Pocket-TTS frozen (100M params) ] ──→ Audio
                         ↑
               Layer 5 output + (intensity × steering_vector[emotion])
                         ↑
               [ EmoShift Layer (27KB, 6 × 1024 params) ]
```

## How It Works

1. **Steering vectors**: 6 float32 arrays (1024 floats each), one per emotion
2. **Injection**: Forward hook on transformer layer 5 adds the steering vector to the output
3. **Control**: `intensity` parameter scales the vector (0.0 = neutral, 1.0 = full emotion)
4. **Overhead**: 6 × 1024 float32 additions per forward pass — negligible

## Supported Emotions

| Emotion | Recommended Intensity |
|---------|----------------------|
| neutral | 0.0 |
| happy | 0.8 – 1.0 |
| sad | 0.8 – 1.0 |
| angry | 0.8 – 1.0 |
| fear | 0.8 – 1.0 |
| disgust | 0.8 – 1.0 |

## Built-in Voices

`alba` `marius` `cosette` `jean` `fantine` `eponine` `azelma` `javert`

**Alba** is recommended — highest quality and most stable across all emotions.

## Usage

### Backend

```python
from backend.backends.pocket_emo_backend import pocket_emo_backend

# Load model
await pocket_emo_backend.load_model()

# Generate with emotion
audio, sr = await pocket_emo_backend.generate(
    text="I just got the job!",
    voice_prompt={"ref": "alba"},
    instruct="emotion=happy,intensity=0.9",
)
```

### API

```
GET /audio/pocket-emo/emotions
  returns: { emotions, voices, recommended_intensity }
```

### Generate via MCP/REST

```json
{
  "text": "I just got the job!",
  "engine": "pocket_emo",
  "voice": "alba",
  "instruct": "emotion=happy,intensity=0.9"
}
```

## Weights

- Source: `Sourajit123/SouraTTS` (HuggingFace)
- File: `SouraTTS.pt` (27KB)
- Training: CREMA-D dataset (7,442 emotional speech clips)
- License: MIT

## Files

| File | Purpose |
|------|---------|
| `backend/backends/pocket_emo_backend.py` | EmoShift backend with layer 5 hook |
| `backend/backends/registry.py` | Registered as `pocket_emo` |
| `backend/backends/protocols.py` | Added to TTS_ENGINES |
| `backend/routes/audio.py` | GET /audio/pocket-emo/emotions |

## Agent Callable
- **MCP Tools:** `21labs.emotion_tone`
- **REST Endpoints:** `POST /audio/emotion-tone`
- **Key Backend Files:** `backend/backends/pocket_tts_onnx_backend.py`, `backend/services/emotion_tone.py`, `backend/routes/audio_effects.py`
- **Key Frontend Files:** `app/src/features/generate/Composer.tsx`
