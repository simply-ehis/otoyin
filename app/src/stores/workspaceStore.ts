import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ALWAYS_ON_PATHS, REGISTRY } from "@/lib/tabs/registry";

/**
 * Workspace (tab visibility) store.
 *
 * Single source of truth for which tabs are visible in the sidebar. Hidden
 * tabs keep their data, models, and settings — they're just filtered out of
 * the nav and their routes redirect to Settings → Workspace.
 *
 * `hiddenTabs` is the canonical list. `visibleTabs` is kept in sync for
 * legacy call-sites (existing tests + WorkspacePage): null = all visible.
 */
export const ALL_TAB_PATHS = REGISTRY.map((t) => t.path);

export type TabPath = string;

/** Use-case profiles — each maps to the tabs that should stay visible. */
export const USE_CASE_PROFILES = {
	tts: {
		label: "TTS / Voice generation",
		description: "Generate speech from text with AI voices",
		tabs: [
			"/",
			"/voices",
			"/voice-converter",
			"/sounds",
			"/songwriter",
		] as TabPath[],
		spaceEstimate: "~400 MB",
	},
	podcast: {
		label: "Podcasting / Dialogue",
		description: "Multi-speaker conversations and dialogue",
		tabs: [
			"/",
			"/stories",
			"/captures",
			"/diarize",
			"/voices",
			"/audio-enhance",
			"/noise-reduction",
		] as TabPath[],
		spaceEstimate: "~700 MB",
	},
	audiobook: {
		label: "Audiobooks",
		description: "Full-length narrated audiobooks",
		tabs: [
			"/audiobooks",
			"/",
			"/voices",
			"/library",
			"/noise-reduction",
			"/audio-enhance",
		] as TabPath[],
		spaceEstimate: "~300 MB",
	},
	music: {
		label: "Music production",
		description: "Instruments, beats, and songwriting",
		tabs: [
			"/music-gen",
			"/songwriter",
			"/instruments",
			"/audio-studio",
			"/mixer",
			"/launcher",
		] as TabPath[],
		spaceEstimate: "~1.2 GB",
	},
	voiceChanger: {
		label: "Voice changer",
		description: "Real-time voice conversion and capture",
		tabs: [
			"/voice-converter",
			"/captures",
			"/vocal-isolation",
			"/noise-reduction",
			"/audio-enhance",
		] as TabPath[],
		spaceEstimate: "~600 MB",
	},
} as const;

export type UseCaseKey = keyof typeof USE_CASE_PROFILES;

function toVisible(hiddenTabs: string[]): string[] | null {
	if (hiddenTabs.length === 0) {
		return null;
	}
	return ALL_TAB_PATHS.filter((p) => !hiddenTabs.includes(p));
}

/** Refuse to hide always-on tabs (/library, /store, /settings). */
function pruneAlwaysOn(paths: string[]): string[] {
	return paths.filter((p) => !ALWAYS_ON_PATHS.includes(p));
}

interface WorkspaceState {
	/** Paths of hidden tabs (canonical). */
	hiddenTabs: string[];
	/** Derived for legacy call-sites: null = all visible. */
	visibleTabs: string[] | null;
	/** Selected use-case keys from onboarding. */
	selectedUseCases: UseCaseKey[];
	/** Whether the onboarding wizard has been completed. */
	onboarded: boolean;

	/** Show a tab again. */
	showTab: (path: string) => void;
	/** Hide a tab (no-op for always-on tabs). */
	hideTab: (path: string) => void;
	/** Set a tab's hidden state directly. */
	setTabHidden: (path: string, hidden: boolean) => void;
	/** Toggle a tab's visibility (no-op for always-on tabs). */
	toggleTab: (path: string) => void;
	/** Show everything again. */
	showAllTabs: () => void;
	/** Apply use-case profiles: hidden = everything except the union + always-on. */
	applyUseCases: (cases: UseCaseKey[]) => void;
	/** Reset to all tabs visible + clear the use-case selection. */
	resetToAll: () => void;
	/** Mark the onboarding wizard as complete. */
	markOnboarded: () => void;
	/** Reopen the welcome tour (used by Settings → Workspace replay). */
	reopenOnboarding: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
	persist(
		(set) => ({
			hiddenTabs: [],
			visibleTabs: null,
			selectedUseCases: [],
			onboarded: false,

			showTab: (path) =>
				set((state) => {
					const hiddenTabs = state.hiddenTabs.filter((p) => p !== path);
					return { hiddenTabs, visibleTabs: toVisible(hiddenTabs) };
				}),

			hideTab: (path) =>
				set((state) => {
					if (
						ALWAYS_ON_PATHS.includes(path) ||
						state.hiddenTabs.includes(path)
					) {
						return state;
					}
					const hiddenTabs = [...state.hiddenTabs, path];
					return { hiddenTabs, visibleTabs: toVisible(hiddenTabs) };
				}),

			setTabHidden: (path, hidden) => {
				if (hidden) {
					set((state) => {
						if (
							ALWAYS_ON_PATHS.includes(path) ||
							state.hiddenTabs.includes(path)
						) {
							return state;
						}
						const hiddenTabs = [...state.hiddenTabs, path];
						return { hiddenTabs, visibleTabs: toVisible(hiddenTabs) };
					});
				} else {
					set((state) => {
						const hiddenTabs = state.hiddenTabs.filter((p) => p !== path);
						return { hiddenTabs, visibleTabs: toVisible(hiddenTabs) };
					});
				}
			},

			toggleTab: (path) =>
				set((state) => {
					if (ALWAYS_ON_PATHS.includes(path)) {
						return state;
					}
					const hidden = state.hiddenTabs.includes(path);
					const hiddenTabs = hidden
						? state.hiddenTabs.filter((p) => p !== path)
						: [...state.hiddenTabs, path];
					return { hiddenTabs, visibleTabs: toVisible(hiddenTabs) };
				}),

			showAllTabs: () => set({ hiddenTabs: [], visibleTabs: null }),

			applyUseCases: (cases) => {
				const keep = new Set<string>(ALWAYS_ON_PATHS);
				for (const key of cases) {
					const profile = USE_CASE_PROFILES[key];
					if (profile) {
						for (const tab of profile.tabs) {
							keep.add(tab);
						}
					}
				}
				const hiddenTabs = ALL_TAB_PATHS.filter((p) => !keep.has(p));
				set({
					selectedUseCases: cases,
					hiddenTabs,
					visibleTabs: toVisible(hiddenTabs),
					onboarded: true,
				});
			},

			resetToAll: () =>
				set({
					hiddenTabs: [],
					visibleTabs: null,
					selectedUseCases: [],
					onboarded: true,
				}),

			markOnboarded: () => set({ onboarded: true }),

			reopenOnboarding: () => set({ onboarded: false }),
		}),
		{
			name: "otoyin-workspace",
			version: 2,
			migrate: (state, version) => {
				// v1 stored visibleTabs only, computed against its own 17-tab list.
				// Tabs introduced later must never be auto-hidden by migration.
				const V1_TAB_PATHS = [
					"/",
					"/audio-studio",
					"/stories",
					"/songwriter",
					"/launcher",
					"/instruments",
					"/audiobooks",
					"/voices",
					"/captures",
					"/dubbing",
					"/effects",
					"/sounds",
					"/translate",
					"/library",
					"/store",
					"/settings",
				];
				const persisted = state as Partial<WorkspaceState> & {
					visibleTabs?: string[] | null;
				};
				if (version >= 2) {
					return state as WorkspaceState;
				}
				const hiddenTabs = pruneAlwaysOn(
					persisted?.visibleTabs === null ||
						persisted?.visibleTabs === undefined
						? []
						: V1_TAB_PATHS.filter((p) => !persisted?.visibleTabs?.includes(p)),
				);
				return {
					hiddenTabs,
					visibleTabs: toVisible(hiddenTabs),
					onboarded: persisted?.onboarded ?? true,
					selectedUseCases: persisted?.selectedUseCases ?? [],
				};
			},
		},
	),
);
