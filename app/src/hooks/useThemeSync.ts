import { useEffect } from "react";

import { THEME_META, useUIStore } from "@/stores/uiStore";

/**
 * Syncs the theme Zustand state to CSS classes on `<html>`.
 *
 * - `dark` / `system-resolved-dark` → adds `dark` class
 * - `light` / `system-resolved-light` → adds `light` class (full token flip;
 *   without it the dark @theme defaults leak through and only a portion
 *   appears to switch)
 * - `di-stefano` → adds `di-stefano` + `dark`
 * - `stripe` → adds `theme-stripe` + `dark`
 * - `coastal-light` → adds `theme-coastal-light` + `light`
 * - `mesh-dark` → adds `theme-mesh-dark` + `dark`
 *
 * Must be called once at the top level (AppFrame).
 */
export function useThemeSync(): void {
	const theme = useUIStore((s) => s.theme);

	useEffect(() => {
		const root = document.documentElement;
		const allClasses = [
			"dark",
			"light",
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

		if (isSpecial) {
			// Special themes carry their own dark/light base.
			if (isDark) {
				root.classList.add("dark");
			} else {
				root.classList.add("light");
			}
			// di-stefano → "di-stefano", others → "theme-{name}"
			const cls =
				resolved === "di-stefano" ? "di-stefano" : `theme-${resolved}`;
			root.classList.add(cls);
		} else if (isDark) {
			root.classList.add("dark");
		} else {
			root.classList.add("light");
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
			for (const cls of [
				"dark",
				"light",
				"di-stefano",
				"theme-stripe",
				"theme-coastal-light",
				"theme-mesh-dark",
			]) {
				root.classList.remove(cls);
			}
			if (mq.matches) {
				root.classList.add("dark");
			} else {
				root.classList.add("light");
			}
		};

		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}, [theme]);
}
