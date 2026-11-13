/**
 * Canonical theme ids. Everything that needs the list (Theme type, migrate
 * guard, schema options, gallery order) derives from here so the three
 * copies can never drift. The two pre-paint bootstraps in app/index.html and
 * tauri/index.html are static copies by necessity — see themesSync.test.ts,
 * which asserts they match.
 */
export const THEME_IDS = ["system", "light", "dark", "stripe"] as const;
export type Theme = (typeof THEME_IDS)[number];
export const PLAIN_THEMES = [
	"system",
	"light",
	"dark",
] as const satisfies readonly Theme[];
export const SPECIAL_THEMES = ["stripe"] as const satisfies readonly Theme[];
export const ALL_THEMES: readonly Theme[] = THEME_IDS;
