/**
 * React Query hooks for instrument pack CRUD operations.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export function useInstrumentPacks() {
	return useQuery({
		queryKey: ["instrument-packs"],
		queryFn: () => apiClient.listInstrumentPacks(),
	});
}

export function useUploadInstrumentPack() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ file, name }: { file: File; name?: string }) =>
			apiClient.uploadInstrumentPack(file, name),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["instrument-packs"] });
		},
	});
}

export function useDeleteInstrumentPack() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (packId: string) => apiClient.deleteInstrumentPack(packId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["instrument-packs"] });
		},
	});
}
