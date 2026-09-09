import { create } from "zustand";
import { persist } from "zustand/middleware";

/** All navigable tab paths in the app. */
export const ALL_TAB_PATHS = [
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
	"/workspace",
	"/sounds",
	"/library",
	"/store",
	"/settings",
] as const;

export type TabPath = (typeof ALL_TAB_PATHS)[number];

/** Use-case profiles — each maps to a set of visible tabs. */
export const USE_CASE_PROFILES = {
	tts: {
		label: "TTS / Voice generation",
		description: "Generate speech from text with AI voices",
		tabs: ["/", "/voices", "/effects", "/store"] as TabPath[],
	},
	podcast: {
		label: "Podcasting / Dialogue",
		description: "Multi-speaker conversations and dialogue",
		tabs: ["/", "/stories", "/captures", "/workspace"] as TabPath[],
	},
	audiobook: {
		label: "Audiobooks",
		description: "Full-length narrated audiobooks",
		tabs: ["/audiobooks", "/", "/voices", "/library"] as TabPath[],
	},
	music: {
		label: "Music production",
		description: "Instruments, beats, and songwriting",
		tabs: [
			"/audio-studio",
			"/instruments",
			"/launcher",
			"/songwriter",
		] as TabPath[],
	},
	voiceChanger: {
		label: "Voice changer",
		description: "Real-time voice conversion and capture",
		tabs: ["/workspace", "/captures"] as TabPath[],
	},
} as const;

export type UseCaseKey = keyof typeof USE_CASE_PROFILES;

interface WorkspaceState {
	/** Tabs currently visible in the sidebar. null = show all (never onboarded). */
	visibleTabs: TabPath[] | null;
	/** Selected use-case keys from onboarding. */
	selectedUseCases: UseCaseKey[];
	/** Whether onboarding wizard has been completed. */
	onboarded: boolean;

	/** Set visible tabs explicitly. */
	setVisibleTabs: (tabs: TabPath[]) => void;
	/** Toggle a single tab's visibility. */
	toggleTab: (tab: TabPath) => void;
	/** Apply use-case profiles: union of all selected profiles' tabs. */
	applyUseCases: (cases: UseCaseKey[]) => void;
	/** Reset to all tabs visible. */
	resetToAll: () => void;
	/** Mark onboarding as complete. */
	markOnboarded: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
	persist(
		(set) => ({
			visibleTabs: null,
			selectedUseCases: [],
			onboarded: false,

			setVisibleTabs: (tabs) => set({ visibleTabs: tabs }),

			toggleTab: (tab) =>
				set((state) => {
					const current = state.visibleTabs ?? [...ALL_TAB_PATHS];
					const next = current.includes(tab)
						? current.filter((t) => t !== tab)
						: [...current, tab];
					// If all tabs are visible, store null (default)
					const allVisible =
						next.length === ALL_TAB_PATHS.length &&
						ALL_TAB_PATHS.every((t) => next.includes(t));
					return { visibleTabs: allVisible ? null : next };
				}),

			applyUseCases: (cases) => {
				const tabSet = new Set<TabPath>();
				for (const c of cases) {
					const profile = USE_CASE_PROFILES[c];
					if (profile) {
						for (const t of profile.tabs) {
							tabSet.add(t);
						}
					}
				}
				// Always include settings
				tabSet.add("/settings");
				const tabs = [...tabSet];
				const allVisible =
					tabs.length === ALL_TAB_PATHS.length &&
					ALL_TAB_PATHS.every((t) => tabs.includes(t));
				set({
					selectedUseCases: cases,
					visibleTabs: allVisible ? null : tabs,
					onboarded: true,
				});
			},

			resetToAll: () =>
				set({ visibleTabs: null, selectedUseCases: [], onboarded: true }),

			markOnboarded: () => set({ onboarded: true }),
		}),
		{
			name: "otoyin-workspace",
		},
	),
);
