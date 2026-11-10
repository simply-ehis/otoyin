import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useSettingsStore } from "@/stores/settingsStore";

export type BackgroundPattern = "line-in-motion" | "waveform" | "none";
export const BACKGROUND_PATTERNS: readonly BackgroundPattern[] = [
	"line-in-motion",
	"waveform",
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
	none: { label: "None", hint: "No background pattern" },
};

export type Theme =
	| "light"
	| "dark"
	| "system"
	| "di-stefano"
	| "stripe"
	| "coastal-light"
	| "mesh-dark";

export const PLAIN_THEMES: Theme[] = ["system", "light", "dark"];
export const SPECIAL_THEMES: Theme[] = [
	"di-stefano",
	"stripe",
	"coastal-light",
	"mesh-dark",
];
export const ALL_THEMES: Theme[] = [...PLAIN_THEMES, ...SPECIAL_THEMES];

export const THEME_META: Record<
	Theme,
	{ label: string; accent: string; dark: boolean }
> = {
	system: { label: "System", accent: "#888888", dark: false },
	light: { label: "Light", accent: "#888888", dark: false },
	dark: { label: "Dark", accent: "#888888", dark: true },
	"di-stefano": { label: "Otoyin", accent: "#C87864", dark: true },
	stripe: { label: "Stripe", accent: "#FFFFFF", dark: true },
	"coastal-light": { label: "Coastal Light", accent: "#E8836A", dark: false },
	"mesh-dark": { label: "Mesh Dark", accent: "#A0A8B4", dark: true },
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
	accentHue: number | null; // null = use theme default; 0-360 = custom hue
	setAccentHue: (hue: number | null) => void;
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
			sidebarWidth: 220,
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
			accentHue: null,
			setAccentHue: (hue) => set({ accentHue: hue }),
			backgroundPattern: "line-in-motion",
			setBackgroundPattern: (pattern) => set({ backgroundPattern: pattern }),

			miniGameOpen: false,
			setMiniGameOpen: (open) => set({ miniGameOpen: open }),
			openGameId: null,
			setOpenGameId: (id) => set({ openGameId: id }),
		}),
		{
			name: "otoyin-ui",
			partialize: (state) => ({
				selectedProfileId: state.selectedProfileId,
				accentHue: state.accentHue,
				backgroundPattern: state.backgroundPattern,
				sidebarOpen: state.sidebarOpen,
				sidebarWidth: state.sidebarWidth,
				assistantWidth: state.assistantWidth,
				languageByEngine: state.languageByEngine,
			}),
		},
	),
);

// Sync theme when settingsStore finishes loading so the persisted value wins
// over the "system" default used during uiStore initialization.
useSettingsStore.subscribe((state, prevState) => {
	if (!prevState.loaded && state.loaded) {
		const theme = useSettingsStore.getState().getSetting("theme") as
			| Theme
			| undefined;
		if (theme) {
			uiStore.getState().setTheme(theme);
		}
	}
});

export const useUIStore = uiStore;
