import { create } from "zustand";
import { persist } from "zustand/middleware";

interface OnboardingStore {
	/** Tab IDs the user has already seen an intro for (first entry only). */
	seenTabs: string[];
	markSeen: (tabId: string) => void;
	/** Clears all first-visit state (Settings → reset path, tests). */
	resetOnboarding: () => void;
}

/**
 * First-visit memory for per-tab intros. Persisted in localStorage so
 * "first entry only" survives restarts; keyed by stable tab id, not by
 * route text, so renames don't re-trigger.
 */
export const useOnboardingStore = create<OnboardingStore>()(
	persist(
		(set, get) => ({
			seenTabs: [],
			markSeen: (tabId: string) => {
				if (!get().seenTabs.includes(tabId)) {
					set({ seenTabs: [...get().seenTabs, tabId] });
				}
			},
			resetOnboarding: () => set({ seenTabs: [] }),
		}),
		{
			name: "otoyin-onboarding",
		},
	),
);
