/**
 * TimelineView tests — cover empty state, track lanes, snap toggle,
 * undo/redo, export, mute and play controls.
 *
 * `useTimelineTracks` is mocked so the component is tested in isolation
 * with controlled track state. `usePlayerStore` is the real Zustand
 * store (works in jsdom); assertions read state via getState().
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore } from "@/stores/playerStore";

vi.mock("./useTimelineTracks", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./useTimelineTracks")>();
	return {
		...actual,
		useTimelineTracks: vi.fn(),
	};
});

vi.mock("@/lib/hooks/useHistory", () => ({
	useHistory: vi.fn(() => ({ data: { items: [] } })),
}));

vi.mock("@/ui/use-toast", () => ({
	useToast: vi.fn(() => ({ toast: vi.fn() })),
}));

vi.mock("@/features/audioStudio/getPeakWaveform", () => ({
	getPeakWaveform: vi.fn(() => new Float32Array([])),
}));

vi.mock("@/lib/clip", () => ({
	getClip: vi.fn(() => null),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@tanstack/react-router")>();
	return {
		...actual,
		useNavigate: vi.fn(() => vi.fn()),
	};
});

import { useToast } from "@/ui/use-toast";
import { TimelineView } from "./TimelineView";
import { useTimelineTracks } from "./useTimelineTracks";

const mockedUseTimelineTracks = vi.mocked(useTimelineTracks);
const mockedUseToast = vi.mocked(useToast);

const trackState = {
	tracks: [] as Array<{
		id: string;
		name: string;
		muted: boolean;
		solo: boolean;
		volume: number;
		audioUrl?: string;
		duration?: number;
		startTime: number;
	}>,
	setTracks: vi.fn(),
	snap: true,
	setSnap: vi.fn(),
	zoom: 1,
	setZoom: vi.fn(),
	undoStack: [] as unknown[][],
	redoStack: [] as unknown[][],
	undo: vi.fn(),
	redo: vi.fn(),
	maxDuration: vi.fn(() => 0),
	sensors: [] as unknown[],
	handleDragStart: vi.fn(),
	handleDragEnd: vi.fn(),
	transformRefs: { current: new Map<string, number>() },
};

beforeEach(() => {
	vi.resetAllMocks();
	Object.defineProperty(window, "AudioContext", {
		value: class {
			decodeAudioData = vi.fn(() =>
				Promise.resolve({ getChannelData: () => new Float32Array([]) } as any),
			);
		},
		writable: true,
		configurable: true,
	});
	// Reset the real player store to a known state
	usePlayerStore.setState({
		isPlaying: false,
		audioUrl: null,
		currentTime: 0,
		duration: 0,
		volume: 1,
	});
	mockedUseTimelineTracks.mockReturnValue(trackState as any);
	mockedUseToast.mockReturnValue({ toast: vi.fn() } as any);
	trackState.tracks = [];
	trackState.setTracks.mockClear();
	trackState.setSnap.mockClear();
});

afterEach(() => {
	vi.restoreAllMocks();
	usePlayerStore.setState({
		isPlaying: false,
		audioUrl: null,
	});
});

describe("TimelineView", () => {
	it("renders empty state with import button", () => {
		render(<TimelineView />);
		expect(screen.getByText("No tracks yet")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Import/i })).toBeInTheDocument();
	});

	it("renders track lanes with clip names", () => {
		trackState.tracks = [
			{
				id: "t1",
				name: "Drum loop",
				muted: false,
				solo: false,
				volume: 0.75,
				duration: 4,
				startTime: 0,
			},
		];
		render(<TimelineView />);
		expect(screen.getByText("Drum loop")).toBeInTheDocument();
		expect(screen.getByText(/4\.0s/)).toBeInTheDocument();
	});

	it("renders transport controls when tracks exist", () => {
		trackState.tracks = [
			{
				id: "t1",
				name: "Drum loop",
				muted: false,
				solo: false,
				volume: 0.75,
				duration: 4,
				startTime: 0,
				audioUrl: "/audio/drum.wav",
			},
		];
		render(<TimelineView />);
		expect(screen.getByRole("button", { name: /Undo/i })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Redo/i })).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /Snap to grid/i }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: /Play/i })).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /Export clips/i }),
		).toBeInTheDocument();
	});

	it("toggles snap when Snap button is clicked", () => {
		trackState.tracks = [
			{
				id: "t1",
				name: "Drum loop",
				muted: false,
				solo: false,
				volume: 0.75,
				duration: 4,
				startTime: 0,
				audioUrl: "/audio/drum.wav",
			},
		];
		render(<TimelineView />);
		const snapBtn = screen.getByRole("button", { name: /Snap to grid/i });
		fireEvent.click(snapBtn);
		expect(trackState.setSnap).toHaveBeenCalled();
	});

	it("undo button is disabled with empty undo stack", () => {
		trackState.tracks = [
			{
				id: "t1",
				name: "Drum loop",
				muted: false,
				solo: false,
				volume: 0.75,
				duration: 4,
				startTime: 0,
				audioUrl: "/audio/drum.wav",
			},
		];
		trackState.undoStack = [];
		render(<TimelineView />);
		expect(screen.getByRole("button", { name: /Undo/i })).toBeDisabled();
	});

	it("mute button toggles mute on a track", () => {
		trackState.tracks = [
			{
				id: "t1",
				name: "Drum loop",
				muted: false,
				solo: false,
				volume: 0.75,
				duration: 4,
				startTime: 0,
				audioUrl: "/audio/drum.wav",
			},
		];
		render(<TimelineView />);
		trackState.setTracks.mockClear();
		const muteBtn = screen.getByRole("button", {
			name: /Mute Drum loop/i,
		});
		fireEvent.click(muteBtn);
		expect(trackState.setTracks).toHaveBeenCalledTimes(1);
		const updater = trackState.setTracks.mock.calls[0][0];
		expect(typeof updater).toBe("function");
		const updated = updater(trackState.tracks);
		expect(updated[0].muted).toBe(true);
	});

	it("play button sets isPlaying=true when nothing is playing", () => {
		trackState.tracks = [
			{
				id: "t1",
				name: "Drum loop",
				muted: false,
				solo: false,
				volume: 0.75,
				duration: 4,
				startTime: 0,
				audioUrl: "/audio/drum.wav",
			},
		];
		usePlayerStore.setState({ isPlaying: false, audioUrl: null });
		render(<TimelineView />);
		const playBtn = screen.getByRole("button", { name: /Play/i });
		fireEvent.click(playBtn);
		expect(usePlayerStore.getState().isPlaying).toBe(true);
	});

	it("export calls fetch for each placed clip", async () => {
		trackState.tracks = [
			{
				id: "t1",
				name: "Drum loop",
				muted: false,
				solo: false,
				volume: 0.75,
				duration: 4,
				startTime: 0,
				audioUrl: "/audio/drum.wav",
			},
		];
		const mockFetch = vi.fn(() =>
			Promise.resolve({
				blob: () => Promise.resolve(new Blob([])),
			} as Response),
		);
		vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);
		const createSpy = vi.spyOn(URL, "createObjectURL");

		render(<TimelineView />);
		const exportBtn = screen.getByRole("button", { name: /Export clips/i });
		fireEvent.click(exportBtn);

		await vi.waitFor(() => {
			expect(mockFetch).toHaveBeenCalledWith("/audio/drum.wav");
		});
		await vi.waitFor(() => {
			expect(createSpy).toHaveBeenCalled();
		});

		createSpy.mockRestore();
		vi.spyOn(globalThis, "fetch").mockRestore();
	});

	it("shows 'Nothing to export' toast when no clips have audio", () => {
		trackState.tracks = [
			{
				id: "t1",
				name: "Drum loop",
				muted: false,
				solo: false,
				volume: 0.75,
				duration: 4,
				startTime: 0,
			},
		];
		render(<TimelineView />);
		const exportBtn = screen.getByRole("button", { name: /Export clips/i });
		fireEvent.click(exportBtn);
		const { toast } = mockedUseToast();
		expect(toast).toHaveBeenCalledWith(
			expect.objectContaining({ title: "Nothing to export" }),
		);
	});
});
