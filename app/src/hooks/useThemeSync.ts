/**
 * Theme sync — resolves "system" to the current OS preference, applies the
 * theme classes to <html> and re-applies the accent preset so one effect owns
 * both.
 *
 * - `dark` / `system-resolved-dark` → adds `dark` class
 * - `light` / `system-resolved-light` → adds `light` class (full token flip;
 *   without it the dark @theme defaults leak through and only a portion
 *   appears to switch)
 * - `stripe` → adds `theme-stripe` + `dark`
 *
 * Unknown persisted themes (e.g. the retired `di-stefano`) resolve to
 * "system" so the app always boots in a sane, working state.
 *
 * Must be called once at the top level (AppFrame).
 */
import { useEffect } from "react";

import {
	applyAccentPreset,
	applyThemeAccent,
	clearAccentPreset,
} from "@/lib/design-system";
import { ALL_THEMES, THEME_META, useUIStore } from "@/stores/uiStore";

const THEME_CLASSES = ["dark", "light", "theme-stripe"] as const;

const KNOWN_THEMES = new Set<string>(ALL_THEMES);

function resolveTheme(theme: string): string {
	if (!KNOWN_THEMES.has(theme)) {
		theme = "system";
	}
	if (theme === "system") {
		return window.matchMedia("(prefers-color-scheme: dark)").matches
			? "dark"
			: "light";
	}
	return theme;
}

function applyTheme(theme: string, accent: string) {
	const root = document.documentElement;
	for (const cls of THEME_CLASSES) {
		root.classList.remove(cls);
	}
	const resolved = resolveTheme(theme);
	const meta = THEME_META[resolved as keyof typeof THEME_META];
	const isDark = meta.dark;
	if (resolved === "stripe") {
		root.classList.add("dark", "theme-stripe");
	} else {
		root.classList.add(isDark ? "dark" : "light");
	}
	// Named themes install their full token set; plain themes clear it.
	applyThemeAccent(resolved);
	if (resolved === "stripe") {
		// Special theme: keep its curated accent; drop any preset leftovers
		// from a previously selected plain theme.
		clearAccentPreset();
	} else {
		applyAccentPreset(accent, isDark);
	}
}

export function useThemeSync(): void {
	const theme = useUIStore((s) => s.theme);
	const accent = useUIStore((s) => s.accent);

	useEffect(() => {
		applyTheme(theme, accent);
	}, [theme, accent]);

	// Listen for system preference changes when theme is "system"
	useEffect(() => {
		if (theme !== "system") {
			return;
		}
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		// Read the latest accent at fire time so accent changes don't tear
		// down and re-register this listener.
		const handler = () => applyTheme("system", useUIStore.getState().accent);
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}, [theme]);
}
