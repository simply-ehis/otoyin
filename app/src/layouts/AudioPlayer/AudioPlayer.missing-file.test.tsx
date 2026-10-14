/**
 * Regression: a failed WaveSurfer.load (e.g. GET /audio/{id} → 404 for a
 * deleted file) must fetch once, then stop. The old effect listed
 * useFallback in its deps, so failure → setUseFallback(true) → re-run →
 * setUseFallback(false) → load() again — an unbounded 404 flood that took
 * the backend down (2026-10-10).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformProvider } from "@/platform/PlatformContext";
import { webPlatform } from "@/platform/webPlatform";
import { usePlayerStore } from "@/stores/playerStore";
import { AudioPlayer } from "./AudioPlayer";

const loadMock = vi.fn();

vi.mock("wavesurfer.js", () => {
	return {
		default: {
			create: () => ({
				on: vi.fn(),
				load: loadMock,
				destroy: vi.fn(),
				pause: vi.fn(),
				play: vi.fn(() => Promise.resolve()),
				seekTo: vi.fn(),
				isPlaying: () => false,
				getDuration: () => 0,
				getCurrentTime: () => 0,
				getMediaElement: () => ({}),
				setMuted: vi.fn(),
				setVolume: vi.fn(),
				setPlaybackRate: vi.fn(),
			}),
		},
	};
});

vi.mock("@/lib/api/client", () => ({
	apiClient: {
		getProfileChannels: vi.fn(),
		listChannels: vi.fn(),
	},
}));

describe("AudioPlayer missing-file load", () => {
	let queryClient: QueryClient;
	let rectSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		loadMock.mockReset();
		// Every load fails — same as a 404 from /audio/{id}.
		loadMock.mockRejectedValue(new Error("Failed to load"));
		// jsdom rects are 0×0; WaveSurfer init treats that as hidden and
		// polls forever. Report a visible waveform container.
		rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect");
		rectSpy.mockReturnValue({
			width: 400,
			height: 36,
			top: 0,
			left: 0,
			right: 400,
			bottom: 36,
			x: 0,
			y: 0,
			toJSON: () => ({}),
		} as DOMRect);
		queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		usePlayerStore.getState().reset();
		usePlayerStore
			.getState()
			.setAudio(
				"http://127.0.0.1:17493/audio/79d8bbf6-e5ab-4e69-8f09-74127823b4cb",
				"79d8bbf6-e5ab-4e69-8f09-74127823b4cb",
				null,
				"Missing take",
			);
	});

	afterEach(() => {
		usePlayerStore.getState().reset();
		queryClient.clear();
		rectSpy.mockRestore();
	});

	it("does not re-fetch unboundedly when load fails", async () => {
		render(
			<QueryClientProvider client={queryClient}>
				<PlatformProvider platform={webPlatform}>
					<AudioPlayer />
				</PlatformProvider>
			</QueryClientProvider>,
		);

		// 3s headroom: jsdom schedules the WaveSurfer init via
		// requestAnimationFrame + 50 ms container-wait retries, which can
		// lag past the default 1 s waitFor on a loaded machine. The
		// exactly-once assertion below is the real regression guard.
		await waitFor(
			() => {
				expect(loadMock).toHaveBeenCalled();
			},
			{ timeout: 3000 },
		);

		// Give any (regressed) effect loop time to re-enter, then freeze.
		await act(async () => {
			await new Promise((r) => setTimeout(r, 250));
		});

		// Exactly one WaveSurfer load for the failed attempt. The fallback
		// <audio> element uses src= and never calls WaveSurfer.load. The
		// 2026-10-10 bug re-entered this effect forever (hundreds of loads).
		expect(loadMock).toHaveBeenCalledTimes(1);
	});
});
