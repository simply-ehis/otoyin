import {
	BoltIcon,
	ChatBubbleLeftRightIcon,
	MicrophoneIcon,
	MusicalNoteIcon,
	PuzzlePieceIcon,
	SparklesIcon,
	Squares2X2Icon,
} from "@heroicons/react/24/outline";
import {
	formatSize,
	MODEL_DESCRIPTIONS,
} from "@/components/ServerSettings/modelUtils";
import type {
	ActiveDownloadTask,
	MarketplaceProduct,
	ModelStatus,
} from "@/lib/api/types";

export const CATEGORIES = [
	{ id: "all", label: "All", icon: Squares2X2Icon },
	{ id: "tts", label: "Voice", icon: MicrophoneIcon },
	{ id: "stt", label: "Transcription", icon: ChatBubbleLeftRightIcon },
	{ id: "llm", label: "Assistant", icon: SparklesIcon },
	{ id: "vc", label: "Voice Convert", icon: BoltIcon },
	{ id: "music", label: "Music & SFX", icon: MusicalNoteIcon },
	{ id: "translation", label: "Translation", icon: ChatBubbleLeftRightIcon },
	{ id: "extras", label: "Extras", icon: PuzzlePieceIcon },
] as const;

export const USE_CASES = [
	{ id: "all", label: "All Uses" },
	{ id: "podcast", label: "Podcast" },
	{ id: "audiobook", label: "Audiobook" },
	{ id: "voiceover", label: "Voiceover" },
	{ id: "dubbing", label: "Dubbing" },
	{ id: "transcription", label: "Transcription" },
	{ id: "music", label: "Music" },
	{ id: "assistant", label: "Assistant" },
] as const;
export type UseCaseId = (typeof USE_CASES)[number]["id"];

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const CATEGORY_LABELS: Record<string, string> = {
	tts: "Voice Engines",
	stt: "Transcription",
	llm: "Assistant Brains",
	vc: "Voice Conversion",
	music: "Music & SFX",
	translation: "Translation Packs",
	extras: "Extras",
};

export const CATEGORY_ACCENT: Record<string, string> = {
	tts: "from-accent/10 via-accent/5 to-transparent",
	stt: "from-emerald-500/10 via-teal-500/5 to-transparent",
	llm: "from-amber-500/10 via-orange-500/5 to-transparent",
	vc: "from-cyan-500/10 via-blue-500/5 to-transparent",
	music: "from-accent/10 via-accent/5 to-transparent",
	translation: "from-sky-500/10 via-indigo-500/5 to-transparent",
	extras: "from-zinc-500/10 via-neutral-500/5 to-transparent",
	sfx: "from-zinc-500/10 via-neutral-500/5 to-transparent",
};

export function getProductModelStatus(
	productId: string,
	models: ModelStatus[] | undefined,
): ModelStatus | undefined {
	return models?.find((m) => m.model_name === productId);
}

export function getDisplayDescription(
	product: MarketplaceProduct,
	model?: ModelStatus,
): string {
	// Prefer marketplace long_description (about) — explains what the model does
	if ((product as unknown as { long_description?: string }).long_description) {
		return (product as unknown as { long_description: string })
			.long_description;
	}
	const rich = MODEL_DESCRIPTIONS[product.id];
	if (rich) {
		return rich;
	}
	if (product.description) {
		return product.description;
	}
	if (product.note) {
		return product.note;
	}
	if (model?.display_name) {
		return `${model.display_name} — ${model.category ?? product.category} model`;
	}
	return "Local AI model — runs entirely on your machine.";
}

export function getCapabilityChips(
	model?: ModelStatus,
): { label: string; tone: string }[] {
	if (!model) {
		return [];
	}
	const chips: { label: string; tone: string }[] = [];
	if (model.clone_voice) {
		chips.push({ label: "Clone", tone: "violet" });
	}
	if (model.emotion_control) {
		chips.push({ label: "Emotion", tone: "amber" });
	}
	if (model.supports_voice_mixing) {
		chips.push({ label: "Mix", tone: "amber" });
	}
	if (model.paralinguistic_tags) {
		chips.push({ label: "Tags", tone: "cyan" });
	}
	if (model.voice_design) {
		chips.push({ label: "Design", tone: "fuchsia" });
	}
	if (model.supports_instruct) {
		chips.push({ label: "Instruct", tone: "blue" });
	}
	if (model.supports_editing) {
		chips.push({ label: "Edit", tone: "teal" });
	}
	if (model.gpu_only) {
		chips.push({ label: "GPU", tone: "red" });
	}
	if (model.preset_voices && model.preset_voices.length > 0) {
		chips.push({ label: `${model.preset_voices.length} voices`, tone: "zinc" });
	}
	return chips;
}

export function formatPrice(product: MarketplaceProduct): string {
	if (!product.paid) {
		return "Free";
	}
	return `$${product.price_usd}`;
}

export function priceTone(
	product: MarketplaceProduct,
	owned: boolean,
	installed: boolean,
): string {
	if (owned || installed) {
		return "emerald";
	}
	if (!product.paid) {
		return "emerald";
	}
	return "amber";
}

export { formatSize };

export type SortMode =
	| "default"
	| "quality"
	| "price-asc"
	| "price-desc"
	| "name";

export function buildFilteredProducts(
	products: MarketplaceProduct[],
	models: ModelStatus[] | undefined,
	activeCategory: CategoryId,
	search: string,
	showFilter: "all" | "installed" | "available" | "paid" | "free",
	owned: Set<string>,
	installed: Set<string>,
	sortMode: SortMode = "default",
	activeUseCase: string = "all",
	wishlist?: Set<string>,
	showWishlistOnly: boolean = false,
): MarketplaceProduct[] {
	let list = [...products];
	if (activeCategory !== "all") {
		list = list.filter((p) => p.category === activeCategory);
	}
	if (activeUseCase !== "all") {
		list = list.filter((p) => {
			const uses = (p as unknown as { use_cases?: string[] }).use_cases ?? [];
			return uses.includes(activeUseCase);
		});
	}
	if (showWishlistOnly && wishlist) {
		list = list.filter((p) => wishlist.has(p.id));
	}
	if (showFilter === "installed") {
		list = list.filter((p) => installed.has(p.id));
	} else if (showFilter === "available") {
		list = list.filter((p) => !installed.has(p.id));
	} else if (showFilter === "paid") {
		list = list.filter((p) => p.paid);
	} else if (showFilter === "free") {
		list = list.filter((p) => !p.paid);
	}
	if (search.trim()) {
		const q = search.toLowerCase();
		list = list.filter((p) => {
			const m = getProductModelStatus(p.id, models);
			return (
				p.name.toLowerCase().includes(q) ||
				p.id.toLowerCase().includes(q) ||
				p.note?.toLowerCase().includes(q) ||
				getDisplayDescription(p, m).toLowerCase().includes(q) ||
				(m?.hf_repo_id?.toLowerCase().includes(q) ?? false)
			);
		});
	}
	return list.sort((a, b) => {
		// Installed always first
		const aInst = installed.has(a.id) || owned.has(a.id) ? 0 : 1;
		const bInst = installed.has(b.id) || owned.has(b.id) ? 0 : 1;
		if (aInst !== bInst) {
			return aInst - bInst;
		}
		// Sort mode
		if (sortMode === "quality") {
			const aQ = a.quality_score ?? 0;
			const bQ = b.quality_score ?? 0;
			if (aQ !== bQ) {
				return bQ - aQ;
			}
		} else if (sortMode === "price-asc") {
			if (a.price_usd !== b.price_usd) {
				return a.price_usd - b.price_usd;
			}
		} else if (sortMode === "price-desc") {
			if (a.price_usd !== b.price_usd) {
				return b.price_usd - a.price_usd;
			}
		} else if (sortMode === "name") {
			return a.name.localeCompare(b.name);
		} else {
			// Default: free before paid, then quality desc
			if (a.paid !== b.paid) {
				return a.paid ? 1 : -1;
			}
			const aQ = a.quality_score ?? 0;
			const bQ = b.quality_score ?? 0;
			if (aQ !== bQ) {
				return bQ - aQ;
			}
		}
		return a.name.localeCompare(b.name);
	});
}

export function bytesToProgress(
	dl?: ActiveDownloadTask,
): { pct: number; label: string } | null {
	if (!dl) {
		return null;
	}
	const pct = dl.progress ?? 0;
	const hasTotal = dl.total != null && dl.total > 0;
	const cur = dl.current ?? 0;
	const tot = dl.total ?? 0;
	const label = hasTotal
		? `${(cur / 1024 / 1024).toFixed(1)} / ${(tot / 1024 / 1024).toFixed(1)} MB (${pct.toFixed(0)}%)`
		: (dl.filename ?? "Connecting…");
	return { pct, label };
}
