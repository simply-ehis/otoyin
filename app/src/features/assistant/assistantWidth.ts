// Assistant panel width bounds. The panel is a flex sibling of the route
// content, so any width it takes is taken from the main area — these bounds
// are what keep the rest of the app from being squeezed off-screen.

export const ASSISTANT_WIDTH_MIN = 360;
export const ASSISTANT_WIDTH_DEFAULT = 480;
/** Hard ceiling even on ultrawide screens — past this a "panel" is a window. */
export const ASSISTANT_WIDTH_MAX = 960;
/** Minimum width we leave for sidebar + main content. */
export const ASSISTANT_WIDTH_CONTENT_FLOOR = 560;

/**
 * Clamp a requested assistant-panel width for the current window size.
 *
 * `windowWidth` is passed in (not read from globals) so the function stays
 * pure and testable.
 */
export function clampAssistantWidth(
	width: number,
	windowWidth: number,
): number {
	const max = Math.max(
		ASSISTANT_WIDTH_MIN,
		Math.min(ASSISTANT_WIDTH_MAX, windowWidth - ASSISTANT_WIDTH_CONTENT_FLOOR),
	);
	return Math.min(Math.max(ASSISTANT_WIDTH_MIN, width), max);
}
