import type { UseMutationResult, useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import type { Dispatch, SetStateAction } from "react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import type { ModelStatus } from "@/lib/api/types";
import { useModelDownloadToast } from "@/lib/hooks/useModelDownloadToast";

interface ModelToDelete {
	name: string;
	displayName: string;
	sizeMb?: number;
}

export function useDeleteMutation(
	queryClient: ReturnType<typeof useQueryClient>,
	modelToDelete: ModelToDelete | null,
	setDeleteDialogOpen: (v: boolean) => void,
	setModelToDelete: (v: ModelToDelete | null) => void,
	setDetailOpen: (v: boolean) => void,
	setSelectedModel: (v: ModelStatus | null) => void,
) {
	const { t } = useTranslation();
	const { toast } = useToast();

	return useMutation({
		mutationFn: async (modelName: string) => {
			const result = await apiClient.deleteModel(modelName);
			return result;
		},
		onSuccess: async () => {
			toast({
				title: t("models.toast.deleted"),
				description: t("models.toast.deletedDescription", {
					name: modelToDelete?.displayName || t("models.defaultName"),
				}),
			});
			setDeleteDialogOpen(false);
			setModelToDelete(null);
			setDetailOpen(false);
			setSelectedModel(null);
			await queryClient.invalidateQueries({
				queryKey: ["modelStatus"],
				refetchType: "all",
			});
			await queryClient.refetchQueries({ queryKey: ["modelStatus"] });
		},
		onError: (error: Error) => {
			toast({
				title: t("models.toast.deleteFailed"),
				description: error.message,
				variant: "destructive",
			});
		},
	});
}

export function useUnloadMutation(
	queryClient: ReturnType<typeof useQueryClient>,
) {
	const { t } = useTranslation();
	const { toast } = useToast();

	return useMutation({
		mutationFn: async (modelName: string) => {
			return await apiClient.unloadModel(modelName);
		},
		onSuccess: async (_data: unknown, modelName: string) => {
			toast({
				title: t("models.toast.unloaded"),
				description: t("models.toast.unloadedDescription", { name: modelName }),
			});
			await queryClient.invalidateQueries({
				queryKey: ["modelStatus"],
				refetchType: "all",
			});
			await queryClient.refetchQueries({ queryKey: ["modelStatus"] });
		},
		onError: (error: Error) => {
			toast({
				title: t("models.toast.unloadFailed"),
				description: error.message,
				variant: "destructive",
			});
		},
	});
}

export function useClearAllMutation(
	queryClient: ReturnType<typeof useQueryClient>,
	setDismissedErrors: Dispatch<SetStateAction<Set<string>>>,
	setLocalErrors: Dispatch<SetStateAction<Map<string, string>>>,
	setDownloadingModel: (v: string | null) => void,
	setDownloadingDisplayName: (v: string | null) => void,
) {
	const { t } = useTranslation();
	const { toast } = useToast();

	return useMutation({
		mutationFn: () => apiClient.clearAllTasks(),
		onSuccess: async () => {
			setDismissedErrors(new Set());
			setLocalErrors(new Map());
			setDownloadingModel(null);
			setDownloadingDisplayName(null);
			await queryClient.invalidateQueries({
				queryKey: ["modelStatus"],
				refetchType: "all",
			});
			await queryClient.invalidateQueries({
				queryKey: ["activeTasks"],
				refetchType: "all",
			});
		},
		onError: (error: Error) => {
			toast({
				title: t("models.toast.clearFailed", "Failed to clear tasks"),
				description: error.message,
				variant: "destructive",
			});
		},
	});
}

interface DownloadMutationsArgs {
	queryClient: ReturnType<typeof useQueryClient>;
	t: TFunction;
	modelStatus?: { models: ModelStatus[] };
	downloadingModel: string | null;
	downloadingDisplayName: string | null;
	dismissedErrors: Set<string>;
	localErrors: Map<string, string>;
	setDownloadingModel: (v: string | null) => void;
	setDownloadingDisplayName: (v: string | null) => void;
	setDismissedErrors: Dispatch<SetStateAction<Set<string>>>;
	setLocalErrors: Dispatch<SetStateAction<Map<string, string>>>;
}

interface DownloadMutationsResult {
	handleDownload: (modelName: string) => Promise<void>;
	cancelMutation: UseMutationResult<unknown, unknown, string, unknown>;
	handleCancel: (modelName: string) => void;
}

export function useDownloadMutations({
	queryClient,
	t,
	downloadingModel,
	downloadingDisplayName,
	dismissedErrors,
	localErrors,
	setDownloadingModel,
	setDownloadingDisplayName,
	setDismissedErrors,
	setLocalErrors,
}: DownloadMutationsArgs): DownloadMutationsResult {
	const { toast } = useToast();

	const cancelMutation = useMutation({
		mutationFn: (modelName: string) => apiClient.cancelDownload(modelName),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["modelStatus"],
				refetchType: "all",
			});
			await queryClient.invalidateQueries({
				queryKey: ["activeTasks"],
				refetchType: "all",
			});
		},
	});

	const handleDownload = async (_modelName: string) => {
		// All downloads routed through the Store — navigate there instead.
		window.location.hash = "#/store";
	};

	const handleCancel = (modelName: string) => {
		const prevDismissed = dismissedErrors;
		const prevLocalErrors = localErrors;
		const prevDownloadingModel = downloadingModel;
		const prevDownloadingDisplayName = downloadingDisplayName;

		setDismissedErrors((prev) => new Set(prev).add(modelName));
		setLocalErrors((prev) => {
			const next = new Map(prev);
			next.delete(modelName);
			return next;
		});
		if (downloadingModel === modelName) {
			setDownloadingModel(null);
			setDownloadingDisplayName(null);
		}

		cancelMutation.mutate(modelName, {
			onError: () => {
				setDismissedErrors(() => prevDismissed);
				setLocalErrors(() => prevLocalErrors);
				setDownloadingModel(prevDownloadingModel);
				setDownloadingDisplayName(prevDownloadingDisplayName);
				toast({
					title: t("models.toast.cancelFailed"),
					description: t("models.toast.cancelFailedDescription"),
					variant: "destructive",
				});
			},
		});
	};

	return { handleDownload, cancelMutation, handleCancel };
}

interface MutationHandlersArgs {
	queryClient: ReturnType<typeof useQueryClient>;
	t: TFunction;
	modelStatus?: { models: ModelStatus[] };
	downloadingModel: string | null;
	downloadingDisplayName: string | null;
	dismissedErrors: Set<string>;
	localErrors: Map<string, string>;
	setDownloadingModel: (v: string | null) => void;
	setDownloadingDisplayName: (v: string | null) => void;
	setDismissedErrors: Dispatch<SetStateAction<Set<string>>>;
	setLocalErrors: Dispatch<SetStateAction<Map<string, string>>>;
	setConsoleOpen: (v: boolean) => void;
	modelToDelete: ModelToDelete | null;
	setDeleteDialogOpen: (v: boolean) => void;
	setModelToDelete: (v: ModelToDelete | null) => void;
	setDetailOpen: (v: boolean) => void;
	setSelectedModel: (v: ModelStatus | null) => void;
}

interface MutationHandlers {
	handleDownload: (modelName: string) => Promise<void>;
	handleCancel: (modelName: string) => void;
	cancelMutation: UseMutationResult<unknown, unknown, string, unknown>;
	clearAllMutation: UseMutationResult<unknown, unknown, void, unknown>;
	deleteMutation: UseMutationResult<unknown, unknown, string, unknown>;
	unloadMutation: UseMutationResult<unknown, unknown, string, unknown>;
}

export function useModelMutationHandlers({
	queryClient,
	t,
	modelStatus,
	downloadingModel,
	downloadingDisplayName,
	dismissedErrors,
	localErrors,
	setDownloadingModel,
	setDownloadingDisplayName,
	setDismissedErrors,
	setLocalErrors,
	setConsoleOpen,
	modelToDelete,
	setDeleteDialogOpen,
	setModelToDelete,
	setDetailOpen,
	setSelectedModel,
}: MutationHandlersArgs): MutationHandlers {
	const handleDownloadComplete = useCallback(() => {
		setDownloadingModel(null);
		setDownloadingDisplayName(null);
		queryClient.invalidateQueries({ queryKey: ["modelStatus"] });
		queryClient.invalidateQueries({ queryKey: ["activeTasks"] });
	}, [queryClient, setDownloadingDisplayName, setDownloadingModel]);

	const handleDownloadError = useCallback(
		(error: string) => {
			if (downloadingModel) {
				setLocalErrors((prev) => new Map(prev).set(downloadingModel, error));
				setConsoleOpen(true);
			}
			setDownloadingModel(null);
			setDownloadingDisplayName(null);
			queryClient.invalidateQueries({ queryKey: ["activeTasks"] });
		},
		[
			queryClient,
			downloadingModel,
			setConsoleOpen,
			setDownloadingDisplayName,
			setDownloadingModel,
			setLocalErrors,
		],
	);

	useModelDownloadToast({
		modelName: downloadingModel || "",
		displayName: downloadingDisplayName || "",
		enabled: !!downloadingModel && !!downloadingDisplayName,
		onComplete: handleDownloadComplete,
		onError: handleDownloadError,
	});

	const { handleDownload, cancelMutation, handleCancel } = useDownloadMutations(
		{
			queryClient,
			t,
			modelStatus,
			downloadingModel,
			downloadingDisplayName,
			dismissedErrors,
			localErrors,
			setDownloadingModel,
			setDownloadingDisplayName,
			setDismissedErrors,
			setLocalErrors,
		},
	);

	const clearAllMutation = useClearAllMutation(
		queryClient,
		setDismissedErrors,
		setLocalErrors,
		setDownloadingModel,
		setDownloadingDisplayName,
	);

	const deleteMutation = useDeleteMutation(
		queryClient,
		modelToDelete,
		setDeleteDialogOpen,
		setModelToDelete,
		setDetailOpen,
		setSelectedModel,
	);

	const unloadMutation = useUnloadMutation(queryClient);

	return {
		handleDownload,
		handleCancel,
		cancelMutation,
		clearAllMutation,
		deleteMutation,
		unloadMutation,
	};
}
