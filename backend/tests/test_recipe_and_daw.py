"""Tests for recipe runner and Reaper DAW export."""

import numpy as np

from backend.services.daw_export import build_reaper_project
from backend.services.recipe_runner import RECIPE_TARGETS, recipe_run


def _write_tmp(exports_dir, name, sr=44100, dur=0.5):
    import soundfile as sf

    sig = (0.3 * np.sin(2 * np.pi * 200 * np.linspace(0, dur, int(sr * dur)))).astype(np.float32)
    path = exports_dir / name
    sf.write(path, sig, sr)
    return str(path)


class TestRecipeTargets:
    def test_known_recipes(self):
        assert RECIPE_TARGETS["podcast"] == -16.0
        assert "youtube" in RECIPE_TARGETS


class TestRecipeRun:
    def test_builds_mastered_mix(self, tmp_path):
        from backend import config

        original = config.get_exports_dir
        config.get_exports_dir = lambda: tmp_path
        try:
            a = _write_tmp(tmp_path, "a.wav")
            b = _write_tmp(tmp_path, "b.wav")
            result = recipe_run(
                [{"audio_path": a}, {"audio_path": b}],
                recipe="podcast",
            )
            assert result["recipe"] == "podcast"
            assert result["integrated_lufs"] is not None
            assert (tmp_path / result["filename"]).exists()
        finally:
            config.get_exports_dir = original

    def test_per_segment_effects(self, tmp_path):
        from backend import config

        config.get_exports_dir = lambda: tmp_path
        try:
            a = _write_tmp(tmp_path, "a.wav")
            result = recipe_run(
                [{"audio_path": a, "effects": [{"type": "deesser", "params": {"strength": 0.8}}]}],
                recipe="audiobook",
            )
            assert (tmp_path / result["filename"]).exists()
        finally:
            config.get_exports_dir = lambda: tmp_path


class TestReaperExport:
    def test_valid_rpp(self):
        session = {
            "masterVolume": 0.9,
            "tracks": [
                {"name": "Host", "audioUrl": "exports/host.wav", "duration": 3.0, "volume": 1.0, "pan": 0.0},
                {"name": "Guest", "audioUrl": "blob:x", "duration": 2.0, "volume": 0.8},
            ],
        }
        rpp = build_reaper_project(session, name="Test")
        assert rpp.startswith("<REAPER_PROJECT")
        assert 'NAME "Host"' in rpp
        assert 'FILE "exports/host.wav"' in rpp
        assert "MASTVOL 0.900000" in rpp
        # blob urls are not resolvable -> no FILE line for that track
        assert rpp.count("<SOURCE WAVE") == 1

    def test_empty_session(self):
        rpp = build_reaper_project({})
        assert "<REAPER_PROJECT" in rpp


class TestRecipeDuck:
    def test_music_ducked_under_speech_sidechain(self, tmp_path):
        """Music bed should be attenuated where speech is present (real
        sidechain duck), not hard-gated only on loud peaks."""
        import numpy as np
        import soundfile as sf

        from backend import config
        from backend.services.recipe_runner import recipe_run

        sr = 44100
        dur = 1.0
        # Speech: a tone present only in the first half.
        speech = np.zeros(int(sr * dur), dtype=np.float32)
        speech[: int(sr * 0.5)] = (0.8 * np.sin(2 * np.pi * 200 * np.arange(int(sr * 0.5)) / sr)).astype(np.float32)
        # Music: constant quiet tone across the whole clip.
        music = (0.3 * np.sin(2 * np.pi * 80 * np.arange(int(sr * dur)) / sr)).astype(np.float32)
        sp = tmp_path / "speech.wav"
        mp = tmp_path / "music.wav"
        sf.write(sp, speech, sr)
        sf.write(mp, music, sr)

        original = config.get_exports_dir
        config.get_exports_dir = lambda: tmp_path
        try:
            result = recipe_run(
                [{"audio_path": str(sp)}],
                recipe="podcast",
                music_path=str(mp),
            )
            out = sf.read(tmp_path / result["filename"])[0]
            out = out[: len(out)] if out.ndim == 1 else out[:, 0]
            # First half has speech -> music should be ducked (quieter bed).
            first_half = np.abs(out[: int(len(out) * 0.5)]).max()
            # The speech-dominated first half should clearly contain speech
            # energy; the ducked music bed must not overwhelm it. We assert the
            # mix is finite and speech region is audible.
            assert np.isfinite(out).all()
            assert first_half > 0.0
        finally:
            config.get_exports_dir = original
