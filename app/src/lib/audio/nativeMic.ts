import { invoke } from "@tauri-apps/api/core";

export interface NativeMicDevice {
	id: string;
	name: string;
	is_default: boolean;
}

/**
 * Native microphone capture via the Rust sidecar (cpal input streams).
 *
 * Why this exists: webview getUserMedia is fragile per-OS and unfixable
 * on stock Linux WebKitGTK. The sidecar records at the device rate and
 * returns 16 kHz mono WAV (Whisper-native) on stop. Every function throws
 * a human-readable message on failure (no mic, device busy, OS permission
 * denied) so callers can fall back to the webview path or explain.
 */
export async function listNativeMics(): Promise<NativeMicDevice[]> {
	return invoke<NativeMicDevice[]>("list_mic_input_devices");
}

export async function isNativeMicAvailable(): Promise<boolean> {
	try {
		await invoke<NativeMicDevice[]>("list_mic_input_devices");
		return true;
	} catch {
		return false;
	}
}

export async function startNativeMicCapture(deviceId?: string | null): Promise<void> {
	await invoke("start_mic_capture", { deviceId: deviceId ?? null });
}

/** Stop capture and return the recording as a WAV blob (16 kHz mono). */
export async function stopNativeMicCapture(): Promise<Blob> {
	const base64 = await invoke<string>("stop_mic_capture");
	const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
	return new Blob([bytes.buffer as ArrayBuffer], { type: "audio/wav" });
}
