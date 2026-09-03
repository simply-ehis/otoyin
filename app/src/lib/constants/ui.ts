/**
 * UI layout constants for safe area padding
 */

const isWindows =
	typeof navigator !== "undefined" && navigator.userAgent.includes("Windows");

/**
 * Top safe area padding - height of the custom drag region bar
 * Both platforms now use decorations:false + Overlay (Win 32px, macOS 28px).
 * Matches TitleBarDragRegion height so content never underlaps traffic lights / caption buttons.
 */
export const TOP_SAFE_AREA_PADDING = isWindows ? "pt-8" : "pt-7";

/**
 * Bottom safe area padding - height of the audio player
 * Corresponds to Tailwind's pb-32 (8rem / 128px)
 */
export const BOTTOM_SAFE_AREA_PADDING = "pb-32";
