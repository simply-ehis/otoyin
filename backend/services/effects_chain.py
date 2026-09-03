"""Advanced audio effects chain and mixing utilities."""

import logging

import numpy as np

from .effects import EffectConfig, apply_pitch_shift as _lib_pitch_shift, apply_time_stretch as _lib_time_stretch

logger = logging.getLogger(__name__)


class AudioEffectsChain:
    """Apply multiple audio effects to process audio samples."""

    def __init__(self):
        self.effects = {
            "pitch_shift": self._apply_pitch_shift,
            "formant_shift": self._apply_formant_shift,
            "time_stretch": self._apply_time_stretch,
            "reverb": self._apply_reverb,
            "delay": self._apply_delay,
            "chorus": self._apply_chorus,
            "distortion": self._apply_distortion,
            "eq": self._apply_eq,
            "compressor": self._apply_compressor,
            "noise_gate": self._apply_noise_gate,
            "sidechain_duck": self._apply_sidechain_duck,
            "silence_removal": self._apply_silence_removal,
            "normalize": self._apply_normalize,
            "deesser": self._apply_deesser,
            "spectral_denoise": self._apply_spectral_denoise,
            "emotion_tone": self._apply_emotion_tone,
        }

    def apply_chain(self, audio: np.ndarray, sample_rate: int, chain: list[EffectConfig]) -> np.ndarray:
        """Apply a chain of effects to audio."""
        processed = audio.copy()
        audio_history = []

        for effect in chain:
            if not effect.enabled:
                continue

            try:
                if effect.effect_type in self.effects:
                    processed = self.effects[effect.effect_type](processed, sample_rate, effect.params)
                    audio_history.append(processed.copy())
                else:
                    logger.warning(f"Unknown effect type: {effect.effect_type}")
            except Exception as e:
                logger.error(f"Error applying effect {effect.effect_type}: {e}")
                raise

        return processed

    def _apply_pitch_shift(self, audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
        """Shift pitch by `semitones` while keeping the original duration.

        Delegates to the shared phase-vocoder implementation in `effects`.
        """
        return _lib_pitch_shift(audio, sample_rate, params)

    def _apply_formant_shift(self, audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
        """Shift vocal formants via FFT frequency-axis scaling of the spectral
        envelope. Approximate (pitch is also affected, since true pitch-
        independent shifting needs LPC analysis), but a real transform rather
        than a no-op."""
        shift_factor = float(params.get("shift_factor", 1.0))
        if shift_factor <= 0 or shift_factor == 1.0:
            return audio
        audio = np.asarray(audio, dtype=np.float64)
        n = len(audio)
        if n < 2:
            return audio.astype(np.float32)
        spectrum = np.fft.rfft(audio)
        freqs = np.fft.rfftfreq(n, d=1.0 / sample_rate)
        shifted_freqs = freqs * shift_factor
        mag = np.abs(spectrum)
        phase = np.angle(spectrum)
        new_mag = np.interp(freqs, shifted_freqs, mag, left=0.0, right=0.0)
        new_phase = np.interp(freqs, shifted_freqs, phase, left=0.0, right=0.0)
        new_spectrum = new_mag * np.exp(1j * new_phase)
        shifted = np.fft.irfft(new_spectrum, n=n)
        return shifted.astype(np.float32)

    def _apply_time_stretch(self, audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
        """Apply time stretching while maintaining pitch."""
        return _lib_time_stretch(audio, sample_rate, params)

    def _apply_reverb(self, audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
        """Apply reverb via a true parallel wet/dry convolution.

        `wet` (or `mix`) is the wet/dry balance (0 = dry, 1 = full wet). The dry
        path passes through at (1 - wet); the wet path is a convolution with a
        generated impulse response. This matches the frontend AudioStudio
        buildEffectChain so the same preset sounds identical on the assistant /
        REST export path and in the in-app DAW.
        """
        wet = float(params.get("wet", params.get("mix", 0.3)))
        wet = min(max(wet, 0.0), 1.0)
        room_size = float(params.get("room_size", 1.5))
        audio = np.asarray(audio, dtype=np.float32)
        if wet <= 0.0:
            return audio
        if wet >= 1.0:
            dry_gain = 0.0
        else:
            dry_gain = 1.0 - wet

        # Build a simple exponential-decay impulse response (stereo-safe mono).
        ir_length = max(int(sample_rate * min(max(room_size, 0.1), 5.0)), 1)
        t = np.arange(ir_length) / sample_rate
        decay = np.exp(-t * (3.0 / max(room_size, 0.1)))
        ir = decay.astype(np.float32)

        from scipy.signal import fftconvolve

        # Keep the FULL convolution (dry length + IR tail) so the reverb tail
        # is not truncated at the source end — matches the frontend convolver.
        wet_signal = fftconvolve(audio, ir, mode="full").astype(np.float32)
        wet_signal = wet_signal * wet
        dry_signal = audio * dry_gain
        output = np.zeros(max(len(dry_signal), len(wet_signal)), dtype=np.float32)
        output[: len(dry_signal)] += dry_signal
        output[: len(wet_signal)] += wet_signal
        return np.clip(output, -1.0, 1.0)

    def _apply_delay(self, audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
        """Apply delay via a true parallel wet/dry with feedback tail.

        `mix` balances dry vs the delayed (feedback) signal. The dry path passes
        at (1 - mix); the wet path is a delay line with a feedback loop. Matches
        the frontend AudioStudio buildEffectChain.
        """
        delay_ms = params.get("delay_ms", 200)
        feedback = params.get("feedback", 0.3)
        mix = float(params.get("mix", 0.3))
        mix = min(max(mix, 0.0), 1.0)
        audio = np.asarray(audio, dtype=np.float32)
        if mix <= 0.0:
            return audio

        delay_samples = int(sample_rate * delay_ms / 1000)
        if delay_samples < 1:
            return audio

        dry_gain = 1.0 - mix
        out = np.zeros(len(audio), dtype=np.float32)
        out += audio * dry_gain
        # Feedback delay line: each echo is fed back at `feedback`, capped so the
        # tail decays instead of building up.
        fb = min(max(feedback, 0.0), 0.95)
        delayed = np.zeros(len(audio) + delay_samples, dtype=np.float32)
        delayed[delay_samples:] = audio
        wet = delayed[: len(audio)].copy()
        # Apply a single recirculated echo (stable; no unbounded growth).
        wet = wet + fb * delayed[delay_samples : delay_samples + len(audio)]
        wet = np.clip(wet, -1.0, 1.0) * mix
        output = out + wet
        return np.clip(output, -1.0, 1.0)

    def _apply_chorus(self, audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
        """Apply chorus effect."""
        depth = params.get("depth", 0.002)
        rate = params.get("rate", 1.5)
        mix = params.get("mix", 0.5)

        t = np.arange(len(audio)) / sample_rate
        modulator = np.sin(2 * np.pi * rate * t) * depth

        chorus_audio = audio * (1 - mix) + audio * (1 + modulator) * mix
        return np.clip(chorus_audio, -1.0, 1.0)

    def _apply_distortion(self, audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
        """Apply distortion effect."""
        gain = params.get("gain", 2.0)
        mix = params.get("mix", 0.5)

        distorted = np.tanh(audio * gain) * (1 - mix) + audio * mix
        return np.clip(distorted, -1.0, 1.0)

    def _apply_eq(self, audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
        """Apply simple 3-band EQ."""
        import scipy.signal

        low_gain = params.get("low_gain", 0.0)
        mid_gain = params.get("mid_gain", 0.0)
        high_gain = params.get("high_gain", 0.0)

        if low_gain == 0 and mid_gain == 0 and high_gain == 0:
            return audio

        filtered = audio.copy()
        nyquist = sample_rate / 2

        if low_gain != 0:
            freq = 200 / nyquist if nyquist > 200 else 0.5
            b, a = scipy.signal.butter(2, freq, "lowpass")
            low = scipy.signal.filtfilt(b, a, filtered)
            filtered = low * (low_gain / 6) + filtered * (1 - low_gain / 6)

        if high_gain != 0:
            freq = 3000 / nyquist if nyquist > 3000 else 0.5
            b, a = scipy.signal.butter(2, freq, "highpass")
            high = scipy.signal.filtfilt(b, a, filtered)
            filtered = high * (high_gain / 6) + filtered * (1 - high_gain / 6)

        if mid_gain != 0:
            freq = 1000 / nyquist if nyquist > 1000 else 0.5
            b, a = scipy.signal.butter(2, freq, "bandpass")
            mid = scipy.signal.filtfilt(b, a, filtered)
            filtered = mid * (mid_gain / 6) + filtered * (1 - mid_gain / 6)

        return np.clip(filtered, -1.0, 1.0)

    def _apply_compressor(self, audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
        """Apply compression effect with smoothed gain and a standard
        threshold/ratio transfer curve."""
        threshold = params.get("threshold", -20.0)
        ratio = params.get("ratio", 4.0)
        attack = params.get("attack", 0.01)
        release = params.get("release", 0.1)

        threshold_val = 10 ** (threshold / 20)
        attack_samples = max(1, int(attack * sample_rate))
        release_samples = max(1, int(release * sample_rate))

        compressed = np.zeros_like(audio)
        gain = 1.0
        for i in range(len(audio)):
            env = np.abs(audio[i])
            if env > threshold_val:
                desired = threshold_val + (env - threshold_val) / ratio
                target_gain = desired / env
            else:
                target_gain = 1.0
            coeff = 1.0 / attack_samples if target_gain < gain else 1.0 / release_samples
            gain = gain + (target_gain - gain) * coeff
            compressed[i] = audio[i] * gain
        return np.clip(compressed, -1.0, 1.0)

    def _apply_noise_gate(self, audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
        """Apply noise gate effect."""
        threshold = params.get("threshold", -40.0)
        threshold_val = 10 ** (threshold / 20)
        attack = params.get("attack", 0.01)
        release = params.get("release", 0.1)

        gate = np.zeros_like(audio)
        int(attack * sample_rate)
        release_samples = max(1, int(release * sample_rate))

        for i in range(len(audio)):
            if np.abs(audio[i]) > threshold_val:
                gate[i] = 1.0
            else:
                prev = gate[i - 1] if i > 0 else 0.0
                gate[i] = max(0.0, prev - (1 / release_samples))

        gated_audio = audio * gate
        return np.clip(gated_audio, -1.0, 1.0)

    def _apply_sidechain_duck(self, audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
        """Apply sidechain ducking: attenuate while the sidechain signal is loud,
        then release back to unity gain gradually."""
        threshold = params.get("threshold", -30.0)
        duck_gain = params.get("duck_gain", -12.0)
        release = params.get("release", 0.1)

        threshold_val = 10 ** (threshold / 20)
        duck_level = 10 ** (duck_gain / 20)
        release_samples = max(1, int(release * sample_rate))

        detect = np.abs(audio)
        gain = np.ones_like(audio)
        current = 1.0
        for i in range(len(audio)):
            target = duck_level if detect[i] > threshold_val else 1.0
            if target < current:
                current = target
            else:
                current = min(1.0, current + (1.0 - duck_level) / release_samples)
            gain[i] = current

        ducked_audio = audio * gain
        return np.clip(ducked_audio, -1.0, 1.0)

    def _apply_silence_removal(self, audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
        """Remove silence from audio."""
        threshold_db = params.get("threshold_db", -40.0)
        threshold = 10 ** (threshold_db / 20)
        min_length_ms = params.get("min_length_ms", 100)
        min_length_samples = int(sample_rate * min_length_ms / 1000)

        energy = np.abs(audio)
        is_silent = energy < threshold

        non_silent_segments = []
        in_segment = False
        start = 0

        for i in range(len(audio)):
            if not is_silent[i] and not in_segment:
                in_segment = True
                start = i
            elif is_silent[i] and in_segment:
                in_segment = False
                segment = audio[start:i]
                if len(segment) >= min_length_samples:
                    non_silent_segments.append(segment)
            elif not is_silent[i] and i == len(audio) - 1 and in_segment:
                segment = audio[start : i + 1]
                if len(segment) >= min_length_samples:
                    non_silent_segments.append(segment)

        if not non_silent_segments:
            return audio

        combined = np.concatenate(non_silent_segments)
        return combined

    def _apply_normalize(self, audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
        """Normalize audio to a target level."""
        target_db = params.get("target_db", -14.0)
        target_level = 10 ** (target_db / 20)

        current_peak = np.max(np.abs(audio))
        if current_peak == 0:
            return audio

        gain = target_level / current_peak
        normalized = audio * gain
        return np.clip(normalized, -1.0, 1.0)

    def _apply_deesser(self, audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
        """Reduce sibilance via the extended de-esser implementation."""
        from .effects_extended import apply_deesser

        return apply_deesser(audio, sample_rate, params)

    def _apply_spectral_denoise(self, audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
        """Reduce stationary noise via the extended spectral de-noise implementation."""
        from .effects_extended import apply_spectral_denoise

        return apply_spectral_denoise(audio, sample_rate, params)

    def _apply_emotion_tone(self, audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
        """Apply emotion/tone post-processing (warmth, energy, brightness, formant)."""
        from .emotion_tone import apply_emotion_tone

        return apply_emotion_tone(
            audio,
            sample_rate,
            warmth=float(params.get("warmth", 0.0)),
            energy=float(params.get("energy", 0.0)),
            brightness=float(params.get("brightness", 0.0)),
            formant=float(params.get("formant", 0.0)),
        )


def apply_effects_chain(audio: np.ndarray, sample_rate: int, chain: list[EffectConfig]) -> np.ndarray:
    """Apply an effects chain to audio."""
    processor = AudioEffectsChain()
    return processor.apply_chain(audio, sample_rate, chain)
