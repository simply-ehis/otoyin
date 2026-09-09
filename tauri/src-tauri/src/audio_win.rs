//! Windows system-audio capture via WASAPI loopback.
//!
//! Loopback means opening the *default render* device's audio client with a
//! capture direction: the `wasapi` crate maps that combination to
//! `AUDCLNT_STREAMFLAGS_LOOPBACK`, and the resulting capture client yields
//! everything the user hears. Samples are converted to interleaved f32 at
//! 48 kHz stereo and appended to the shared sink until `stop` flips.

use crate::audio::ActiveCapture;
use std::collections::VecDeque;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use wasapi::*;

const SAMPLE_RATE: u32 = 48_000;
const CHANNELS: u32 = 2;
const MAX_SAMPLES: usize = 48_000 * 2 * 60; // hard cap: 60 s of stereo @ 48k

/// Move an f32 from the front of a byte deque.
fn pop_f32(bytes: &mut VecDeque<u8>) -> Option<f32> {
    if bytes.len() < 4 {
        return None;
    }
    let mut buf = [0u8; 4];
    for b in buf.iter_mut() {
        *b = bytes.pop_front()?;
    }
    Some(f32::from_le_bytes(buf))
}

fn run(
    stop: Arc<std::sync::atomic::AtomicBool>,
    samples: Arc<Mutex<Vec<f32>>>,
    error: Arc<Mutex<Option<String>>>,
) {
    let fail = |msg: String| {
        if let Ok(mut guard) = error.lock() {
            *guard = Some(msg);
        }
    };

    if !initialize_mta().is_ok() {
        return fail("system audio: COM init failed".to_string());
    }

    let enumerator = match DeviceEnumerator::new() {
        Ok(e) => e,
        Err(e) => return fail(format!("system audio: enumerator: {e}")),
    };
    // Default *render* device + capture direction = loopback.
    let device = match enumerator.get_default_device(&Direction::Render) {
        Ok(d) => d,
        Err(e) => return fail(format!("system audio: no output device: {e}")),
    };
    let mut audio_client = match device.get_iaudioclient() {
        Ok(c) => c,
        Err(e) => return fail(format!("system audio: client: {e}")),
    };

    let fmt = WaveFormat::new(
        32,
        32,
        &SampleType::Float,
        SAMPLE_RATE as usize,
        CHANNELS as usize,
        None,
    );
    let (_def_time, min_time) = match audio_client.get_device_period() {
        Ok(t) => t,
        Err(e) => return fail(format!("system audio: period: {e}")),
    };
    let mode = StreamMode::EventsShared {
        autoconvert: true,
        buffer_duration_hns: min_time,
    };
    if let Err(e) = audio_client.initialize_client(&fmt, &Direction::Capture, &mode) {
        return fail(format!("system audio: initialize (loopback): {e}"));
    }
    let h_event = match audio_client.set_get_eventhandle() {
        Ok(h) => h,
        Err(e) => return fail(format!("system audio: event handle: {e}")),
    };
    let capture_client = match audio_client.get_audiocaptureclient() {
        Ok(c) => c,
        Err(e) => return fail(format!("system audio: capture client: {e}")),
    };
    if let Err(e) = audio_client.start_stream() {
        return fail(format!("system audio: start: {e}"));
    }

    let mut bytes: VecDeque<u8> = VecDeque::with_capacity(48_000 * 4 * 2);
    while !stop.load(Ordering::Relaxed) {
        // 250 ms wait keeps stop latency low; timeouts just mean no new data.
        if h_event.wait_for_event(250).is_err() {
            continue;
        }
        if let Err(e) = capture_client.read_from_device_to_deque(&mut bytes) {
            let _ = audio_client.stop_stream();
            return fail(format!("system audio: read: {e}"));
        }
        let mut out = Vec::with_capacity(bytes.len() / 2);
        while let Some(s) = pop_f32(&mut bytes) {
            out.push(s);
        }
        if out.is_empty() {
            continue;
        }
        let mut sink = samples.lock().unwrap_or_else(|e| e.into_inner());
        sink.extend_from_slice(&out);
        if sink.len() > MAX_SAMPLES {
            // Trim to the cap rather than erroring mid-capture.
            let excess = sink.len() - MAX_SAMPLES;
            sink.drain(..excess);
            drop(sink);
            let _ = audio_client.stop_stream();
            break;
        }
    }
    let _ = audio_client.stop_stream();
}

/// Spawn the loopback capture thread and attach it to the capture handle.
pub fn launch(mut capture: ActiveCapture) -> ActiveCapture {
    let stop = capture.stop.clone();
    let samples = capture.samples.clone();
    let error = capture.error.clone();
    capture.join = Some(std::thread::spawn(move || {
        run(stop, samples, error);
    }));
    capture
}
