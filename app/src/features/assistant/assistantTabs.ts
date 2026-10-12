/** Route path → human tab name for the assistant's location awareness. */

export const ASSISTANT_TAB_NAMES: Record<string, string> = {
	"/": "Generate",
	"/audio-studio": "Audio Studio",
	"/stories": "Stories",
	"/audiobooks": "Audiobooks",
	"/workspace": "Workspace",
	"/instruments": "Instruments",
	"/voices": "Voices",
	"/effects": "Effects",
	"/captures": "Captures",
	"/dubbing": "Dubbing",
	"/library": "Library",
	"/store": "Store",
	"/settings": "Settings",
	"/songwriter": "Songwriter",
	"/launcher": "Launcher",
	"/sounds": "Sounds",
};

/** Human tab name for a route path (falls back to the raw path). */
export function tabLabelForPath(path: string): string {
	return ASSISTANT_TAB_NAMES[path] ?? path;
}
