/**
 * waveformPlaylist unit tests — the StoriesTab adapter's pure-logic floor.
 *
 * Covers the ms↔sample converters, the engine-safe zoom ladder snap (the
 * PlaylistEngine constructor throws unless the initial samplesPerPixel is an
 * exact zoomLevels member), StoryItemDetail→AudioClip mapping (trims, speed,
 * gain, fades, naming), buildClipTracks grouping/filtering, and
 * decodeClipAudio's URL selection + failure paths. apiClient and fetch are
 * mocked; AudioBuffers are minimal fakes (jsdom has no WebAudio).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoryItemDetail } from "@/lib/api/types";
import { TRACK_HEIGHT } from "./timeline";
import {
	buildClipTracks,
	decodeClipAudio,
	hslFromToken,
	itemToAudioClip,
	msToSamples,
	ppsToSamplesPerPixel,
	samplesPerPixelToPps,
	TIMELINE_SAMPLE_RATE,
	trackId,
	ZOOM_LADDER_SPP,
} from "./waveformPlaylist";

vi.mock("@/lib/api/client", () => ({
	apiClient: {
		getAudioUrl: vi.fn((id: string) => `http://test/audio/${id}`),
		getVersionAudioUrl: vi.fn(
			(id: string) => `http://test/audio/version/${id}`,
		),
	},
}));

/** Minimal AudioBuffer stand-in (jsdom has no WebAudio). */
function fakeBuffer(length: number, sampleRate = TIMELINE_SAMPLE_RATE) {
	return { length, sampleRate } as unknown as AudioBuffer;
}

function makeItem(overrides: Partial<StoryItemDetail> = {}): StoryItemDetail {
	return {
		id: "item-1",
		story_id: "story-1",
		generation_id: "gen-1",
		start_time_ms: 1000,
		track: 0,
		trim_start_ms: 0,
		trim_end_ms: 0,
		created_at: "",
		profile_id: "p1",
		profile_name: "Nova",
		text: "hello world",
		language: "en",
		audio_path: "",
		duration: 2,
		volume: 1,
		fade_in_ms: 0,
		fade_out_ms: 0,
		gain_db: 0,
		pan: 0,
		generation_created_at: "",
		...overrides,
	};
}

describe("zoom ladder", () => {
	it("snaps every pixels-per-second value onto an exact ladder rung", () => {
		for (let pps = 0.5; pps < 200; pps += 0.7) {
			const spp = ppsToSamplesPerPixel(pps);
			expect(ZOOM_LADDER_SPP).toContain(spp);
		}
	});

	it("returns the exact rung for a pps that maps onto it", () => {
		// 48000 / 46.875 = 1024 exactly
		expect(ppsToSamplesPerPixel(TIMELINE_SAMPLE_RATE / 1024)).toBe(1024);
	});

	it("snaps a between-rungs pps to the nearest rung", () => {
		// 48000 / 100 = 480 → |384-480|=96 < |512-480|=32? No: 512 is nearest.
		expect(ppsToSamplesPerPixel(100)).toBe(512);
	});

	it("never returns a rung outside the ladder even at extremes", () => {
		expect(ZOOM_LADDER_SPP).toContain(ppsToSamplesPerPixel(1e9));
		expect(ZOOM_LADDER_SPP).toContain(ppsToSamplesPerPixel(0));
	});

	it("round-trips spp → pps at the timeline rate", () => {
		expect(samplesPerPixelToPps(1024)).toBeCloseTo(TIMELINE_SAMPLE_RATE / 1024);
	});

	it("is ladder-membership-stable under round trip", () => {
		const pps = 33.5;
		const spp = ppsToSamplesPerPixel(pps);
		const resnapped = ppsToSamplesPerPixel(samplesPerPixelToPps(spp));
		expect(resnapped).toBe(spp);
	});
});

describe("msToSamples", () => {
	it("converts at the 48 kHz timeline rate", () => {
		expect(msToSamples(1000)).toBe(48000);
		expect(msToSamples(0)).toBe(0);
		expect(msToSamples(1)).toBe(48);
	});

	it("rounds fractional samples", () => {
		expect(msToSamples(1000 / 3)).toBe(16000);
	});
});

describe("trackId", () => {
	it("produces stable ids for arbitrary track numbers", () => {
		expect(trackId(0)).toBe("otoyin-track-0");
		expect(trackId(-3)).toBe("otoyin-track--3");
		expect(trackId(12)).toBe(trackId(12));
	});
});

describe("itemToAudioClip", () => {
	it("maps start, trim offset, and duration into sample space", () => {
		const clip = itemToAudioClip(
			makeItem({
				start_time_ms: 1000,
				trim_start_ms: 250,
				trim_end_ms: 250,
				duration: 2,
			}),
			fakeBuffer(96000),
		);
		expect(clip.id).toBe("item-1");
		expect(clip.startSample).toBe(48000);
		expect(clip.offsetSamples).toBe(12000);
		// source span = 2000 - 500 = 1500ms at speed 1 → 72000 samples
		expect(clip.durationSamples).toBe(72000);
		expect(clip.sampleRate).toBe(TIMELINE_SAMPLE_RATE);
		expect(clip.sourceDurationSamples).toBe(96000);
	});

	it("shortens the clip by speed", () => {
		const clip = itemToAudioClip(
			makeItem({ trim_start_ms: 250, trim_end_ms: 250, speed: 2 }),
			fakeBuffer(96000),
		);
		expect(clip.durationSamples).toBe(36000);
	});

	it("combines volume and gain_db into clip gain", () => {
		const clip = itemToAudioClip(
			makeItem({ volume: 0.5, gain_db: -6 }),
			fakeBuffer(48000),
		);
		expect(clip.gain).toBeCloseTo(0.5 * 10 ** (-6 / 20), 5);
	});

	it("maps fades to seconds", () => {
		const clip = itemToAudioClip(
			makeItem({ fade_in_ms: 500, fade_out_ms: 250 }),
			fakeBuffer(48000),
		);
		expect(clip.fadeIn?.duration).toBe(0.5);
		expect(clip.fadeOut?.duration).toBe(0.25);
	});

	it("names imported clips by text and generated clips by profile", () => {
		const imported = itemToAudioClip(
			makeItem({ engine: "import" }),
			fakeBuffer(48000),
		);
		const generated = itemToAudioClip(makeItem(), fakeBuffer(48000));
		expect(imported.name).toBe("hello world");
		expect(generated.name).toBe("Nova");
	});

	it("never produces a non-positive duration", () => {
		const clip = itemToAudioClip(
			makeItem({ duration: 0.1, trim_start_ms: 100, trim_end_ms: 100 }),
			fakeBuffer(48000),
		);
		expect(clip.durationSamples).toBeGreaterThanOrEqual(1);
	});
});

describe("buildClipTracks", () => {
	it("creates one track per track number in the given order", () => {
		const tracks = buildClipTracks(
			[makeItem({ track: 0 }), makeItem({ track: 2, id: "item-2" })],
			new Map([
				["gen-1", fakeBuffer(48000)],
				["gen-2", fakeBuffer(48000)],
			]),
			[2, 0],
		);
		expect(tracks.map((t) => t.name)).toEqual(["2", "0"]);
		expect(tracks[0].clips.map((c) => c.id)).toEqual(["item-2"]);
		expect(tracks[1].clips.map((c) => c.id)).toEqual(["item-1"]);
	});

	it("skips items whose buffer failed to decode", () => {
		const tracks = buildClipTracks(
			[makeItem(), makeItem({ generation_id: "gen-missing" })],
			new Map([["gen-1", fakeBuffer(48000)]]),
			[0],
		);
		expect(tracks).toHaveLength(1);
		expect(tracks[0].clips).toHaveLength(1);
	});

	it("keeps the engine silent (volume 0) and rows at TRACK_HEIGHT", () => {
		const tracks = buildClipTracks([], new Map(), [0, 1]);
		for (const track of tracks) {
			expect(track.volume).toBe(0);
			expect(track.height).toBe(TRACK_HEIGHT);
			expect(track.muted).toBe(false);
			expect(track.soloed).toBe(false);
		}
	});
});

describe("decodeClipAudio", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("uses the version audio URL when a version is pinned", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			arrayBuffer: async () => new ArrayBuffer(8),
		});
		vi.stubGlobal("fetch", fetchMock);
		const ctx = {
			decodeAudioData: vi.fn().mockResolvedValue(fakeBuffer(48)),
		} as unknown as AudioContext;

		const buf = await decodeClipAudio(makeItem({ version_id: "v-9" }), ctx);
		expect(fetchMock).toHaveBeenCalledWith("http://test/audio/version/v-9");
		expect(buf).not.toBeNull();
	});

	it("falls back to the generation audio URL without a version", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			arrayBuffer: async () => new ArrayBuffer(8),
		});
		vi.stubGlobal("fetch", fetchMock);
		const ctx = {
			decodeAudioData: vi.fn().mockResolvedValue(fakeBuffer(48)),
		} as unknown as AudioContext;

		await decodeClipAudio(makeItem(), ctx);
		expect(fetchMock).toHaveBeenCalledWith("http://test/audio/gen-1");
	});

	it("resolves null on a non-ok response", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({ ok: false, status: 404 }),
		);
		const buf = await decodeClipAudio(makeItem(), {} as AudioContext);
		expect(buf).toBeNull();
	});

	it("resolves null when fetch throws (server down / deleted generation)", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
		const buf = await decodeClipAudio(makeItem(), {} as AudioContext);
		expect(buf).toBeNull();
	});

	it("resolves null when decodeAudioData rejects (corrupt bytes)", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				arrayBuffer: async () => new ArrayBuffer(8),
			}),
		);
		const ctx = {
			decodeAudioData: vi.fn().mockRejectedValue(new Error("bad data")),
		} as unknown as AudioContext;
		const buf = await decodeClipAudio(makeItem(), ctx);
		expect(buf).toBeNull();
	});
});

describe("hslFromToken", () => {
	it("returns an empty string for unresolvable tokens", () => {
		expect(hslFromToken("--definitely-not-a-token")).toBe("");
	});

	it("wraps a resolvable custom property in hsl()", () => {
		document.documentElement.style.setProperty("--test-token", "10 20% 30%");
		try {
			expect(hslFromToken("--test-token")).toBe("hsl(10 20% 30%)");
		} finally {
			document.documentElement.style.removeProperty("--test-token");
		}
	});
});
