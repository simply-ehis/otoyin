# Music Backend Interface

PURPOSE: Unified on-device interface for music / song / beat / SFX generation.
OWNS: backend/backends/__init__.py (`MusicBackend`, `get_music_backend`), backends/stable_audio_backend.py
READ-WHEN: Adding a new music/sfx engine, or calling music generation from a route or MCP tool.
KEY-FILES: backend/backends/__init__.py:MusicBackend, backend/routes/generate.py
INVARIANTS: Every music backend exposes `load_model / generate / is_available / is_loaded / unload_model`; `generate` returns `(np.ndarray, int)` = (audio, sample_rate).
GOTCHAS: `generate` params `genre/mood/tempo` are required by the protocol (for future song engines) but ignored by Stable Audio (SFX).
UPDATED: 2026-08-19

## Contract

```python
class MusicBackend(Protocol):
    def load_model(self) -> None: ...
    def generate(self, prompt, duration_seconds=30.0, genre="pop",
                 mood="neutral", tempo=None, seed=None) -> tuple[np.ndarray, int]: ...
    def is_available(self) -> bool: ...
    def is_loaded(self) -> bool: ...
    def unload_model(self) -> None: ...
```

## Factory

`get_music_backend(engine="stable_audio")` is a singleton factory (thread-locked) mirroring
the TTS factory. Engines:

| engine | backend | capability |
|--------|---------|------------|
| `stable_audio` | `StableAudioBackend` | sound effects |

> ACE-Step (song generation) and Bark (non-verbal sounds) were removed 2026-08; only
> Stable Audio Open remains. `MUSIC_ENGINES` in `backend/backends/protocols.py` lists it.

## Adding an engine

1. Implement the protocol methods on the backend class.
2. Add the engine key to `MUSIC_ENGINES` in `backend/backends/protocols.py`.
3. Add an `elif engine == "..."` branch in `get_music_backend` (lazy import).
4. Add a `get_model_load_func` branch if the model is downloadable.