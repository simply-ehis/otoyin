import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModelStatus } from "@/lib/api/types";
import { useModelMutationHandlers } from "./useModelMutations";
import { useModelQueries } from "./useModelQueries";
import {
	buildDownloadProgressMap,
	buildErroredDownloads,
	useModelDerived,
} from "./useModelSections";

interface MigrationProgress {
	current: number;
	total: number;
	progress: number;
	filename?: string;
	status: string;
}

interface ModelToDelete {
	name: string;
	displayName: string;
	sizeMb?: number;
}

export function useModelBaseState() {
	const [migrating, setMigrating] = useState(false);
	const [migrationProgress, setMigrationProgress] =
		useState<MigrationProgress | null>(null);
	const [pendingMigrateDir, setPendingMigrateDir] = useState<string | null>(
		null,
	);
	const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
	const [downloadingDisplayName, setDownloadingDisplayName] = useState<
		string | null
	>(null);
	const [consoleOpen, setConsoleOpen] = useState(false);
	const [dismissedErrors, setDismissedErrors] = useState<Set<string>>(
		new Set(),
	);
	const [localErrors, setLocalErrors] = useState<Map<string, string>>(
		new Map(),
	);
	const [selectedModel, setSelectedModel] = useState<ModelStatus | null>(null);
	const [detailOpen, setDetailOpen] = useState(false);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [modelToDelete, setModelToDelete] = useState<ModelToDelete | null>(
		null,
	);

	return {
		migrating,
		setMigrating,
		migrationProgress,
		setMigrationProgress,
		pendingMigrateDir,
		setPendingMigrateDir,
		downloadingModel,
		setDownloadingModel,
		downloadingDisplayName,
		setDownloadingDisplayName,
		consoleOpen,
		setConsoleOpen,
		dismissedErrors,
		setDismissedErrors,
		localErrors,
		setLocalErrors,
		selectedModel,
		setSelectedModel,
		detailOpen,
		setDetailOpen,
		deleteDialogOpen,
		setDeleteDialogOpen,
		modelToDelete,
		setModelToDelete,
	};
}

export function useModelState() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const base = useModelBaseState();

	const {
		modelStatus,
		isLoading,
		cacheDir,
		activeTasks,
		hfModelInfo,
		hfLoading,
		catalog,
		entitlements,
	} = useModelQueries({
		detailOpen: base.detailOpen,
		selectedRepoId: base.selectedModel?.hf_repo_id,
	});

	const erroredDownloads = buildErroredDownloads(
		activeTasks,
		base.dismissedErrors,
		base.localErrors,
	);
	const errorCount = erroredDownloads.size;
	const downloadProgressMap = buildDownloadProgressMap(activeTasks);

	const formatSize = (sizeMb?: number): string =>
		!sizeMb
			? t("models.unknownSize")
			: sizeMb < 1024
				? `${sizeMb.toFixed(1)} MB`
				: `${(sizeMb / 1024).toFixed(2)} GB`;

	const openModelDetail = (model: ModelStatus) => {
		base.setSelectedModel(model);
		base.setDetailOpen(true);
	};

	const {
		sections,
		getModelStateForList,
		selectedState,
		selectedError,
		freshSelectedModel,
		license,
	} = useModelDerived({
		modelStatus,
		selectedModel: base.selectedModel,
		downloadingModel: base.downloadingModel,
		erroredDownloads,
		dismissedErrors: base.dismissedErrors,
		hfModelInfo,
	});

	return {
		t,
		queryClient,
		...base,
		modelStatus,
		isLoading,
		cacheDir,
		activeTasks,
		hfModelInfo,
		hfLoading,
		catalog,
		entitlements,
		erroredDownloads,
		errorCount,
		downloadProgressMap,
		formatSize,
		openModelDetail,
		sections,
		getModelState: getModelStateForList,
		selectedState,
		selectedError,
		freshSelectedModel,
		license,
	};
}

export function useModelManagement() {
	const state = useModelState();
	const {
		t,
		queryClient,
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
		modelStatus,
	} = state;

	const {
		handleDownload,
		handleCancel,
		cancelMutation,
		clearAllMutation,
		deleteMutation,
		unloadMutation,
	} = useModelMutationHandlers({
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
	});

	return {
		...state,
		handleDownload,
		handleCancel,
		cancelMutation,
		clearAllMutation,
		deleteMutation,
		unloadMutation,
	};
}
