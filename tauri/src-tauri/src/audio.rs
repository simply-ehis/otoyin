//! Audio commands for the shell: output-device listing and playback (cpal +
//! symphonia decode) plus system-audio capture orchestration. The capture
//! backends are platform-specific:
//! - Windows: WASAPI loopback (`audio_win`)
//! - macOS: ScreenCaptureKit system audio (`audio_mac`)
//! - Linux: no system-audio capture is available (`is_system_audio_supported`
//!   is false); output playback still works everywhere via cpal.

use crate::AppState;
use base64::Engine;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::Serialize;
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use tauri::State;

#[cfg(target_os = "macos")]
use crate::audio_mac;
#[cfg(windows)]
use crate::audio_win;

pub const CAPTURE_SAMPLE_RATE: u32 = 48_000;
pub const CAPTURE_CHANNELS: u16 = 2;

// ── Capture ─────────────────────────────────────────────────────────────────

/// Shared sink a platform capture thread writes interleaved f32 samples into.
pub struct ActiveCapture {
    pub stop: Arc<AtomicBool>,
    pub samples: Arc<Mutex<Vec<f32>>>,
    pub error: Arc<Mutex<Option<String>>>,
    pub join: Option<JoinHandle<()>>,
    pub sample_rate: u32,
    pub channels: u16,
}

#[derive(Default)]
pub struct AudioState {
    pub capture: Mutex<Option<ActiveCapture>>,
    pub playback: PlaybackState,
    pub mic: Mutex<Option<MicCapture>>,
}

/// Tracks the current playback session. cpal::Stream is !Send, so each
/// stream lives on its own keeper thread; the state only holds the stop
/// signal and the thread handles.
#[derive(Default)]
pub struct PlaybackState {
    pub stop: Mutex<Option<Arc<AtomicBool>>>,
    pub active: Mutex<Vec<JoinHandle<()>>>,
}

#[derive(Serialize)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

fn system_capture_supported() -> bool {
    cfg!(windows) || cfg!(target_os = "macos")
}

fn start_capture_thread() -> Result<ActiveCapture, String> {
    if !system_capture_supported() {
        return Err("system audio capture is not supported on this platform".to_string());
    }
    let capture = ActiveCapture {
        stop: Arc::new(AtomicBool::new(false)),
        samples: Arc::new(Mutex::new(Vec::new())),
        error: Arc::new(Mutex::new(None)),
        join: None,
        sample_rate: CAPTURE_SAMPLE_RATE,
        channels: CAPTURE_CHANNELS,
    };
    #[cfg(windows)]
    {
        return Ok(audio_win::launch(capture));
    }
    #[cfg(target_os = "macos")]
    {
        return Ok(audio_mac::launch(capture));
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        Err("system audio capture is not supported on this platform".to_string())
    }
}

/// Encode interleaved f32 samples as a 16-bit PCM WAV, base64-encoded.
fn samples_to_wav_base64(
    samples: &[f32],
    sample_rate: u32,
    channels: u16,
) -> Result<String, String> {
    if samples.is_empty() {
        return Ok(String::new());
    }
    let spec = hound::WavSpec {
        channels,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut bytes = Vec::with_capacity(samples.len() * 2 + 64);
    {
        let mut writer = hound::WavWriter::new(Cursor::new(&mut bytes), spec)
            .map_err(|e| format!("wav header: {e}"))?;
        for &s in samples {
            let clamped = if s.is_nan() {
                0
            } else if s > 1.0 {
                i16::MAX
            } else if s < -1.0 {
                i16::MIN
            } else {
                (s * i16::MAX as f32) as i16
            };
            writer
                .write_sample(clamped)
                .map_err(|e| format!("wav sample: {e}"))?;
        }
        writer
            .finalize()
            .map_err(|e| format!("wav finalize: {e}"))?;
    }
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

// ── Playback helpers ────────────────────────────────────────────────────────

fn default_output_device(host: &cpal::Host) -> Option<cpal::Device> {
    host.default_output_device()
}

fn output_devices(host: &cpal::Host) -> Vec<cpal::Device> {
    match host.devices() {
        Ok(devices) => devices
            .filter(|d| d.default_output_config().is_ok())
            .collect(),
        Err(_) => Vec::new(),
    }
}

/// Find a device by the name we expose as its id.
fn find_device(host: &cpal::Host, name: &str) -> Option<cpal::Device> {
    output_devices(host)
        .into_iter()
        .find(|d| d.name().map(|n| n == name).unwrap_or(false))
}

/// Linear resample of interleaved samples from `src_rate` to `dst_rate`.
fn resample(src: &[f32], src_rate: u32, dst_rate: u32, channels: u16) -> Vec<f32> {
    if src_rate == dst_rate || src_rate == 0 || dst_rate == 0 {
        return src.to_vec();
    }
    let ch = channels as usize;
    let src_frames = src.len() / ch;
    let dst_frames = (src_frames as u64 * dst_rate as u64 / src_rate as u64) as usize;
    let mut out = Vec::with_capacity(dst_frames.saturating_mul(ch));
    for frame in 0..dst_frames {
        let pos = frame as f64 * src_rate as f64 / dst_rate as f64;
        let i0 = pos.floor() as usize;
        let frac = (pos - i0 as f64) as f32;
        let i1 = (i0 + 1).min(src_frames.saturating_sub(1));
        for c in 0..ch {
            let a = src[i0 * ch + c];
            let b = src[i1 * ch + c];
            out.push(a + (b - a) * frac);
        }
    }
    out
}

/// Convert interleaved samples to the target channel count (mono<->stereo up/downmix).
fn to_channels(src: &[f32], src_ch: u16, dst_ch: u16) -> Vec<f32> {
    if src_ch == dst_ch {
        return src.to_vec();
    }
    let (sc, dc) = (src_ch as usize, dst_ch as usize);
    let frames = src.len() / sc;
    let mut out = Vec::with_capacity(frames.saturating_mul(dc));
    for f in 0..frames {
        for c in 0..dc {
            let sample = if src_ch == 1 {
                src[f * sc] // mono upmix
            } else if dst_ch == 1 {
                // Stereo downmix: average.
                let l = src[f * sc];
                let r = src[f * sc + 1];
                (l + r) * 0.5
            } else {
                // More output channels than input: fill extras with L/R fallback.
                if c < sc {
                    src[f * sc + c]
                } else {
                    src[f * sc + c % sc]
                }
            };
            out.push(sample);
        }
    }
    out
}

/// Decode audio bytes (wav/mp3/flac/ogg/aac/…) to interleaved f32 at the
/// source rate, using symphonia. Bounded so a corrupt file can't OOM us.
fn decode_to_f32(data: &[u8]) -> Result<(Vec<f32>, u32, u16), String> {
    use symphonia::core::audio::SampleBuffer;
    use symphonia::core::codecs::DecoderOptions;
    use symphonia::core::formats::FormatOptions;
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::meta::MetadataOptions;
    use symphonia::core::probe::Hint;

    let mss = MediaSourceStream::new(Box::new(Cursor::new(data.to_vec())), Default::default());
    let mut hint = Hint::new();
    hint.mime_type("audio/wav"); // probe prefers riff but falls back to content sniffing
    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| format!("unsupported audio: {e}"))?;
    let mut format = probed.format;
    let track = format
        .default_track()
        .ok_or_else(|| "no playable audio track".to_string())?;
    let track_id = track.id;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| format!("no decoder: {e}"))?;

    let mut out: Vec<f32> = Vec::new();
    let mut rate = 0u32;
    let mut channels = 0u16;
    const MAX_SAMPLES: usize = 48_000 * 2 * 60 * 60; // 1 hour of stereo @48k
    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(_) => break,
        };
        if packet.track_id() != track_id {
            continue;
        }
        match decoder.decode(&packet) {
            Ok(decoded) => {
                let spec = decoded.spec().clone();
                rate = spec.rate;
                channels = spec.channels.count() as u16;
                let mut sb = SampleBuffer::<f32>::new(decoded.capacity() as u64, spec);
                sb.copy_interleaved_ref(decoded);
                out.extend_from_slice(sb.samples());
                if out.len() > MAX_SAMPLES {
                    break;
                }
            }
            Err(symphonia::core::errors::Error::DecodeError(_)) => continue,
            Err(_) => break,
        }
    }
    if out.is_empty() {
        return Err("no decodable audio found".to_string());
    }
    Ok((out, rate, channels))
}

// ── Commands ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn is_system_audio_supported() -> Result<bool, String> {
    Ok(system_capture_supported())
}

#[tauri::command]
pub async fn start_system_audio_capture(
    state: State<'_, AppState>,
    _max_duration_secs: Option<u32>,
) -> Result<(), String> {
    let mut guard = state.audio.capture.lock().unwrap();
    if guard.is_some() {
        return Err("system audio capture already in progress".to_string());
    }
    let capture = start_capture_thread()?;
    *guard = Some(capture);
    Ok(())
}

#[tauri::command]
pub async fn stop_system_audio_capture(state: State<'_, AppState>) -> Result<String, String> {
    let mut guard = state.audio.capture.lock().unwrap();
    let mut capture = guard
        .take()
        .ok_or_else(|| "no capture in progress".to_string())?;
    capture.stop.store(true, Ordering::SeqCst);
    if let Some(join) = capture.join.take() {
        let _ = join.join();
    }
    if let Some(err) = capture.error.lock().unwrap().take() {
        return Err(err);
    }
    let samples = std::mem::take(&mut *capture.samples.lock().unwrap());
    samples_to_wav_base64(&samples, capture.sample_rate, capture.channels)
}

#[tauri::command]
pub async fn list_audio_output_devices() -> Result<Vec<AudioDevice>, String> {
    let host = cpal::default_host();
    let default_name = default_output_device(&host).and_then(|d| d.name().ok());
    let devices = output_devices(&host)
        .into_iter()
        .filter_map(|d| {
            let name = d.name().ok()?;
            Some(AudioDevice {
                id: name.clone(),
                is_default: Some(&name) == default_name.as_ref(),
                name,
            })
        })
        .collect();
    Ok(devices)
}

/// One output device's keeper thread: owns the cpal stream, reports build
/// success/failure on the channel, then holds the stream until the clip is
/// consumed or stop is signalled.
fn spawn_device_thread(
    device: cpal::Device,
    prepared: Vec<f32>,
    dev_channels: u16,
    stop: Arc<AtomicBool>,
) -> (
    JoinHandle<()>,
    std::sync::mpsc::Receiver<Result<(), String>>,
) {
    let (tx, rx) = std::sync::mpsc::channel();
    let total_frames = prepared.len() / dev_channels as usize;
    let handle = std::thread::spawn(move || {
        let cursor = Arc::new(AtomicUsize::new(0));
        let stream_cursor = cursor.clone();
        let stream_samples = prepared;
        let stream_channels = dev_channels as usize;
        let total = total_frames;
        let stream_stop = stop.clone();

        let supported = device.default_output_config();
        let built = supported
            .map_err(|e| format!("device unavailable: {e}"))
            .and_then(|supported| {
                let config: cpal::StreamConfig = supported.config();
                let err_fn = |e| eprintln!("[audio] stream error: {e}");
                let stream = device
                    .build_output_stream::<f32, _, _>(
                        &config,
                        move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                            let ch = stream_channels;
                            if ch == 0 {
                                data.fill(0.0);
                                return;
                            }
                            let frames_in_chunk = data.len() / ch;
                            let written = stream_cursor.load(Ordering::Relaxed);
                            let take = frames_in_chunk.min(total.saturating_sub(written));
                            if take > 0 {
                                let src = &stream_samples[written * ch..(written + take) * ch];
                                data[..take * ch].copy_from_slice(src);
                                stream_cursor.fetch_add(take, Ordering::SeqCst);
                                data[take * ch..].fill(0.0);
                            } else {
                                data.fill(0.0);
                            }
                        },
                        err_fn,
                        None,
                    )
                    .map_err(|e| format!("failed to open output device: {e}"))?;
                stream
                    .play()
                    .map_err(|e| format!("failed to start playback: {e}"))?;
                Ok(stream)
            });

        match built {
            Ok(stream) => {
                let _ = tx.send(Ok(()));
                // Hold the stream (and keep it playing) until done/stopped.
                while !stream_stop.load(Ordering::Relaxed) && cursor.load(Ordering::Relaxed) < total
                {
                    std::thread::sleep(std::time::Duration::from_millis(20));
                }
                drop(stream); // dropping halts this device's playback
            }
            Err(e) => {
                let _ = tx.send(Err(e));
            }
        }
    });
    (handle, rx)
}

#[tauri::command]
pub async fn play_audio_to_devices(
    state: State<'_, AppState>,
    audio_data: Vec<u8>,
    device_ids: Vec<String>,
) -> Result<(), String> {
    // Stop whatever is currently playing first (single playback session).
    stop_playback(&state.audio.playback);

    if audio_data.is_empty() {
        return Err("no audio data to play".to_string());
    }
    let (samples, rate, channels) = tokio::task::spawn_blocking(move || decode_to_f32(&audio_data))
        .await
        .map_err(|e| format!("decode task failed: {e}"))??;
    let samples = Arc::new(samples);

    let host = cpal::default_host();
    let targets: Vec<cpal::Device> = if device_ids.is_empty() {
        default_output_device(&host).into_iter().collect()
    } else {
        device_ids
            .iter()
            .filter_map(|id| find_device(&host, id))
            .collect()
    };
    if targets.is_empty() {
        return Err("no matching audio output device".to_string());
    }

    let stop = Arc::new(AtomicBool::new(false));
    let mut spawned: Vec<JoinHandle<()>> = Vec::new();
    let mut results: Vec<std::sync::mpsc::Receiver<Result<(), String>>> = Vec::new();

    for device in targets {
        let supported = device
            .default_output_config()
            .map_err(|e| format!("device unavailable: {e}"))?;
        let dev_rate = supported.sample_rate().0;
        let dev_channels = supported.channels();
        // Bring audio into the device's native rate/channels upfront so the
        // real-time callback only copies frames.
        let samples_for_dev = Arc::clone(&samples);
        let prepared = tokio::task::spawn_blocking(move || {
            let r = resample(&samples_for_dev, rate, dev_rate, channels);
            to_channels(&r, channels, dev_channels)
        })
        .await
        .map_err(|e| format!("prepare task failed: {e}"))?;

        let (handle, rx) = spawn_device_thread(device, prepared, dev_channels, stop.clone());
        spawned.push(handle);
        results.push(rx);
    }

    // Surface device open failures (any) and tear down the session.
    let mut first_error: Option<String> = None;
    for rx in &results {
        match rx.recv() {
            Ok(Ok(())) => {}
            Ok(Err(e)) => {
                if first_error.is_none() {
                    first_error = Some(e);
                }
            }
            Err(_) => {}
        }
    }
    if let Some(err) = first_error {
        stop.store(true, Ordering::SeqCst);
        for handle in spawned {
            let _ = handle.join();
        }
        return Err(err);
    }

    let mut active = state.audio.playback.active.lock().unwrap();
    active.extend(spawned);
    *state.audio.playback.stop.lock().unwrap() = Some(stop);
    Ok(())
}

#[tauri::command]
pub async fn stop_audio_playback(state: State<'_, AppState>) -> Result<(), String> {
    stop_playback(&state.audio.playback);
    Ok(())
}

/// Signal all playback threads to stop and wait for them to drop their
/// streams (dropping a cpal stream halts that device).
fn stop_playback(playback: &PlaybackState) {
    if let Some(stop) = playback.stop.lock().unwrap().as_ref() {
        stop.store(true, Ordering::SeqCst);
    }
    let handles: Vec<JoinHandle<()>> = playback.active.lock().unwrap().drain(..).collect();
    for handle in handles {
        let _ = handle.join();
    }
    *playback.stop.lock().unwrap() = None;
}

// ── Microphone capture ────────────────────────────────────────────────
// Native mic path: webview getUserMedia is fragile per-OS (and unfixable
// on stock Linux WebKit), so recording goes through cpal input streams
// here instead. Captures at the device rate; stop() resamples to 16 kHz
// mono WAV — the Whisper-native format the backend transcribes directly.

/// Target format for stopped captures: 16 kHz mono 16-bit PCM.
pub const MIC_TARGET_SAMPLE_RATE: u32 = 16_000;

pub struct MicCapture {
    pub stop: Arc<AtomicBool>,
    pub samples: Arc<Mutex<Vec<f32>>>,
    pub error: Arc<Mutex<Option<String>>>,
    pub join: Option<JoinHandle<()>>,
    pub sample_rate: u32,
    pub channels: u16,
}

/// Channel the mic keeper thread reports its open result on:
/// the device `(sample_rate, channels)` or a human-readable error.
type MicOpenReport = std::sync::mpsc::Receiver<Result<(u32, u16), String>>;

/// Keeper thread for one mic input stream. cpal::Stream is !Send, so the
/// stream lives here; the state only holds the stop signal and handle.
fn spawn_mic_thread(
    device: cpal::Device,
    stop: Arc<AtomicBool>,
    sink: Arc<Mutex<Vec<f32>>>,
    failure: Arc<Mutex<Option<String>>>,
) -> (JoinHandle<()>, MicOpenReport) {
    let (tx, rx) = std::sync::mpsc::channel();
    let handle = std::thread::spawn(move || {
        let supported = device.default_input_config();
        let built = supported
            .map_err(|e| format!("microphone unavailable: {e}"))
            .and_then(|supported| {
                let sample_rate = supported.sample_rate().0;
                let channels = supported.channels();
                let err_fn = {
                    let failure = failure.clone();
                    move |e| {
                        *failure.lock().unwrap() = Some(format!("microphone stream error: {e}"));
                    }
                };
                let config: cpal::StreamConfig = supported.config();
                // cpal device configs are F32/I16/U16 — normalize all to f32.
                let stream = match supported.sample_format() {
                    cpal::SampleFormat::F32 => device.build_input_stream(
                        &config,
                        move |data: &[f32], _| {
                            sink.lock().unwrap().extend_from_slice(data);
                        },
                        err_fn,
                        None,
                    ),
                    cpal::SampleFormat::I16 => device.build_input_stream(
                        &config,
                        move |data: &[i16], _| {
                            sink.lock()
                                .unwrap()
                                .extend(data.iter().map(|&v| v as f32 / i16::MAX as f32));
                        },
                        err_fn,
                        None,
                    ),
                    cpal::SampleFormat::U16 => device.build_input_stream(
                        &config,
                        move |data: &[u16], _| {
                            sink.lock().unwrap().extend(
                                data.iter().map(|&v| v as f32 / u16::MAX as f32 * 2.0 - 1.0),
                            );
                        },
                        err_fn,
                        None,
                    ),
                    fmt => {
                        return Err(format!("unsupported microphone sample format: {fmt:?}"));
                    }
                }
                .map_err(|e| format!("failed to open microphone (in use by another app?): {e}"))?;
                stream
                    .play()
                    .map_err(|e| format!("failed to start microphone capture: {e}"))?;
                Ok((stream, sample_rate, channels))
            });
        match built {
            Ok((stream, sample_rate, channels)) => {
                let _ = tx.send(Ok((sample_rate, channels)));
                // Hold the stream until stopped or failed.
                while !stop.load(Ordering::Relaxed)
                    && failure.lock().unwrap().is_none()
                {
                    std::thread::sleep(std::time::Duration::from_millis(20));
                }
                drop(stream); // dropping halts capture
            }
            Err(e) => {
                let _ = tx.send(Err(e));
            }
        }
    });
    (handle, rx)
}

#[tauri::command]
pub async fn list_mic_input_devices() -> Result<Vec<AudioDevice>, String> {
    let host = cpal::default_host();
    let default_name = host.default_input_device().and_then(|d| d.name().ok());
    let devices = host
        .input_devices()
        .map_err(|e| format!("cannot list microphones: {e}"))?
        .filter_map(|d| {
            let name = d.name().ok()?;
            Some(AudioDevice {
                id: name.clone(),
                is_default: Some(&name) == default_name.as_ref(),
                name,
            })
        })
        .collect();
    Ok(devices)
}

#[tauri::command]
pub async fn start_mic_capture(
    state: State<'_, AppState>,
    device_id: Option<String>,
) -> Result<(), String> {
    let mut guard = state.audio.mic.lock().unwrap();
    if guard.is_some() {
        return Err("microphone capture already in progress".to_string());
    }
    let host = cpal::default_host();
    let device = match device_id {
        Some(id) => host
            .input_devices()
            .map_err(|e| format!("cannot list microphones: {e}"))?
            .find(|d| d.name().ok().as_deref() == Some(id.as_str()))
            .ok_or_else(|| format!("microphone not found: {id}"))?,
        None => host
            .default_input_device()
            .ok_or_else(|| "no microphone found — check OS privacy settings and that a mic is plugged in".to_string())?,
    };
    let stop = Arc::new(AtomicBool::new(false));
    let sink = Arc::new(Mutex::new(Vec::new()));
    let failure = Arc::new(Mutex::new(None::<String>));
    let (join, rx) = spawn_mic_thread(device, stop.clone(), sink.clone(), failure.clone());
    // Surface open failures immediately instead of recording silence.
    let (sample_rate, channels) = rx.recv().map_err(|_| "microphone thread died".to_string())??;
    *guard = Some(MicCapture {
        stop,
        samples: sink,
        error: failure,
        join: Some(join),
        sample_rate,
        channels,
    });
    Ok(())
}

#[tauri::command]
pub async fn stop_mic_capture(state: State<'_, AppState>) -> Result<String, String> {
    let mut guard = state.audio.mic.lock().unwrap();
    let mut capture = guard
        .take()
        .ok_or_else(|| "no microphone capture in progress".to_string())?;
    capture.stop.store(true, Ordering::SeqCst);
    if let Some(join) = capture.join.take() {
        let _ = join.join();
    }
    if let Some(err) = capture.error.lock().unwrap().take() {
        return Err(err);
    }
    let samples = std::mem::take(&mut *capture.samples.lock().unwrap());
    if samples.is_empty() {
        return Err("captured only silence — check the microphone level".to_string());
    }
    // Device rate → 16 kHz mono: the format Whisper transcribes directly.
    let mono = to_channels(&samples, capture.channels, 1);
    let resampled = resample(&mono, capture.sample_rate, MIC_TARGET_SAMPLE_RATE, 1);
    samples_to_wav_base64(&resampled, MIC_TARGET_SAMPLE_RATE, 1)
}
