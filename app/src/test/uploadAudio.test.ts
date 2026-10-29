/**
 * Regression tests for clientCore.ts uploadAudio return type fix.
 *
 * Verifies uploadAudio returns { audio_path: string; size: number }
 * matching the backend /dsp/upload response shape.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock fetch globally
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// Mock serverStore
vi.mock("@/stores/serverStore", () => ({
	useServerStore: {
		getState: () => ({ serverUrl: "http://localhost:17493" }),
	},
}));

beforeEach(() => {
	fetchMock.mockReset();
});

describe("uploadAudio return shape", () => {
	it("returns audio_path and size from backend response", async () => {
		const backendResponse = {
			audio_path: "uploads/abc123.wav",
			size: 12345,
		};

		fetchMock.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(backendResponse),
		});

		const { ApiClientCore } = await import("@/lib/api/clientCore");
		const client = new ApiClientCore();

		const file = new File(["dummy"], "test.wav", { type: "audio/wav" });
		const result = await client.uploadAudio(file);

		expect(result).toEqual({
			audio_path: "uploads/abc123.wav",
			size: 12345,
		});
		expect(result.audio_path).toBe("uploads/abc123.wav");
		expect(typeof result.size).toBe("number");
	});

	it("does NOT return old 'path' field", async () => {
		const backendResponse = {
			audio_path: "uploads/def456.wav",
			size: 9999,
		};

		fetchMock.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve(backendResponse),
		});

		const { ApiClientCore } = await import("@/lib/api/clientCore");
		const client = new ApiClientCore();

		const file = new File(["dummy"], "test.wav", { type: "audio/wav" });
		const result = await client.uploadAudio(file);

		// Old shape was { path: "..." } — should not exist
		expect(result).not.toHaveProperty("path");
		// New shape is { audio_path: "...", size: N }
		expect(result).toHaveProperty("audio_path");
		expect(result).toHaveProperty("size");
	});

	it("sends file as multipart form data", async () => {
		fetchMock.mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ audio_path: "x.wav", size: 100 }),
		});

		const { ApiClientCore } = await import("@/lib/api/clientCore");
		const client = new ApiClientCore();

		const file = new File(["content"], "voice.wav", { type: "audio/wav" });
		await client.uploadAudio(file);

		const [, options] = fetchMock.mock.calls[0];
		expect(options.method).toBe("POST");
		expect(options.body).toBeInstanceOf(FormData);
	});
});
