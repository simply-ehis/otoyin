import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { fetchHuggingFaceModelInfo } from "./modelUtils";

interface UseModelQueriesArgs {
	detailOpen: boolean;
	selectedRepoId?: string;
}

export function useModelQueries({
	detailOpen,
	selectedRepoId,
}: UseModelQueriesArgs) {
	const { data: modelStatus, isLoading } = useQuery({
		queryKey: ["modelStatus"],
		queryFn: async () => {
			const result = await apiClient.getModelStatus();
			return result;
		},
		refetchInterval: 30_000,
	});

	const { data: cacheDir } = useQuery({
		queryKey: ["modelsCacheDir"],
		queryFn: () => apiClient.getModelsCacheDir(),
		staleTime: 1000 * 60 * 5,
	});

	const { data: activeTasks } = useQuery({
		queryKey: ["activeTasks"],
		queryFn: () => apiClient.getActiveTasks(),
		refetchInterval: (query) => {
			const data = query.state.data;
			const hasActive = data?.downloads.some((d) => d.status === "downloading");
			return hasActive ? 2000 : 30_000;
		},
	});

	const { data: hfModelInfo, isLoading: hfLoading } = useQuery({
		queryKey: ["hfModelInfo", selectedRepoId],
		queryFn: () => fetchHuggingFaceModelInfo(selectedRepoId as string),
		enabled: detailOpen && !!selectedRepoId,
		staleTime: 1000 * 60 * 30,
		retry: 1,
	});

	// Marketplace catalog — identifies paid models and prices
	const { data: catalog } = useQuery({
		queryKey: ["marketplace", "catalog"],
		queryFn: () => apiClient.getCatalog(),
		staleTime: 1000 * 60 * 10,
		retry: 1,
	});

	// User entitlements — which paid models the user has licensed
	const { data: entitlements } = useQuery({
		queryKey: ["marketplace", "entitlements"],
		queryFn: () => apiClient.getEntitlements(),
		staleTime: 1000 * 60 * 5,
		retry: 1,
	});

	return {
		modelStatus,
		isLoading,
		cacheDir,
		activeTasks,
		hfModelInfo,
		hfLoading,
		catalog,
		entitlements,
	};
}
