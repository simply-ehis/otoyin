import type {
	ActiveDownloadTask,
	Catalog,
	EntitlementResponse,
	ModelStatus,
} from "@/lib/api/types";

export function buildErroredDownloads(
	activeTasks: { downloads: ActiveDownloadTask[] } | undefined,
	dismissedErrors: Set<string>,
	localErrors: Map<string, string>,
): Map<string, ActiveDownloadTask> {
	const erroredDownloads = new Map<string, ActiveDownloadTask>();
	if (activeTasks?.downloads) {
		for (const dl of activeTasks.downloads) {
			if (dl.status === "error" && !dismissedErrors.has(dl.model_name)) {
				const localErr = localErrors.get(dl.model_name);
				erroredDownloads.set(
					dl.model_name,
					localErr ? { ...dl, error: localErr } : dl,
				);
			}
		}
	}
	for (const [modelName, error] of localErrors) {
		if (!erroredDownloads.has(modelName) && !dismissedErrors.has(modelName)) {
			erroredDownloads.set(modelName, {
				model_name: modelName,
				status: "error",
				started_at: new Date().toISOString(),
				error,
			});
		}
	}
	return erroredDownloads;
}

export function buildDownloadProgressMap(
	activeTasks: { downloads: ActiveDownloadTask[] } | undefined,
): Map<string, ActiveDownloadTask> {
	const map = new Map<string, ActiveDownloadTask>();
	if (activeTasks?.downloads) {
		for (const dl of activeTasks.downloads) {
			if (dl.status === "downloading") {
				map.set(dl.model_name, dl);
			}
		}
	}
	return map;
}
const CATEGORY_LABELS: Record<string, string> = {
	tts: "models.sections.voiceGeneration",
	vc: "models.sections.voiceConversion",
	stt: "models.sections.transcription",
	llm: "models.sections.languageModels",
	music: "models.sections.music",
	sfx: "models.sections.sfx",
};

const CATEGORY_ORDER = ["tts", "vc", "stt", "llm", "music", "sfx"];

export function buildSections(models: ModelStatus[] | undefined): {
	label: string;
	models: ModelStatus[];
}[] {
	if (!models || models.length === 0) {
		return [];
	}

	// Group models by their category field (set in backend ModelConfig).
	// Fallback to "tts" for models without a category (legacy data).
	const grouped = new Map<string, ModelStatus[]>();
	for (const model of models) {
		const cat = model.category || "tts";
		if (!grouped.has(cat)) {
			grouped.set(cat, []);
		}
		grouped.get(cat)?.push(model);
	}

	// Sort by category order, then by quality_score descending within each
	return CATEGORY_ORDER.filter((cat) => grouped.has(cat)).map((cat) => ({
		label: CATEGORY_LABELS[cat] || cat,
		models:
			grouped
				.get(cat)
				?.sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0)) ?? [],
	}));
}

export function getModelState(
	model: ModelStatus,
	downloadingModel: string | null,
	erroredDownloads: Map<string, ActiveDownloadTask>,
	dismissedErrors: Set<string>,
): { isDownloading: boolean; hasError: boolean } {
	const isDownloading =
		(model.downloading || downloadingModel === model.model_name) &&
		!erroredDownloads.has(model.model_name) &&
		!dismissedErrors.has(model.model_name);
	const hasError = erroredDownloads.has(model.model_name);
	return { isDownloading, hasError };
}

/**
 * Check if a model is a paid product that requires a license.
 * Returns the product info if paid, or null if free/not in catalog.
 */
export function getPaidProduct(
	modelName: string,
	catalog?: Catalog,
): { paid: boolean; price_usd: number } | null {
	if (!catalog?.products) {
		return null;
	}
	const product = catalog.products.find((p) => p.id === modelName);
	if (!product || !product.paid) {
		return null;
	}
	return { paid: true, price_usd: product.price_usd };
}

/**
 * Check if user has entitlement (license) for a paid model.
 * Free models always return true.
 */
export function hasLicense(
	modelName: string,
	catalog?: Catalog,
	entitlements?: EntitlementResponse,
): boolean {
	const product = getPaidProduct(modelName, catalog);
	if (!product) {
		return true; // free model
	}
	if (!entitlements?.entitlements) {
		return false;
	}
	return entitlements.entitlements.includes(`models:${modelName}`);
}

interface ModelDerivedArgs {
	modelStatus?: { models: ModelStatus[] };
	selectedModel: ModelStatus | null;
	downloadingModel: string | null;
	erroredDownloads: Map<string, ActiveDownloadTask>;
	dismissedErrors: Set<string>;
	hfModelInfo?: {
		cardData?: { license?: string };
		tags?: string[];
	};
}

interface ModelDerived {
	sections: { label: string; models: ModelStatus[] }[];
	getModelStateForList: (model: ModelStatus) => {
		isDownloading: boolean;
		hasError: boolean;
	};
	selectedState: { isDownloading: boolean; hasError: boolean } | null;
	selectedError: ActiveDownloadTask | undefined;
	freshSelectedModel: ModelStatus | null;
	license?: string;
}

export function useModelDerived({
	modelStatus,
	selectedModel,
	downloadingModel,
	erroredDownloads,
	dismissedErrors,
	hfModelInfo,
}: ModelDerivedArgs): ModelDerived {
	const sections = buildSections(modelStatus?.models);
	const getModelStateForList = (model: ModelStatus) =>
		getModelState(model, downloadingModel, erroredDownloads, dismissedErrors);
	const selectedState = selectedModel
		? getModelStateForList(selectedModel)
		: null;
	const selectedError = selectedModel
		? erroredDownloads.get(selectedModel.model_name)
		: undefined;

	const freshSelectedModel =
		selectedModel && modelStatus
			? modelStatus.models.find(
					(m) => m.model_name === selectedModel.model_name,
				) || selectedModel
			: selectedModel;

	const license =
		hfModelInfo?.cardData?.license ||
		hfModelInfo?.tags
			?.find((tag) => tag.startsWith("license:"))
			?.replace("license:", "");

	return {
		sections,
		getModelStateForList,
		selectedState,
		selectedError,
		freshSelectedModel,
		license,
	};
}
