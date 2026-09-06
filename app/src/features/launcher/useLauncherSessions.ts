/**
 * React Query hooks for launcher session CRUD (clip grid + scenes).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { LauncherSessionCreate } from "@/lib/api/types";

export function useLauncherSessions() {
	return useQuery({
		queryKey: ["launcher-sessions"],
		queryFn: () => apiClient.listLauncherSessions(),
	});
}

export function useLauncherSession(sessionId: string | null) {
	return useQuery({
		queryKey: ["launcher-sessions", sessionId],
		queryFn: () => {
			if (!sessionId) {
				throw new Error("No session ID");
			}
			return apiClient.getLauncherSession(sessionId);
		},
		enabled: !!sessionId,
	});
}

export function useCreateLauncherSession() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: LauncherSessionCreate) =>
			apiClient.createLauncherSession(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["launcher-sessions"] });
		},
	});
}

export function useUpdateLauncherSession() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			sessionId,
			data,
		}: {
			sessionId: string;
			data: LauncherSessionCreate;
		}) => apiClient.updateLauncherSession(sessionId, data),
		onSuccess: (_result, variables) => {
			queryClient.invalidateQueries({ queryKey: ["launcher-sessions"] });
			queryClient.invalidateQueries({
				queryKey: ["launcher-sessions", variables.sessionId],
			});
		},
	});
}

export function useDeleteLauncherSession() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (sessionId: string) =>
			apiClient.deleteLauncherSession(sessionId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["launcher-sessions"] });
		},
	});
}
