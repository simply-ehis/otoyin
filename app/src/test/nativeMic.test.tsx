/**
 * Native mic tests — sidecar-first capture with webview fallback.
 * invoke() is mocked: no Rust needed to prove the routing logic.
 */

import { invoke } from "@tauri-apps/api/core";
import { renderHook } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	isNativeMicAvailable,
	listNativeMics,
	stopNativeMicCapture,
} from "@/lib/audio/nativeMic";
import { useAudioRecording } from "@/lib/hooks/useAudioRecording";
import { PlatformProvider } from "@/platform/PlatformContext";
import type { Platform } from "@/platform/types";

vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

const tauriPlatform = {
	metadata: { isTauri: true },
} as unknown as Platform;

function renderWithPlatform() {
	return renderHook(() => useAudioRecording(), {
		wrapper: ({ children }: { children: React.ReactNode }) => (
			<PlatformProvider platform={tauriPlatform}>{children}</PlatformProvider>
		),
	});
}

beforeEach(() => {
	vi.mocked(invoke).mockReset();
});

describe("nativeMic module", () => {
	it("lists devices through the sidecar", async () => {
		mockedInvoke.mockResolvedValue([
			{ id: "mic", name: "Microphone", is_default: true },
		]);
		await expect(listNativeMics()).resolves.toEqual([
			{ id: "mic", name: "Microphone", is_default: true },
		]);
		expect(mockedInvoke).toHaveBeenCalledWith("list_mic_input_devices");
	});

	it("reports availability from the list call", async () => {
		mockedInvoke.mockResolvedValueOnce([]);
		await expect(isNativeMicAvailable()).resolves.toBe(true);
		mockedInvoke.mockRejectedValueOnce(new Error("nope"));
		await expect(isNativeMicAvailable()).resolves.toBe(false);
	});

	it("returns stopped capture as a WAV blob", async () => {
		const bytes = new Uint8Array([82, 73, 70, 70]);
		let binary = "";
		for (const b of bytes) {
			binary += String.fromCharCode(b);
		}
		mockedInvoke.mockResolvedValue(btoa(binary));
		const blob = await stopNativeMicCapture();
		expect(blob.type).toBe("audio/wav");
		expect(blob.size).toBe(4);
	});
});

describe("useAudioRecording native-first", () => {
	it("uses the sidecar when available, never touching getUserMedia", async () => {
		mockedInvoke.mockImplementation((cmd) => {
			if (cmd === "list_mic_input_devices") {
				return Promise.resolve([{ id: "m", name: "Mic", is_default: true }]);
			}
			if (cmd === "start_mic_capture") {
				return Promise.resolve();
			}
			return Promise.reject(new Error(`unexpected invoke: ${String(cmd)}`));
		});
		const getUserMedia = vi.fn();
		Object.defineProperty(window.navigator, "mediaDevices", {
			value: { getUserMedia },
			configurable: true,
		});
		const { result } = renderWithPlatform();
		await act(async () => {
			await result.current.startRecording();
		});
		expect(result.current.isRecording).toBe(true);
		expect(mockedInvoke).toHaveBeenCalledWith("start_mic_capture", {
			deviceId: null,
		});
		expect(getUserMedia).not.toHaveBeenCalled();
	});

	it("falls back to webview when the sidecar has no mic", async () => {
		mockedInvoke.mockRejectedValue(new Error("no microphone found"));
		const stream = { getTracks: () => [] } as unknown as MediaStream;
		const getUserMedia = vi.fn().mockResolvedValue(stream);
		Object.defineProperty(window.navigator, "mediaDevices", {
			value: { getUserMedia },
			configurable: true,
		});
		// MediaRecorder absent in jsdom — startRecording then fails cleanly
		// *after* attempting getUserMedia, proving the fallback ran.
		const { result } = renderWithPlatform();
		await act(async () => {
			await result.current.startRecording().catch(() => {});
		});
		expect(getUserMedia).toHaveBeenCalled();
		expect(result.current.error).not.toBeNull();
	});

	it("delivers the sidecar WAV on stop", async () => {
		mockedInvoke.mockImplementation((cmd) => {
			if (cmd === "list_mic_input_devices") {
				return Promise.resolve([]);
			}
			if (cmd === "start_mic_capture") {
				return Promise.resolve();
			}
			if (cmd === "stop_mic_capture") {
				return Promise.resolve(btoa("RIFFdata"));
			}
			return Promise.reject(new Error("unexpected"));
		});
		Object.defineProperty(window.navigator, "mediaDevices", {
			value: {},
			configurable: true,
		});
		let delivered: Blob | null = null;
		const { result } = renderHook(
			() =>
				useAudioRecording({
					onRecordingComplete: (blob) => {
						delivered = blob;
					},
				}),
			{
				wrapper: ({ children }: { children: React.ReactNode }) => (
					<PlatformProvider platform={tauriPlatform}>
						{children}
					</PlatformProvider>
				),
			},
		);
		await act(async () => {
			await result.current.startRecording();
		});
		expect(result.current.isRecording).toBe(true);
		await act(async () => {
			result.current.stopRecording();
		});
		expect(delivered).not.toBeNull();
		expect((delivered as unknown as Blob).type).toBe("audio/wav");
	});
});
