import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { SongDraftCreate, SongDraftResponse } from "@/lib/api/types";

export function useSongDrafts() {
	return useQuery({
		queryKey: ["song-drafts"],
		queryFn: () => apiClient.listSongDrafts(),
		staleTime: 30_000,
	});
}

export function useSongDraft(draftId: string | null) {
	return useQuery({
		queryKey: ["song-drafts", draftId],
		queryFn: () => {
			if (!draftId) {
				throw new Error("draftId is required");
			}
			return apiClient.getSongDraft(draftId);
		},
		enabled: !!draftId,
	});
}

function invalidateDrafts(
	queryClient: ReturnType<typeof useQueryClient>,
	draftId?: string,
) {
	void queryClient.invalidateQueries({ queryKey: ["song-drafts"] });
	if (draftId) {
		void queryClient.invalidateQueries({ queryKey: ["song-drafts", draftId] });
	}
}

export function useCreateSongDraft() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: SongDraftCreate) => apiClient.createSongDraft(data),
		onSuccess: (created: SongDraftResponse) =>
			invalidateDrafts(queryClient, created.id),
	});
}

export function useUpdateSongDraft() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			draftId,
			data,
		}: {
			draftId: string;
			data: SongDraftCreate;
		}) => apiClient.updateSongDraft(draftId, data),
		onSuccess: (_, variables) =>
			invalidateDrafts(queryClient, variables.draftId),
	});
}

export function useDeleteSongDraft() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (draftId: string) => apiClient.deleteSongDraft(draftId),
		onSuccess: () => invalidateDrafts(queryClient),
	});
}
