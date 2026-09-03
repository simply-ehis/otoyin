import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type {
	Announcement,
	Offer,
	SupportRequestPayload,
	SupportResponse,
	WhatsNewEntry,
} from "@/lib/api/types";

export function useWhatsNew() {
	return useQuery<WhatsNewEntry[]>({
		queryKey: ["content", "whats-new"],
		queryFn: () => apiClient.getWhatsNew(),
	});
}

export function useAnnouncements() {
	return useQuery<Announcement[]>({
		queryKey: ["content", "announcements"],
		queryFn: () => apiClient.getAnnouncements(),
	});
}

export function useOffers() {
	return useQuery<Offer[]>({
		queryKey: ["content", "offers"],
		queryFn: () => apiClient.getOffers(),
	});
}

export function useSupportRequest() {
	const queryClient = useQueryClient();
	return useMutation<SupportResponse, Error, SupportRequestPayload>({
		mutationFn: (payload) => apiClient.postSupportRequest(payload),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["content"] });
		},
	});
}
