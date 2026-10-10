const TRACK_HEIGHT = 48;
const TIME_RULER_HEIGHT = 24; // h-6 = 1.5rem = 24px
const SCRUB_BAR_HEIGHT = 16;
const LABEL_COL_WIDTH = 64; // w-16 = 4rem = 64px
// Zoom is expressed to the user as how many seconds of timeline are visible
// at once. Min scope = the most you can zoom IN; max scope = the entire
// project. Default scope is what we land on when the editor first measures.
const MIN_VISIBLE_SECONDS = 10;
const DEFAULT_VISIBLE_SECONDS = 60;
const FALLBACK_PIXELS_PER_SECOND = 50; // used until containerWidth is measured
const DEFAULT_TRACKS = [1, 0, -1]; // Default 3 tracks
const MIN_EDITOR_HEIGHT = 120;
const MAX_EDITOR_HEIGHT = 500;

export {
	TRACK_HEIGHT,
	TIME_RULER_HEIGHT,
	SCRUB_BAR_HEIGHT,
	LABEL_COL_WIDTH,
	MIN_VISIBLE_SECONDS,
	DEFAULT_VISIBLE_SECONDS,
	FALLBACK_PIXELS_PER_SECOND,
	DEFAULT_TRACKS,
	MIN_EDITOR_HEIGHT,
	MAX_EDITOR_HEIGHT,
};

export function formatTime(ms: number): string {
	const totalSeconds = Math.floor(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	const tenths = Math.floor((ms % 1000) / 100);
	return `${minutes}:${seconds.toString().padStart(2, "0")}.${tenths}`;
}
