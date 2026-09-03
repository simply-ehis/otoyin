import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export const audiobookKeys = {
	all: ["audiobooks"] as const,
	list: () => [...audiobookKeys.all, "list"] as const,
	detail: (id: string) => [...audiobookKeys.all, "detail", id] as const,
};

export function useAudiobookList() {
	return useQuery({
		queryKey: audiobookKeys.list(),
		queryFn: () => apiClient.listAudiobooks(),
	});
}

export function useAudiobookDetail(id: string | null) {
	return useQuery({
		queryKey: audiobookKeys.detail(id ?? ""),
		queryFn: () => apiClient.getAudiobook(id as string),
		enabled: !!id,
	});
}

export function useDeleteAudiobook() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => apiClient.deleteAudiobook(id),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["audiobooks", "list"] });
		},
	});
}
