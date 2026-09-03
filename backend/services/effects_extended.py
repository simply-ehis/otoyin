import numpy as np


def _lazy_effects():
    from .effects import apply_compressor, apply_formant_shift, apply_pitch_shift, apply_reverb

    return apply_pitch_shift, apply_formant_shift, apply_compressor, apply_reverb


def apply_gender_swap(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    """Apply gender swap effect using pitch and formant shifting."""
    amount = params.get("amount", 0.5)
    if amount == 0.0:
        return audio
    apply_pitch_shift, apply_formant_shift, _, _ = _lazy_effects()
    semitones = -6.0 * amount
    shift_factor = 0.8 + 0.4 * amount
    result = apply_pitch_shift(audio, sample_rate, {"semitones": semitones})
    result = apply_formant_shift(result, sample_rate, {"shift_factor": shift_factor})
    return result


def apply_age_shift(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    """Apply age shift effect — younger = higher pitch + brighter, older = lower pitch + darker."""
    apply_pitch_shift, apply_formant_shift, _, _ = _lazy_effects()
    amount = params.get("amount", 0.0)
    if amount == 0.0:
        return audio
    semitones = -3.0 * amount
    shift_factor = 1.0 + 0.3 * amount
    lowpass_cutoff = 8000.0 - 2000.0 * amount
    result = apply_pitch_shift(audio, sample_rate, {"semitones": semitones})
    result = apply_formant_shift(result, sample_rate, {"shift_factor": shift_factor})
    n = len(result)
    fft = np.fft.rfft(result)
    freqs = np.fft.rfftfreq(n, 1.0 / sample_rate)
    mask = np.ones_like(freqs)
    mask[freqs > lowpass_cutoff] = 0.0
    fft *= mask
    result = np.fft.irfft(fft, n=n).astype(np.float32)
    return result


def apply_helium(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    """Apply helium voice effect — pitch up while keeping formants shifted."""
    apply_pitch_shift, apply_formant_shift, _, _ = _lazy_effects()
    intensity = params.get("intensity", 0.7)
    semitones = 6.0 * intensity
    shift_factor = 0.7 + 0.3 * (1.0 - intensity)
    result = apply_pitch_shift(audio, sample_rate, {"semitones": semitones})
    result = apply_formant_shift(result, sample_rate, {"shift_factor": shift_factor})
    return result


def apply_vocoder(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    """Apply robotic vocoder effect using amplitude modulation."""
    rate_hz = params.get("rate_hz", 100.0)
    depth = params.get("depth", 0.8)
    mix = params.get("mix", 0.7)
    n = len(audio)
    t = np.arange(n) / sample_rate
    carrier = np.sin(2 * np.pi * rate_hz * t)
    modulated = audio * (1.0 - depth + depth * np.abs(carrier))
    modulated = np.tanh(modulated * 2.0)
    return audio * (1 - mix) + modulated * mix


def apply_telephone(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    """Apply telephone/radio bandpass effect."""
    _, _, apply_compressor, _ = _lazy_effects()
    low_cutoff = params.get("low_cutoff", 300.0)
    high_cutoff = params.get("high_cutoff", 3500.0)
    compression = params.get("compression", 6.0)
    n = len(audio)
    fft = np.fft.rfft(audio)
    freqs = np.fft.rfftfreq(n, 1.0 / sample_rate)
    mask = np.zeros_like(freqs)
    mask[(freqs >= low_cutoff) & (freqs <= high_cutoff)] = 1.0
    fft *= mask
    result = np.fft.irfft(fft, n=n).astype(np.float32)
    result = apply_compressor(
        result, sample_rate, {"threshold": -15.0, "ratio": compression, "attack": 0.005, "release": 0.05}
    )
    gain_db = params.get("gain_db", 6.0)
    result = result * (10.0 ** (gain_db / 20.0))
    return np.clip(result, -1.0, 1.0)


def apply_megaphone(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    """Apply megaphone effect — bandpass + distortion + compression."""
    _, _, apply_compressor, _ = _lazy_effects()
    distortion_gain = params.get("distortion_gain", 4.0)
    low_cutoff = params.get("low_cutoff", 400.0)
    high_cutoff = params.get("high_cutoff", 2500.0)
    n = len(audio)
    fft = np.fft.rfft(audio)
    freqs = np.fft.rfftfreq(n, 1.0 / sample_rate)
    mask = np.zeros_like(freqs)
    mask[(freqs >= low_cutoff) & (freqs <= high_cutoff)] = 1.0
    fft *= mask
    result = np.fft.irfft(fft, n=n).astype(np.float32)
    result = np.tanh(result * distortion_gain)
    result = apply_compressor(result, sample_rate, {"threshold": -10.0, "ratio": 8.0, "attack": 0.002, "release": 0.02})
    return np.clip(result, -1.0, 1.0)


def apply_underwater(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    """Apply underwater effect — lowpass + reverb + tremolo."""
    _, _, _, apply_reverb = _lazy_effects()
    cutoff = params.get("cutoff", 800.0)
    reverb_amount = params.get("reverb_amount", 0.6)
    tremolo_rate = params.get("tremolo_rate", 3.0)
    tremolo_depth = params.get("tremolo_depth", 0.4)
    n = len(audio)
    fft = np.fft.rfft(audio)
    freqs = np.fft.rfftfreq(n, 1.0 / sample_rate)
    mask = np.ones_like(freqs)
    mask[freqs > cutoff] = 0.0
    fft *= mask
    result = np.fft.irfft(fft, n=n).astype(np.float32)
    t = np.arange(n) / sample_rate
    tremolo = 1.0 - tremolo_depth + tremolo_depth * np.sin(2 * np.pi * tremolo_rate * t)
    result = result * tremolo
    result = apply_reverb(result, sample_rate, {"room_size": reverb_amount, "damping": 0.7, "wet": reverb_amount})
    return np.clip(result, -1.0, 1.0)


def apply_whisper_transform(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    """Apply whisper transform — remove fundamental, enhance breathiness."""
    apply_pitch_shift, _, _, _ = _lazy_effects()
    breathiness = params.get("breathiness", 0.7)
    pitch_factor = params.get("pitch_factor", 1.2)
    n = len(audio)
    fft = np.fft.rfft(audio)
    freqs = np.fft.rfftfreq(n, 1.0 / sample_rate)
    mask = np.ones_like(freqs)
    fundamental_mask = freqs < 200.0
    mask[fundamental_mask] = 0.1
    high_freq_boost = np.ones_like(freqs)
    high_freq_boost[freqs > 3000.0] = 1.0 + breathiness
    fft *= mask * high_freq_boost
    result = np.fft.irfft(fft, n=n).astype(np.float32)
    result = apply_pitch_shift(result, sample_rate, {"semitones": 2.0 * (pitch_factor - 1.0)})
    return np.clip(result, -1.0, 1.0)


def apply_auto_tune(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    """Apply auto-tune / pitch correction effect."""
    speed = params.get("speed", 0.5)
    strength = params.get("strength", 0.8)
    if strength == 0.0:
        return audio
    frame_size = int(0.03 * sample_rate)
    hop_size = frame_size // 2
    result = audio.copy()
    for start in range(0, len(audio) - frame_size, hop_size):
        frame = audio[start : start + frame_size]
        window = np.hanning(frame_size)
        windowed = frame * window
        fft = np.fft.rfft(windowed)
        mag = np.abs(fft)
        np.angle(fft)
        freqs = np.fft.rfftfreq(frame_size, 1.0 / sample_rate)
        peak_idx = np.argmax(mag[1:]) + 1
        if mag[peak_idx] > 0.01:
            detected_freq = freqs[peak_idx]
            semitone = 12.0 * np.log2(max(detected_freq, 1.0) / 440.0)
            nearest_semitone = round(semitone)
            correction_semitones = (nearest_semitone - semitone) * strength
            if abs(correction_semitones) > 0.01:
                factor = 2.0 ** (correction_semitones / 12.0)
                new_len = int(frame_size / factor)
                if 0 < new_len < frame_size:
                    indices = np.linspace(0, frame_size - 1, new_len)
                    corrected = np.interp(indices, np.arange(frame_size), frame)
                    blended = np.zeros(frame_size, dtype=np.float32)
                    blended[:new_len] = corrected * (1 - speed)
                    blended[:new_len] += frame[:new_len] * speed
                    result[start : start + frame_size] = blended
    return result


def apply_spectral_duck(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    """Apply spectral sidechain ducking — carve only voice frequencies from background."""
    duck_amount_db = params.get("duck_amount_db", -12.0)
    freq_low = params.get("freq_low", 200.0)
    freq_high = params.get("freq_high", 4000.0)
    params.get("threshold", -30.0)
    n = len(audio)
    fft = np.fft.rfft(audio)
    freqs = np.fft.rfftfreq(n, 1.0 / sample_rate)
    np.ones_like(freqs)
    voice_band = (freqs >= freq_low) & (freqs <= freq_high)
    duck_gain = 10.0 ** (duck_amount_db / 20.0)
    fft[voice_band] *= duck_gain
    result = np.fft.irfft(fft, n=n).astype(np.float32)
    return result


def apply_multi_band_pitch(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    """Apply pitch shifting to individual frequency bands independently."""
    apply_pitch_shift, _, _, _ = _lazy_effects()
    low_shift = params.get("low_semitones", 0.0)
    mid_shift = params.get("mid_semitones", 0.0)
    high_shift = params.get("high_semitones", 0.0)
    low_cutoff = params.get("low_cutoff", 300.0)
    high_cutoff = params.get("high_cutoff", 3000.0)
    n = len(audio)
    fft = np.fft.rfft(audio)
    freqs = np.fft.rfftfreq(n, 1.0 / sample_rate)
    low_mask = freqs < low_cutoff
    mid_mask = (freqs >= low_cutoff) & (freqs < high_cutoff)
    high_mask = freqs >= high_cutoff
    result = np.zeros_like(fft)
    if np.any(low_mask):
        low_audio = np.fft.irfft(fft * low_mask, n=n).astype(np.float32)
        low_shifted = apply_pitch_shift(low_audio, sample_rate, {"semitones": low_shift})
        result += np.fft.rfft(low_shifted)[: len(result)]
    if np.any(mid_mask):
        mid_audio = np.fft.irfft(fft * mid_mask, n=n).astype(np.float32)
        mid_shifted = apply_pitch_shift(mid_audio, sample_rate, {"semitones": mid_shift})
        result += np.fft.rfft(mid_shifted)[: len(result)]
    if np.any(high_mask):
        high_audio = np.fft.irfft(fft * high_mask, n=n).astype(np.float32)
        high_shifted = apply_pitch_shift(high_audio, sample_rate, {"semitones": high_shift})
        result += np.fft.rfft(high_shifted)[: len(result)]
    result_audio = np.fft.irfft(result, n=n).astype(np.float32)
    return np.clip(result_audio, -1.0, 1.0)


def _biquad_lowpass(w0: float, resonance: float):
    alpha = np.sin(w0) / (2.0 * max(resonance, 0.01))
    b0 = (1.0 - np.cos(w0)) / 2.0
    b1 = 1.0 - np.cos(w0)
    b2 = b0
    a0 = 1.0 + alpha
    a1 = -2.0 * np.cos(w0)
    a2 = 1.0 - alpha
    return b0, b1, b2, a0, a1, a2


def _biquad_highpass(w0: float, resonance: float):
    alpha = np.sin(w0) / (2.0 * max(resonance, 0.01))
    b0 = (1.0 + np.cos(w0)) / 2.0
    b1 = -(1.0 + np.cos(w0))
    b2 = b0
    a0 = 1.0 + alpha
    a1 = -2.0 * np.cos(w0)
    a2 = 1.0 - alpha
    return b0, b1, b2, a0, a1, a2


def _biquad_bandpass(w0: float, resonance: float):
    bw = w0 * 0.1
    alpha = np.sin(w0) * np.sinh(np.log(2.0) * bw * w0 / np.sin(w0))
    b0 = alpha
    b1 = 0.0
    b2 = -alpha
    a0 = 1.0 + alpha
    a1 = -2.0 * np.cos(w0)
    a2 = 1.0 - alpha
    return b0, b1, b2, a0, a1, a2


def _apply_biquad_chunk(chunk: np.ndarray, coeffs: tuple) -> np.ndarray:
    b0, b1, b2, a0, a1, a2 = coeffs
    filtered = np.zeros_like(chunk)
    x1 = x2 = y1 = y2 = 0.0
    for j in range(len(chunk)):
        x = chunk[j]
        y = (b0 / a0) * x + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2
        filtered[j] = y
        x2, x1 = x1, x
        y2, y1 = y1, y
    return filtered


BIQUAD_FUNCS = {
    "lowpass": _biquad_lowpass,
    "highpass": _biquad_highpass,
    "bandpass": _biquad_bandpass,
}


def apply_resonant_filter_sweep(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    """Apply resonant filter with LFO sweep over time."""
    filter_type = params.get("filter_type", "lowpass")
    cutoff_start = params.get("cutoff_start", 200.0)
    cutoff_end = params.get("cutoff_end", 8000.0)
    resonance = params.get("resonance", 0.5)
    lfo_rate = params.get("lfo_rate", 0.5)
    n = len(audio)
    t = np.arange(n) / sample_rate
    cutoff_mod = cutoff_start + (cutoff_end - cutoff_start) * (0.5 + 0.5 * np.sin(2 * np.pi * lfo_rate * t))
    result = np.zeros_like(audio)
    chunk_size = int(0.01 * sample_rate)
    biquad_fn = BIQUAD_FUNCS.get(filter_type, _biquad_lowpass)
    for i in range(0, n, chunk_size):
        chunk_end = min(i + chunk_size, n)
        chunk = audio[i:chunk_end]
        nyquist = sample_rate / 2
        normalized_cutoff = np.clip(cutoff_mod[i] / nyquist, 0.01, 0.99)
        coeffs = biquad_fn(normalized_cutoff, resonance)
        result[i:chunk_end] = _apply_biquad_chunk(chunk, coeffs)
    return np.clip(result, -1.0, 1.0)


def apply_spectral_repair(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    """Apply AI-like spectral repair — reduce clicks, plosives, sibilance, hum."""
    repair_type = params.get("repair_type", "clicks")
    strength = params.get("strength", 0.7)
    n = len(audio)
    fft = np.fft.rfft(audio)
    freqs = np.fft.rfftfreq(n, 1.0 / sample_rate)
    np.abs(fft)
    if repair_type == "clicks":
        diff = np.abs(np.diff(audio, prepend=0))
        click_mask = diff > np.percentile(diff, 95)
        click_indices = np.where(click_mask)[0]
        for idx in click_indices:
            start = max(0, idx - 5)
            end = min(len(audio), idx + 5)
            if start < end:
                audio[start:end] = np.interp(
                    np.arange(start, end), np.array([start, end - 1]), np.array([audio[start], audio[end - 1]])
                )
        return audio
    if repair_type == "sibilance":
        sibilant_mask = (freqs >= 4000) & (freqs <= 10000)
        reduction = 1.0 - strength * 0.5
        fft[sibilant_mask] *= reduction
    elif repair_type == "plosives":
        plosive_mask = freqs < 200
        reduction = 1.0 - strength * 0.4
        fft[plosive_mask] *= reduction
    elif repair_type == "hum":
        for harmonic in range(1, 10):
            harmonic_freq = 60.0 * harmonic
            mask = np.abs(freqs - harmonic_freq) < 2.0
            fft[mask] *= 1.0 - strength
    elif repair_type == "breathing":
        low_breath = (freqs >= 100) & (freqs <= 800)
        fft[low_breath] *= 1.0 - strength * 0.3
    result = np.fft.irfft(fft, n=n).astype(np.float32)
    return np.clip(result, -1.0, 1.0)


def apply_multi_mic_phase(audio_a: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    """Apply multi-mic phase alignment to reduce bleed/hollow echo."""
    audio_b = params.get("audio_b")
    strength = params.get("strength", 0.5)
    if audio_b is None or len(audio_b) != len(audio_a):
        return audio_a
    if isinstance(audio_b, list):
        audio_b = np.array(audio_b, dtype=np.float32)
    max_shift = int(0.01 * sample_rate)
    best_shift = 0
    best_corr = -1.0
    for shift in range(-max_shift, max_shift + 1, max_shift // 10):
        if shift == 0:
            corr = np.sum(audio_a * audio_b)
        elif shift > 0:
            corr = np.sum(audio_a[shift:] * audio_b[:-shift])
        else:
            corr = np.sum(audio_a[:shift] * audio_b[-shift:])
        if corr > best_corr:
            best_corr = corr
            best_shift = shift
    if best_shift > 0:
        aligned_b = np.zeros_like(audio_b)
        aligned_b[:-best_shift] = audio_b[best_shift:]
    elif best_shift < 0:
        aligned_b = np.zeros_like(audio_b)
        aligned_b[-best_shift:] = audio_b[:best_shift]
    else:
        aligned_b = audio_b.copy()
    correlation = np.sum(audio_a * aligned_b) / (np.sqrt(np.sum(audio_a**2) * np.sum(aligned_b**2)) + 1e-10)
    gate_threshold = strength * correlation
    gate = np.where(np.abs(audio_a) > gate_threshold, 1.0, 0.0)
    gate = np.convolve(gate, np.ones(10) / 10, mode="same")
    aligned_b = aligned_b * (1.0 - gate * strength)
    return audio_a + aligned_b


def apply_smart_crossfade(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    """Apply non-linear smart crossfade with curve options."""
    other_audio = params.get("other_audio")
    fade_length_ms = params.get("fade_length_ms", 50.0)
    curve = params.get("curve", "equal_power")
    if other_audio is None:
        return audio
    if isinstance(other_audio, list):
        other_audio = np.array(other_audio, dtype=np.float32)
    fade_samples = int(fade_length_ms * sample_rate / 1000)
    fade_samples = min(fade_samples, len(audio) // 2)
    if fade_samples == 0:
        return audio
    t = np.linspace(0, 1, fade_samples)
    if curve == "equal_power":
        fade_out = np.cos(t * np.pi / 2)
        fade_in = np.sin(t * np.pi / 2)
    elif curve == "logarithmic":
        fade_out = 1.0 - np.log1p(t) / np.log1p(1.0)
        fade_in = np.log1p(t) / np.log1p(1.0)
    elif curve == "exponential":
        fade_out = np.exp(-3.0 * t)
        fade_in = 1.0 - np.exp(-3.0 * t)
    else:
        fade_out = 1.0 - t
        fade_in = t
    result = audio.copy()
    other_trimmed = (
        other_audio[: len(audio)]
        if len(other_audio) >= len(audio)
        else np.pad(other_audio, (0, len(audio) - len(other_audio)))
    )
    result[:fade_samples] = result[:fade_samples] * fade_out + other_trimmed[:fade_samples] * fade_in
    return result


def apply_deesser(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    """Reduce sibilance by attenuating a detected 4-8 kHz sibilant band.

    Estimates the overall spectral level as a reference, then gain-reduces the
    sibilant band only when its energy exceeds a relative threshold. Fully
    offline; operates on a single FFT frame (suitable for short voice clips).
    """
    if len(audio) == 0:
        return audio
    threshold_db = params.get("threshold_db", -18.0)
    reduction_db = params.get("reduction_db", -6.0)
    freq_low = params.get("freq_low", 4000.0)
    freq_high = params.get("freq_high", 8000.0)
    strength = min(max(params.get("strength", 0.6), 0.0), 1.0)
    if reduction_db >= 0 or strength == 0.0:
        return audio

    n = len(audio)
    spectrum = np.fft.rfft(audio)
    freqs = np.fft.rfftfreq(n, 1.0 / sample_rate)
    band = (freqs >= freq_low) & (freqs <= freq_high)

    ref = np.sqrt(np.mean(np.abs(spectrum) ** 2) + 1e-12)
    threshold = ref * (10.0 ** (threshold_db / 20.0))
    band_rms = np.sqrt(np.mean(np.abs(spectrum[band]) ** 2) + 1e-12)

    if band_rms > threshold:
        gain = 10.0 ** ((reduction_db * strength) / 20.0)
        spectrum[band] *= gain

    result = np.fft.irfft(spectrum, n=n).astype(np.float32)
    return np.clip(result, -1.0, 1.0)


def apply_spectral_denoise(audio: np.ndarray, sample_rate: int, params: dict) -> np.ndarray:
    """Reduce stationary background noise via spectral subtraction.

    Estimates a noise profile from the first 100 ms (assumed silence/room tone),
    then subtracts a scaled copy of that profile from each FFT bin, flooring the
    result to avoid complete signal loss. Fully offline.
    """
    if len(audio) < 2:
        return audio
    amount = min(max(params.get("amount", 0.7), 0.0), 1.0)
    if amount == 0.0:
        return audio

    n = len(audio)
    noise_samples = int(min(0.1 * sample_rate, n))
    noise = audio[:noise_samples] if noise_samples > 1 else audio
    noise_spec = np.fft.rfft(noise)
    spectrum = np.fft.rfft(audio)
    mag = np.abs(spectrum)
    phase = np.angle(spectrum)
    noise_mag = np.abs(noise_spec)

    if len(noise_mag) != len(mag):
        noise_mag = np.interp(
            np.fft.rfftfreq(len(audio)),
            np.fft.rfftfreq(len(noise)),
            noise_mag,
        )

    subtracted = mag - amount * noise_mag
    subtracted = np.maximum(subtracted, 0.0)
    out_mag = np.where(mag > noise_mag, subtracted, mag * (1.0 - amount * 0.5))
    out = out_mag * np.exp(1j * phase)

    result = np.fft.irfft(out, n=n).astype(np.float32)
    return np.clip(result, -1.0, 1.0)
