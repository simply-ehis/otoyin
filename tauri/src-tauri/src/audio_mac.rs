//! macOS system-audio capture via ScreenCaptureKit (macOS 13+).
//!
//! We create an audio-only SCStream against the first display and convert
//! each `CMSampleBuffer` audio buffer list into interleaved f32 at the
//! configured 48 kHz stereo rate. ScreenCaptureKit needs the Screen
//! Recording permission even for audio-only capture; when it is missing the
//! stream reports an error, which surfaces from `stop_system_audio_capture`
//! so the UI can show the permission prompt path.
//!
//! Written against the `screencapturekit` 1.5 API. This module is macOS-only
//! (`#[cfg(target_os = "macos")]` in lib.rs) and therefore cannot be compile
//! checked on non-macOS hosts — keep changes conservative.

use crate::audio::ActiveCapture;
use screencapturekit::prelude::*;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use std::time::Duration;

const SAMPLE_RATE: u32 = 48_000;
const CHANNELS: u32 = 2;
const MAX_SAMPLES: usize = 48_000 * 2 * 60;

/// Receives SCStream audio buffers and appends interleaved f32 samples.
struct AudioHandler {
    samples: Arc<Mutex<Vec<f32>>>,
}

/// Bytes -> native-endian f32 frames from one (possibly non-interleaved)
/// buffer. Returns (channels, frames).
fn buffer_to_f32(data: &[u8], channels: u32) -> (u32, Vec<f32>) {
    let frame_bytes = 4 * channels as usize;
    let frames = data.len() / frame_bytes;
    let mut out = Vec::with_capacity(frames * channels as usize);
    for f in 0..frames {
        for c in 0..channels as usize {
            let off = (f * channels as usize + c) * 4;
            let b = [data[off], data[off + 1], data[off + 2], data[off + 3]];
            out.push(f32::from_le_bytes(b));
        }
    }
    (channels, out)
}

impl SCStreamOutputTrait for AudioHandler {
    fn did_output_sample_buffer(&self, sample: CMSampleBuffer, of_type: SCStreamOutputType) {
        if of_type != SCStreamOutputType::Audio {
            return;
        }
        let Some(list) = sample.audio_buffer_list() else {
            return;
        };
        let mut sink = self.samples.lock().unwrap_or_else(|e| e.into_inner());
        if sink.len() >= MAX_SAMPLES {
            return;
        }

        let n = list.num_buffers();
        if n == 0 {
            return;
        }

        // ScreenCaptureKit delivers non-interleaved buffers (one per
        // channel). Handle the common stereo pair plus the interleaved
        // single-buffer case, with a mono upmix as the fallback.
        let mut per_channel: Vec<Vec<f32>> = Vec::with_capacity(n);
        let mut total_channels = 0u32;
        for i in 0..n {
            if let Some(buf) = list.get(i) {
                if buf.number_channels == 0 {
                    continue;
                }
                let (ch, frames) = buffer_to_f32(buf.data(), buf.number_channels);
                per_channel.push(frames);
                total_channels += ch;
            }
        }

        match per_channel.len() {
            0 => {}
            1 => {
                if total_channels >= 2 {
                    // Interleaved stereo (or more) in a single buffer.
                    sink.extend_from_slice(&per_channel[0]);
                } else {
                    // Mono upmix to stereo.
                    for &s in &per_channel[0] {
                        sink.push(s);
                        sink.push(s);
                    }
                }
            }
            2 => {
                // Two mono buffers: interleave L/R up to the shorter one.
                let frames = per_channel[0].len().min(per_channel[1].len());
                for f in 0..frames {
                    sink.push(per_channel[0][f]);
                    sink.push(per_channel[1][f]);
                }
            }
            _ => {
                // Rare multichannel layout: pass interleaved as-is (channel
                // count > 2 is out of scope for voice samples).
                for ch in &per_channel {
                    sink.extend_from_slice(ch);
                }
            }
        }
    }
}

fn run(
    stop: Arc<std::sync::atomic::AtomicBool>,
    samples: Arc<Mutex<Vec<f32>>>,
    error: Arc<Mutex<Option<String>>>,
) {
    let result = (|| -> Result<(), String> {
        let content = SCShareableContent::get().map_err(|e| format!("screen capture: {e}"))?;
        let display = content
            .displays()
            .into_iter()
            .next()
            .ok_or_else(|| "screen capture: no display available".to_string())?;
        let filter = SCContentFilter::create()
            .with_display(&display)
            .with_excluding_windows(&[])
            .build();
        let config = SCStreamConfiguration::new()
            .with_captures_audio(true)
            .with_sample_rate(SAMPLE_RATE as i32)
            .with_channel_count(CHANNELS as i32);

        let handler = AudioHandler { samples };
        let mut stream = SCStream::new(&filter, &config);
        stream.add_output_handler(handler, SCStreamOutputType::Audio);
        stream
            .start_capture()
            .map_err(|e| format!("screen capture: start: {e}"))?;

        while !stop.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_millis(100));
        }
        let _ = stream.stop_capture();
        Ok(())
    })();
    if let Err(e) = result {
        if let Ok(mut guard) = error.lock() {
            *guard = Some(e);
        }
    }
}

/// Spawn the ScreenCaptureKit capture thread and attach it to the handle.
pub fn launch(mut capture: ActiveCapture) -> ActiveCapture {
    let stop = capture.stop.clone();
    let samples = capture.samples.clone();
    let error = capture.error.clone();
    capture.join = Some(std::thread::spawn(move || {
        run(stop, samples, error);
    }));
    capture
}
