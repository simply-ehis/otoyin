import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { REGISTRY } from "@/lib/tabs/registry";
import { useSettingsStore } from "@/stores/settingsStore";

const LAST_TAB_KEY = "otoyin.startup.lastTab";

function readLastTab(): string | null {
	try {
		const v = localStorage.getItem(LAST_TAB_KEY);
		return v?.startsWith("/") ? v : null;
	} catch {
		return null;
	}
}

function writeLastTab(path: string) {
	try {
		localStorage.setItem(LAST_TAB_KEY, path);
	} catch {
		// storage unavailable — skip persistence
	}
}

function isKnownTab(path: string | null): path is string {
	return Boolean(path) && REGISTRY.some((e) => e.path === path);
}

/**
 * Applies the `appearance.on_launch` setting after the first render
 * (design doc S8 P1):
 *
 * - "new_generate" — stay on "/" (default route); no navigation.
 * - "library"      — navigate to "/library".
 * - "last_tab"     — navigate to the last visited registry tab (persisted
 *                    in localStorage on every route change); falls back to
 *                    "/" when there is nothing to restore.
 *
 * Mount once at the top of the app (RootLayout). The navigation happens
 * after first paint — the 44–48px shell still shows immediately; a
 * <300 ms splash is separate startup work (S8 P0, Tauri window config).
 */
export function useStartupRoute() {
	const navigate = useNavigate();
	const routerState = useRouterState();
	const launchMode =
		(useSettingsStore((s) => s.values["appearance.on_launch"]) as
			| string
			| undefined) ?? "last_tab";
	const applied = useRef(false);

	// Apply the launch choice exactly once per app mount.
	useEffect(() => {
		if (applied.current) {
			return;
		}
		applied.current = true;
		if (launchMode === "library") {
			void navigate({ to: "/library" } as never);
			return;
		}
		if (launchMode === "last_tab") {
			const last = readLastTab();
			if (isKnownTab(last) && last !== "/") {
				// Router beforeLoad guard handles hidden tabs
				void navigate({ to: last } as never);
			}
		}
		// "new_generate": nothing to do — "/" is already the default route.
	}, [navigate, launchMode]);

	// Remember the last registry tab on every route change (skip "/" — it
	// is the fallback anyway, and persisting it is pointless).
	useEffect(() => {
		const path = routerState.location.pathname;
		if (isKnownTab(path) && path !== "/") {
			writeLastTab(path);
		}
	}, [routerState.location.pathname]);
}
