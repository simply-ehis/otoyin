import type {
	EffectConfig,
	GenerationVersionResponse,
	HistoryResponse,
} from "@/lib/api/types";

export interface DeleteTarget {
	id: string;
	name: string;
}

export interface HistoryTableState {
	page: number;
	allHistory: HistoryResponse[];
	total: number;
	isScrolled: boolean;
	importDialogOpen: boolean;
	selectedFile: File | null;
	deleteDialogOpen: boolean;
	generationToDelete: DeleteTarget | null;
	clearFailedDialogOpen: boolean;
	effectsDialogOpen: boolean;
	effectsTargetId: string | null;
	effectsTargetVersions: GenerationVersionResponse[];
	effectsSourceVersionId: string | null;
	effectsChain: EffectConfig[];
	applyingEffects: boolean;
	expandedVersionsId: string | null;
	editDialogOpen: boolean;
	editTargetId: string | null;
}
