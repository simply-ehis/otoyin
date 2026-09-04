import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import type {
	EffectConfig,
	GenerationVersionResponse,
	HistoryResponse,
} from "@/lib/api/types";
import {
	ERR_DESC_DOWNLOAD_FAILED,
	ERR_DESC_GENERATION_FAILED,
	ERR_DESC_SAVE_FAILED,
	ERR_DESC_STORY_FAILED,
	ERR_TITLE_DOWNLOAD,
	ERR_TITLE_GENERATION,
	ERR_TITLE_SAVE,
	ERR_TITLE_STORY,
} from "@/lib/errorMessages";
import { showStudioErrorToast } from "@/lib/errors";
import {
	useClearFailedGenerations,
	useDeleteGeneration,
	useExportGeneration,
	useExportGenerationAudio,
	useHistory,
	useImportGeneration,
} from "@/lib/hooks/useHistory";
import { useGenerationStore } from "@/stores/generationStore";
import { usePlayerStore } from "@/stores/playerStore";

const LIMIT = 20;

export function useHistoryTable() {
	const { t } = useTranslation();
	const [page, setPage] = useState(0);
	const [allHistory, setAllHistory] = useState<HistoryResponse[]>([]);
	const [total, setTotal] = useState(0);
	const [isScrolled, setIsScrolled] = useState(false);
	const [importDialogOpen, setImportDialogOpen] = useState(false);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [generationToDelete, setGenerationToDelete] = useState<{
		id: string;
		name: string;
	} | null>(null);
	const [clearFailedDialogOpen, setClearFailedDialogOpen] = useState(false);
	const [effectsDialogOpen, setEffectsDialogOpen] = useState(false);
	const [effectsTargetId, setEffectsTargetId] = useState<string | null>(null);
	const [effectsTargetVersions, setEffectsTargetVersions] = useState<
		GenerationVersionResponse[]
	>([]);
	const [effectsSourceVersionId, setEffectsSourceVersionId] = useState<
		string | null
	>(null);
	const [effectsChain, setEffectsChain] = useState<EffectConfig[]>([]);
	const [applyingEffects, setApplyingEffects] = useState(false);
	const [expandedVersionsId, setExpandedVersionsId] = useState<string | null>(
		null,
	);
	const [expandedABId, setExpandedABId] = useState<string | null>(null);
	const [editDialogOpen, setEditDialogOpen] = useState(false);
	const [editTargetId, setEditTargetId] = useState<string | null>(null);

	const { toast } = useToast();
	const queryClient = useQueryClient();
	const fileInputRef = useRef<HTMLInputElement>(null);

	const {
		data: historyData,
		isLoading,
		isFetching,
	} = useHistory({
		limit: LIMIT,
		offset: page * LIMIT,
	});

	const deleteGeneration = useDeleteGeneration();
	const clearFailed = useClearFailedGenerations();
	const exportGeneration = useExportGeneration();
	const exportGenerationAudio = useExportGenerationAudio();
	const importGeneration = useImportGeneration();

	const cancelGeneration = useMutation({
		mutationFn: (generationId: string) =>
			apiClient.cancelGeneration(generationId),
		onSuccess: async (data) => {
			await queryClient.invalidateQueries({ queryKey: ["history"] });
			toast({ title: "Cancelling generation", description: data.message });
		},
		onError: (error) => {
			toast({
				title: "Cancel failed",
				description:
					error instanceof Error
						? error.message
						: "Could not cancel generation",
				variant: "destructive",
			});
		},
	});

	const addPendingGeneration = useGenerationStore(
		(state) => state.addPendingGeneration,
	);
	const setAudioWithAutoPlay = usePlayerStore(
		(state) => state.setAudioWithAutoPlay,
	);
	const restartCurrentAudio = usePlayerStore(
		(state) => state.restartCurrentAudio,
	);
	const currentAudioId = usePlayerStore((state) => state.audioId);
	const isPlaying = usePlayerStore((state) => state.isPlaying);
	const audioUrl = usePlayerStore((state) => state.audioUrl);
	const isPlayerVisible = !!audioUrl;

	// Accumulate history as pages arrive.
	useEffect(() => {
		if (!historyData?.items) {
			return;
		}
		setTotal(historyData.total);
		if (page === 0) {
			setAllHistory(historyData.items);
		} else {
			setAllHistory((prev) => {
				const existingIds = new Set(prev.map((item) => item.id));
				const newItems = historyData.items.filter(
					(item) => !existingIds.has(item.id),
				);
				return [...prev, ...newItems];
			});
		}
	}, [historyData, page]);

	// Reset list after delete/import/clear.
	useEffect(() => {
		if (
			deleteGeneration.isSuccess ||
			importGeneration.isSuccess ||
			clearFailed.isSuccess
		) {
			setPage(0);
			setAllHistory([]);
		}
	}, [
		deleteGeneration.isSuccess,
		importGeneration.isSuccess,
		clearFailed.isSuccess,
	]);

	// A generation finished — scroll back to the top to reveal it.
	const pendingCount = useGenerationStore(
		(state) => state.pendingGenerationIds.size,
	);
	const prevPendingCountRef = useRef(pendingCount);
	useEffect(() => {
		if (
			prevPendingCountRef.current > 0 &&
			pendingCount < prevPendingCountRef.current &&
			page !== 0
		) {
			setPage(0);
			setAllHistory([]);
		}
		prevPendingCountRef.current = pendingCount;
	}, [pendingCount, page]);

	const resetAndInvalidate = () => {
		queryClient.invalidateQueries({ queryKey: ["history"] });
	};

	const handlePlay = (audioId: string, text: string, profileId: string) => {
		if (currentAudioId === audioId) {
			restartCurrentAudio();
		} else {
			const url = apiClient.getAudioUrl(audioId);
			setAudioWithAutoPlay(url, audioId, profileId, text.substring(0, 50));
		}
	};

	const handleDownloadAudio = (generationId: string, text: string) => {
		exportGenerationAudio.mutate(
			{ generationId, text },
			{
				onError: () =>
					toast({
						title: ERR_TITLE_DOWNLOAD,
						description: ERR_DESC_DOWNLOAD_FAILED,
						variant: "destructive",
					}),
			},
		);
	};

	const handleExportPackage = (generationId: string, text: string) => {
		exportGeneration.mutate(
			{ generationId, text },
			{
				onError: (error) => showStudioErrorToast(error),
			},
		);
	};

	const handleDeleteClick = (generationId: string, profileName: string) => {
		setGenerationToDelete({ id: generationId, name: profileName });
		setDeleteDialogOpen(true);
	};

	const handleDeleteConfirm = () => {
		if (!generationToDelete) {
			return;
		}
		deleteGeneration.mutate(generationToDelete.id);
		setDeleteDialogOpen(false);
		setGenerationToDelete(null);
	};

	const handleRetry = async (generationId: string) => {
		try {
			const result = await apiClient.retryGeneration(generationId);
			addPendingGeneration(result.id);
			resetAndInvalidate();
		} catch {
			toast({
				title: ERR_TITLE_GENERATION,
				description: "Retry didn't work — try again or pick a different voice",
				variant: "destructive",
			});
		}
	};

	const handleRegenerate = async (generationId: string) => {
		try {
			await apiClient.regenerateGeneration(generationId);
			addPendingGeneration(generationId);
			resetAndInvalidate();
		} catch {
			toast({
				title: ERR_TITLE_GENERATION,
				description: ERR_DESC_GENERATION_FAILED,
				variant: "destructive",
			});
		}
	};

	const handleEditClick = (generationId: string) => {
		setEditTargetId(generationId);
		setEditDialogOpen(true);
	};

	const handleEditComplete = () => {
		// Keep the dialog open so the result player stays visible;
		// just refresh history so the edited generation appears in the list.
		resetAndInvalidate();
	};

	const handleToggleFavorite = async (generationId: string) => {
		try {
			await apiClient.toggleFavorite(generationId);
			resetAndInvalidate();
		} catch {
			toast({
				title: ERR_TITLE_SAVE,
				description: ERR_DESC_SAVE_FAILED,
				variant: "destructive",
			});
		}
	};

	const handleApplyEffects = (
		generationId: string,
		versions: HistoryResponse["versions"],
	) => {
		const list = versions ?? [];
		setEffectsTargetId(generationId);
		setEffectsTargetVersions(list);
		const cleanVersion = list.find(
			(v) => !v.effects_chain || v.effects_chain.length === 0,
		);
		setEffectsSourceVersionId(cleanVersion?.id ?? null);
		setEffectsChain([]);
		setEffectsDialogOpen(true);
	};

	const handleApplyEffectsConfirm = async () => {
		if (!effectsTargetId || effectsChain.length === 0) {
			return;
		}
		setApplyingEffects(true);
		try {
			const newVersion = await apiClient.applyEffectsToGeneration(
				effectsTargetId,
				{
					effects_chain: effectsChain,
					source_version_id: effectsSourceVersionId ?? undefined,
					set_as_default: true,
				},
			);
			resetAndInvalidate();

			if (currentAudioId === effectsTargetId) {
				const gen = allHistory.find((g) => g.id === effectsTargetId);
				if (gen) {
					const versionUrl = apiClient.getVersionAudioUrl(newVersion.id);
					setAudioWithAutoPlay(
						versionUrl,
						effectsTargetId,
						gen.profile_id,
						gen.text.substring(0, 50),
					);
				}
			}

			setEffectsDialogOpen(false);
			toast({
				title: "Effects applied",
				description: "A new version has been created.",
			});
		} catch (error) {
			showStudioErrorToast(error);
		} finally {
			setApplyingEffects(false);
		}
	};

	const handleSwitchVersion = async (
		generationId: string,
		versionId: string,
	) => {
		try {
			await apiClient.setDefaultVersion(generationId, versionId);
			resetAndInvalidate();
		} catch {
			toast({
				title: ERR_TITLE_STORY,
				description: ERR_DESC_STORY_FAILED,
				variant: "destructive",
			});
		}
	};

	const handlePlayVersion = (
		generationId: string,
		versionId: string,
		text: string,
		profileId: string,
	) => {
		const url = apiClient.getVersionAudioUrl(versionId);
		setAudioWithAutoPlay(url, generationId, profileId, text.substring(0, 50));
	};

	const handleImportConfirm = () => {
		if (!selectedFile) {
			return;
		}
		importGeneration.mutate(selectedFile, {
			onSuccess: (data) => {
				setImportDialogOpen(false);
				setSelectedFile(null);
				if (fileInputRef.current) {
					fileInputRef.current.value = "";
				}
				toast({
					title: "Generation imported",
					description: data.message || "Generation imported successfully",
				});
			},
			onError: (error) => showStudioErrorToast(error),
		});
	};

	const handleClearFailedConfirm = () => {
		clearFailed.mutate(undefined, {
			onSuccess: (data) => {
				setClearFailedDialogOpen(false);
				toast({
					title: "Cleared failed generations",
					description: `${data.deleted} failed ${data.deleted === 1 ? "generation" : "generations"} removed.`,
				});
			},
			onError: () =>
				toast({
					title: ERR_TITLE_SAVE,
					description: ERR_DESC_SAVE_FAILED,
					variant: "destructive",
				}),
		});
	};

	const failedCount = allHistory.filter((g) => g.status === "failed").length;

	return {
		t,
		LIMIT,
		page,
		setPage,
		allHistory,
		total,
		setTotal,
		isScrolled,
		setIsScrolled,
		isLoading,
		isFetching,
		fileInputRef,
		importDialogOpen,
		setImportDialogOpen,
		selectedFile,
		setSelectedFile,
		deleteDialogOpen,
		setDeleteDialogOpen,
		generationToDelete,
		setGenerationToDelete,
		clearFailedDialogOpen,
		setClearFailedDialogOpen,
		effectsDialogOpen,
		setEffectsDialogOpen,
		effectsTargetId,
		effectsTargetVersions,
		effectsSourceVersionId,
		setEffectsSourceVersionId,
		effectsChain,
		setEffectsChain,
		applyingEffects,
		expandedVersionsId,
		setExpandedVersionsId,
		expandedABId,
		setExpandedABId,
		editDialogOpen,
		setEditDialogOpen,
		editTargetId,
		setEditTargetId,
		deleteGeneration,
		clearFailed,
		cancelGeneration,
		exportGeneration,
		exportGenerationAudio,
		importGeneration,
		isPlayerVisible,
		currentAudioId,
		isPlaying,
		failedCount,
		handlePlay,
		handleDownloadAudio,
		handleExportPackage,
		handleDeleteClick,
		handleDeleteConfirm,
		handleRetry,
		handleRegenerate,
		handleEditClick,
		handleEditComplete,
		handleToggleFavorite,
		handleApplyEffects,
		handleApplyEffectsConfirm,
		handleSwitchVersion,
		handlePlayVersion,
		handleImportConfirm,
		handleClearFailedConfirm,
	};
}

export type HistoryTableController = ReturnType<typeof useHistoryTable>;
