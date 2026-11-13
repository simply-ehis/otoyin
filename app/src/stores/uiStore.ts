import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_ACCENT } from "@/lib/design-system";
import {
	ALL_THEMES,
	PLAIN_THEMES,
	SPECIAL_THEMES,
	type Theme,
} from "@/lib/themes";
import { useSettingsStore } from "@/stores/settingsStore";

export { ALL_THEMES, PLAIN_THEMES, SPECIAL_THEMES, type Theme };

export type BackgroundPattern = "line-in-motion" | "waveform" | "mesh" | "none";
export const BACKGROUND_PATTERNS: readonly BackgroundPattern[] = [
	"line-in-motion",
	"waveform",
	"mesh",
	"none",
];
export const BACKGROUND_PATTERN_META: Record<
	BackgroundPattern,
	{ label: string; hint: string }
> = {
	"line-in-motion": {
		label: "Line in motion",
		hint: "Diagonal line-in-motion tile, all themes",
	},
	waveform: {
		label: "Waveform",
		hint: "Two-row audio waveform bars, all themes",
	},
	mesh: {
		label: "Mesh",
		hint: "Subtle dark blobs — designed for dark themes",
	},
	none: { label: "None", hint: "No background pattern" },
};

export const THEME_META: Record<
	Theme,
	{ label: string; accent: string; dark: boolean }
> = {
	system: { label: "System", accent: "#888888", dark: false },
	light: { label: "Light", accent: "#888888", dark: false },
	dark: { label: "Dark", accent: "#888888", dark: true },
	stripe: { label: "Stripe", accent: "#FFFFFF", dark: true },
};

// Draft state for the create voice profile form
export interface ProfileFormDraft {
	name: string;
	description: string;
	language: string;
	personality: string;
	referenceText: string;
	sampleMode: "upload" | "record" | "system";
	// Note: File objects can't be persisted, so we store metadata
	sampleFileName?: string;
	sampleFileType?: string;
	sampleFileData?: string; // Base64 encoded
}

interface UIStore {
	// Sidebar
	sidebarOpen: boolean;
	setSidebarOpen: (open: boolean) => void;
	sidebarWidth: number;
	setSidebarWidth: (width: number) => void;

	// Mobile drawer — open on small screens, overlaying content
	mobileDrawerOpen: boolean;
	setMobileDrawerOpen: (open: boolean) => void;

	// Assistant panel (right side) — resizable, content reflows beside it
	assistantWidth: number;
	setAssistantWidth: (width: number) => void;

	// Modals
	profileDialogOpen: boolean;
	setProfileDialogOpen: (open: boolean) => void;
	editingProfileId: string | null;
	setEditingProfileId: (id: string | null) => void;

	generationDialogOpen: boolean;
	setGenerationDialogOpen: (open: boolean) => void;

	// Selected profile for generation
	selectedProfileId: string | null;
	setSelectedProfileId: (id: string | null) => void;

	// Currently selected engine (synced from generation form)
	selectedEngine: string;
	setSelectedEngine: (engine: string) => void;

	// Last explicitly chosen generation language per engine. Explicit choice
	// beats profile defaults and survives engine switches + sessions.
	languageByEngine: Record<string, string>;
	setLanguageForEngine: (engine: string, language: string) => void;

	// Selected voice in Voices tab inspector
	selectedVoiceId: string | null;
	setSelectedVoiceId: (id: string | null) => void;

	// Profile form draft (for persisting create voice modal state)
	profileFormDraft: ProfileFormDraft | null;
	setProfileFormDraft: (draft: ProfileFormDraft | null) => void;

	// Theme
	theme: Theme;
	setTheme: (theme: Theme) => void;
	/** Accent preset id (see ACCENT_PRESETS in lib/design-system.ts). "rose" is the default. */
	accent: string;
	setAccent: (accent: string) => void;
	// Background pattern tile (independent of theme)
	backgroundPattern: BackgroundPattern;
	setBackgroundPattern: (pattern: BackgroundPattern) => void;

	// Mini-game overlay
	miniGameOpen: boolean;
	setMiniGameOpen: (open: boolean) => void;
	// Game registry selection (features/game/registry). Null = default game.
	openGameId: string | null;
	setOpenGameId: (id: string | null) => void;
}

const uiStore = create<UIStore>()(
	persist(
		(set) => ({
			sidebarOpen: true,
			setSidebarOpen: (open) => set({ sidebarOpen: open }),
			sidebarWidth: 240,
			setSidebarWidth: (width) => set({ sidebarWidth: width }),

			mobileDrawerOpen: false,
			setMobileDrawerOpen: (open) => set({ mobileDrawerOpen: open }),

			assistantWidth: 480,
			setAssistantWidth: (width) => set({ assistantWidth: width }),

			profileDialogOpen: false,
			setProfileDialogOpen: (open) => set({ profileDialogOpen: open }),
			editingProfileId: null,
			setEditingProfileId: (id) => set({ editingProfileId: id }),

			generationDialogOpen: false,
			setGenerationDialogOpen: (open) => set({ generationDialogOpen: open }),

			selectedProfileId: null,
			setSelectedProfileId: (id) => set({ selectedProfileId: id }),

			selectedEngine: "",
			setSelectedEngine: (engine) => set({ selectedEngine: engine }),

			languageByEngine: {},
			setLanguageForEngine: (engine, language) =>
				set((state) => ({
					languageByEngine: { ...state.languageByEngine, [engine]: language },
				})),

			selectedVoiceId: null,
			setSelectedVoiceId: (id) => set({ selectedVoiceId: id }),

			profileFormDraft: null,
			setProfileFormDraft: (draft) => set({ profileFormDraft: draft }),

			theme:
				(useSettingsStore.getState().getSetting("theme") as Theme) ?? "system",
			setTheme: (theme) => {
				set({ theme });
				void useSettingsStore.getState().setSetting("theme", theme);
			},
			accent: DEFAULT_ACCENT,
			setAccent: (accent) => set({ accent }),
			backgroundPattern: "line-in-motion",
			setBackgroundPattern: (pattern) => set({ backgroundPattern: pattern }),

			miniGameOpen: false,
			setMiniGameOpen: (open) => set({ miniGameOpen: open }),
			openGameId: null,
			setOpenGameId: (id) => set({ openGameId: id }),
		}),
		{
			name: "otoyin-ui",
			version: 3,
			migrate: (persisted, version) => {
				const state = (persisted ?? {}) as Record<string, unknown> & {
					theme?: string;
					accentHue?: unknown;
				};
				const next: Record<string, unknown> = { ...state };
				// v3 drops the unused hue slider; accent is a named preset.
				delete next.accentHue;
				if (version < 3) {
					next.accent = DEFAULT_ACCENT;
				} else if (typeof next.accent !== "string") {
					next.accent = DEFAULT_ACCENT;
				}
				// Theme safety: drop themes that no longer exist (di-stefano
				// was retired 2026-11 — map it to system, not to a broken value).
				if (
					typeof next.theme !== "string" ||
					!ALL_THEMES.includes(next.theme as Theme)
				) {
					next.theme = "system";
				}
				// Background pattern safety.
				if (
					typeof next.backgroundPattern !== "string" ||
					!BACKGROUND_PATTERNS.includes(
						next.backgroundPattern as BackgroundPattern,
					)
				) {
					next.backgroundPattern = "line-in-motion";
				}
				return next as unknown as UIStore;
			},
			partialize: (state) => ({
				theme: state.theme,
				selectedProfileId: state.selectedProfileId,
				accent: state.accent,
				backgroundPattern: state.backgroundPattern,
				sidebarOpen: state.sidebarOpen,
				sidebarWidth: state.sidebarWidth,
				assistantWidth: state.assistantWidth,
				languageByEngine: state.languageByEngine,
			}),
		},
	),
);

// Sync theme when settingsStore finishes loading. Only applies a REAL
// persisted value from settings.json — otherwise keeps whatever uiStore
// rehydrated from its own persist ("otoyin-ui"), which is the only channel
// that works outside Tauri (readSettings returns {} without it).
// Settings → uiStore sync. Fires on any values write, not just the initial
// load, so changing the schema "Theme" setting takes effect live (and survives
// reloads). Early-outs when the theme didn't actually change to avoid loops.
useSettingsStore.subscribe((state, prevState) => {
	const persisted = (state.values as Record<string, unknown>)?.theme;
	if (
		state.loaded &&
		typeof persisted === "string" &&
		ALL_THEMES.includes(persisted as Theme) &&
		// No-op when nothing changed — avoids a settings.json rewrite on every
		// boot (uiStore also persists theme via its own partialize).
		uiStore.getState().theme !== persisted &&
		(state.values as Record<string, unknown>)?.theme !==
			(prevState.values as Record<string, unknown>)?.theme
	) {
		uiStore.getState().setTheme(persisted as Theme);
	}
});

export const useUIStore = uiStore;
