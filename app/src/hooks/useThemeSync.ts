import { useEffect } from "react";

import { THEME_META, useUIStore } from "@/stores/uiStore";

/**
 * Syncs the theme Zustand state to CSS classes on `<html>`.
 *
 * - `dark` / `system-resolved-dark` → adds `dark` class
 * - `di-stefano` → adds `di-stefano` + `dark`
 * - `stripe` → adds `theme-stripe` + `dark`
 * - `coastal-light` → adds `theme-coastal-light`
 * - `mesh-dark` → adds `theme-mesh-dark` + `dark`
 * - `light` / `system-resolved-light` → removes all theme classes
 *
 * Must be called once at the top level (AppFrame).
 */
export function useThemeSync(): void {
	const theme = useUIStore((s) => s.theme);

	useEffect(() => {
		const root = document.documentElement;
		const allClasses = [
			"dark",
			"di-stefano",
			"theme-stripe",
			"theme-coastal-light",
			"theme-mesh-dark",
		];

		// Resolve "system" to actual preference
		let resolved = theme;
		if (theme === "system") {
			resolved = window.matchMedia("(prefers-color-scheme: dark)").matches
				? "dark"
				: "light";
		}

		const meta = THEME_META[resolved];
		const isDark = meta?.dark ?? false;
		const isSpecial = resolved !== "light" && resolved !== "dark";

		// Remove all theme classes first
		for (const cls of allClasses) {
			root.classList.remove(cls);
		}

		// Apply dark class for dark themes
		if (isDark) {
			root.classList.add("dark");
		}

		// Apply special theme class
		if (isSpecial) {
			// di-stefano → "di-stefano", others → "theme-{name}"
			const cls =
				resolved === "di-stefano" ? "di-stefano" : `theme-${resolved}`;
			root.classList.add(cls);
		}
	}, [theme]);

	// Listen for system preference changes when theme is "system"
	useEffect(() => {
		if (theme !== "system") {
			return;
		}

		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = () => {
			const root = document.documentElement;
			if (mq.matches) {
				root.classList.add("dark");
				root.classList.remove("theme-coastal-light");
			} else {
				root.classList.remove("dark");
				root.classList.remove("di-stefano");
				root.classList.remove("theme-stripe");
				root.classList.remove("theme-mesh-dark");
			}
		};

		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}, [theme]);
}
