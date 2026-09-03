import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ContentState {
	dismissedAnnouncements: string[];
	seenWhatsNewVersions: string[];
	claimedOffers: string[];
	dismissAnnouncement: (id: string) => void;
	markWhatsNewSeen: (version: string) => void;
	claimOffer: (id: string) => void;
}

export const useContentStore = create<ContentState>()(
	persist(
		(set) => ({
			dismissedAnnouncements: [],
			seenWhatsNewVersions: [],
			claimedOffers: [],
			dismissAnnouncement: (id) =>
				set((s) => ({
					dismissedAnnouncements: [
						...new Set([...s.dismissedAnnouncements, id]),
					],
				})),
			markWhatsNewSeen: (version) =>
				set((s) => ({
					seenWhatsNewVersions: [
						...new Set([...s.seenWhatsNewVersions, version]),
					],
				})),
			claimOffer: (id) =>
				set((s) => ({
					claimedOffers: [...new Set([...s.claimedOffers, id])],
				})),
		}),
		{ name: "Otoyin-content" },
	),
);
