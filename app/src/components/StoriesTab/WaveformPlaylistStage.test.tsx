/**
 * WaveformPlaylistStage render tests — the overlay-plane contract.
 *
 * The stage hosts otoyin's overlays (trim ring, playhead, automation layer)
 * in a pointer-events-none plane above the library's visualization. These
 * tests pin the pointer-events split that keeps interaction working:
 * the plane never blocks the library's clips, but interactive overlays
 * re-enable hit testing (trim handles, automation lanes) — and the library's
 * own playhead/clip interactions stay suppressed (otoyin owns those).
 *
 * The library module is mocked: real contexts need the PlaylistEngine,
 * WebAudio, and a mounted scroll container that jsdom can't provide.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StoryItemDetail } from "@/lib/api/types";
import { TRACK_HEIGHT } from "./timeline";
import { WaveformPlaylistStage } from "./WaveformPlaylistStage";
import { samplesPerPixelToPps } from "./waveformPlaylist";

// Fixed engine state: spp 512 is an exact ladder rung → pps = 48000/512.
vi.mock("@waveform-playlist/browser", () => ({
	PlaylistVisualization: (props: Record<string, unknown>) => (
		<div
			data-testid="playlist-viz"
			data-suppresses-playhead={String(
				typeof props.renderPlayhead === "function",
			)}
			data-interactive-clips={String(props.interactiveClips)}
		/>
	),
	usePlaylistData: () => ({
		samplesPerPixel: 512,
		sampleRate: 48000,
		isReady: true,
		duration: 4,
		playoutRef: { current: null },
	}),
	usePlaylistControls: () => ({
		setTrackMute: vi.fn(),
		setTrackSolo: vi.fn(),
		zoomIn: vi.fn(),
		zoomOut: vi.fn(),
	}),
}));

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
		text: "hello",
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

function renderStage(
	overrides: {
		selectedClipId?: string | null;
		automationOverlay?: React.ReactNode;
	} = {},
) {
	// Destructure defaults trigger only on `undefined`, so an explicit `null`
	// override passes through ("nothing selected" / "no overlay").
	const {
		selectedClipId = "item-1",
		automationOverlay = <div data-testid="automation-lane" />,
	} = overrides;
	const props = {
		items: [makeItem()],
		currentTimeMs: 2000,
		tracks: [0],
		selectedClipId,
		onSelectClip: vi.fn(),
		onSeekMs: vi.fn(),
		onMoveItem: vi.fn(),
		trackMutes: [false],
		trackSolos: [false],
		pixelsPerSecond: samplesPerPixelToPps(512),
		onPixelsPerSecondChange: vi.fn(),
		trimmingItem: null,
		tempTrimValues: null,
		onTrimStart: vi.fn(),
		crossfadeHandles: <div data-testid="xfade-handles" />,
		automationOverlay,
	};
	const view = render(<WaveformPlaylistStage {...props} />);
	const stage = view.container.querySelector("[data-playlist-stage]");
	if (!(stage instanceof HTMLElement)) {
		throw new Error("stage root [data-playlist-stage] not rendered");
	}
	// Child 0 is the mocked PlaylistVisualization; child 1 is the overlay plane.
	const plane = stage.children[1] as HTMLElement;
	return { view, stage, plane, props };
}

describe("WaveformPlaylistStage overlay plane", () => {
	it("hosts trim ring, playhead, and automation layer inside a pointer-events-none plane", () => {
		const { plane } = renderStage();

		// The plane itself never intercepts pointer input — the library's
		// clip surface underneath must receive every event not claimed by an
		// interactive overlay.
		expect(plane.className).toContain("pointer-events-none");

		// Trim ring: ring box is visual-only (none) but its handles are live.
		const handles = plane.querySelectorAll("button[data-trim-handle]");
		expect(handles).toHaveLength(2);
		for (const handle of handles) {
			expect(handle.className).toContain("pointer-events-auto");
		}
		const ring = handles[0].parentElement as HTMLElement;
		expect(ring.className).toContain("ring-2");
		expect(ring.style.pointerEvents).toBe("none");

		// Playhead lives in the plane and stays click-through.
		const playhead = plane.querySelector(".w-1.bg-accent") as HTMLElement;
		expect(playhead).not.toBeNull();
		expect(playhead.className).toContain("pointer-events-none");

		// Automation layer re-enables hit testing for its interactive lanes
		// and hosts whatever overlay subtree the editor passes.
		const automation = plane.querySelector("[data-automation-layer]");
		expect(automation).not.toBeNull();
		expect(automation?.className).toContain("pointer-events-auto");
		expect(screen.getByTestId("automation-lane")).not.toBeNull();

		// Crossfade handles are hosted in the same plane.
		expect(plane.querySelector("[data-testid='xfade-handles']")).not.toBeNull();
	});

	it("positions the playhead from currentTimeMs at engine-snapped pps", () => {
		const { plane } = renderStage();
		const playhead = plane.querySelector(".w-1.bg-accent") as HTMLElement;
		const expectedLeft = (2000 / 1000) * samplesPerPixelToPps(512);
		expect(playhead.style.left).toBe(`${expectedLeft}px`);
	});

	it("positions the trim ring on the selected clip's row with live start/end handles", () => {
		const { plane } = renderStage();
		const handles = plane.querySelectorAll("button[data-trim-handle]");
		const ring = handles[0].parentElement as HTMLElement;
		// start_time_ms 1000 → (1000/1000) * pps; track 0 → top 0 × TRACK_HEIGHT.
		expect(ring.style.left).toBe(`${samplesPerPixelToPps(512)}px`);
		expect(ring.style.top).toBe("0px");
		expect(ring.style.height).toBe(`${TRACK_HEIGHT}px`);
		expect((handles[0] as HTMLElement).getAttribute("aria-label")).toBe(
			"Trim start",
		);
		expect((handles[1] as HTMLElement).getAttribute("aria-label")).toBe(
			"Trim end",
		);
	});

	it("renders no trim ring when no clip is selected", () => {
		const { plane } = renderStage({ selectedClipId: null });
		expect(plane.querySelectorAll("[data-trim-handle]")).toHaveLength(0);
	});

	it("renders no automation layer when no overlay is provided", () => {
		const { plane } = renderStage({ automationOverlay: null });
		expect(plane.querySelector("[data-automation-layer]")).toBeNull();
	});

	it("suppresses the library's built-in playhead and clip interactions", () => {
		const { stage } = renderStage();
		const viz = stage.querySelector("[data-testid='playlist-viz']");
		expect(viz?.getAttribute("data-suppresses-playhead")).toBe("true");
		expect(viz?.getAttribute("data-interactive-clips")).toBe("false");
	});
});
