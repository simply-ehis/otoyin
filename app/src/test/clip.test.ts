import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useServerStore } from "@/stores/serverStore";

// Reset server URL and stub browser globals before each test so the suite is
// deterministic regardless of what other test files do to globalThis.
beforeEach(() => {
	useServerStore.setState({ serverUrl: "http://localhost:17493" });
	vi.stubGlobal("fetch", vi.fn());
	vi.stubGlobal("Audio", vi.fn());
	// clip.ts logs via console.error on expected-throw paths; silence that noise.
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

// ── toClip (internal, tested via getClip) ──────────────────────────

describe("clip module", () => {
	describe("copyClip", () => {
		it("sends PUT to /clipboard with correct payload", async () => {
			const { copyClip } = await import("@/lib/clip");
			const mockFetch = vi.mocked(globalThis.fetch);
			mockFetch.mockResolvedValueOnce(new Response("", { status: 200 }));

			await copyClip({
				kind: "generation",
				id: "gen-123",
				audioUrl: "http://localhost:17493/audio/gen-123",
				name: "Hello world",
				durationMs: 5200,
			});

			expect(mockFetch).toHaveBeenCalledOnce();
			const [url, opts] = mockFetch.mock.calls[0];
			expect(url).toBe("http://localhost:17493/clipboard");
			expect(opts?.method).toBe("PUT");

			const body = JSON.parse(opts?.body as string);
			expect(body).toEqual({
				kind: "generation",
				entity_id: "gen-123",
				name: "Hello world",
				duration_ms: 5200,
				audio_url: "http://localhost:17493/audio/gen-123",
			});
		});

		it("converts 0/null duration to null in payload", async () => {
			const { copyClip } = await import("@/lib/clip");
			const mockFetch = vi.mocked(globalThis.fetch);
			mockFetch.mockResolvedValueOnce(new Response("", { status: 200 }));

			await copyClip({
				kind: "capture",
				id: "cap-1",
				audioUrl: "",
				name: "Test",
				durationMs: 0,
			});

			const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
			expect(body.duration_ms).toBeNull();
			expect(body.audio_url).toBeNull();
		});

		it("throws on non-200 response", async () => {
			const { copyClip } = await import("@/lib/clip");
			vi.mocked(globalThis.fetch).mockResolvedValueOnce(
				new Response("error", { status: 500 }),
			);

			await expect(
				copyClip({
					kind: "sample",
					id: "s1",
					audioUrl: "",
					name: "X",
					durationMs: 100,
				}),
			).rejects.toThrow("clipboard write failed: 500");
		});

		it("throws on network error", async () => {
			const { copyClip } = await import("@/lib/clip");
			vi.mocked(globalThis.fetch).mockRejectedValueOnce(
				new Error("NetworkError"),
			);

			await expect(
				copyClip({
					kind: "sample",
					id: "s1",
					audioUrl: "",
					name: "X",
					durationMs: 100,
				}),
			).rejects.toThrow("NetworkError");
		});
	});

	describe("getClip", () => {
		it("returns null on 404 (empty clipboard)", async () => {
			const { getClip } = await import("@/lib/clip");
			vi.mocked(globalThis.fetch).mockResolvedValueOnce(
				new Response("Not Found", { status: 404 }),
			);

			const clip = await getClip();
			expect(clip).toBeNull();
		});

		it("parses a valid clipboard payload into a Clip", async () => {
			const { getClip } = await import("@/lib/clip");
			const payload = {
				kind: "story_item",
				entity_id: "story-42",
				name: "Chapter 1",
				duration_ms: 12000,
				audio_url: "http://localhost:17493/audio/story-42",
				created_at: "2026-01-01T00:00:00Z",
			};
			vi.mocked(globalThis.fetch).mockResolvedValueOnce(
				new Response(JSON.stringify(payload), { status: 200 }),
			);

			const clip = await getClip();
			expect(clip).not.toBeNull();
			expect(clip?.kind).toBe("story_item");
			expect(clip?.id).toBe("story-42");
			expect(clip?.name).toBe("Chapter 1");
			expect(clip?.durationMs).toBe(12000);
			expect(clip?.audioUrl).toBe("http://localhost:17493/audio/story-42");
		});

		it("handles null duration_ms and audio_url", async () => {
			const { getClip } = await import("@/lib/clip");
			vi.mocked(globalThis.fetch).mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						kind: "dsp",
						entity_id: "d1",
						name: "DSP",
						duration_ms: null,
						audio_url: null,
						created_at: "2026-01-01T00:00:00Z",
					}),
					{ status: 200 },
				),
			);

			const clip = await getClip();
			expect(clip?.durationMs).toBe(0);
			expect(clip?.audioUrl).toBe("");
		});

		it("throws on server errors", async () => {
			const { getClip } = await import("@/lib/clip");
			vi.mocked(globalThis.fetch).mockResolvedValueOnce(
				new Response("error", { status: 500 }),
			);

			await expect(getClip()).rejects.toThrow("clipboard read failed: 500");
		});
	});

	describe("clearClip", () => {
		it("sends DELETE to /clipboard", async () => {
			const { clearClip } = await import("@/lib/clip");
			const mockFetch = vi.mocked(globalThis.fetch);
			mockFetch.mockResolvedValueOnce(new Response("", { status: 200 }));

			await clearClip();

			expect(mockFetch).toHaveBeenCalledOnce();
			const [url, opts] = mockFetch.mock.calls[0];
			expect(url).toBe("http://localhost:17493/clipboard");
			expect(opts?.method).toBe("DELETE");
		});

		it("throws on failure", async () => {
			const { clearClip } = await import("@/lib/clip");
			vi.mocked(globalThis.fetch).mockResolvedValueOnce(
				new Response("error", { status: 500 }),
			);

			await expect(clearClip()).rejects.toThrow("clipboard clear failed: 500");
		});
	});

	describe("ClipKind coverage", () => {
		it("all clip kinds are accepted by copyClip", async () => {
			const { copyClip } = await import("@/lib/clip");
			const mockFetch = vi.mocked(globalThis.fetch);
			mockFetch.mockResolvedValue(new Response("", { status: 200 }));

			const kinds = [
				"sample",
				"capture",
				"generation",
				"story_item",
				"studio_track",
				"adr_take",
				"comp",
				"mixer_state",
				"dsp",
			] as const;

			for (const kind of kinds) {
				await copyClip({
					kind,
					id: "test",
					audioUrl: "",
					name: "test",
					durationMs: 0,
				});
			}

			expect(mockFetch).toHaveBeenCalledTimes(kinds.length);
		});
	});
});
