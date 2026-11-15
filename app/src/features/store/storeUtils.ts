import {
	BoltIcon,
	ChatBubbleLeftRightIcon,
	MicrophoneIcon,
	MusicalNoteIcon,
	PuzzlePieceIcon,
	SparklesIcon,
	SpeakerWaveIcon,
	Squares2X2Icon,
	WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import type {
	ActiveDownloadTask,
	MarketplaceProduct,
	ModelStatus,
} from "@/lib/api/types";
import { convertUsd, formatMoney } from "@/lib/regionCurrency";

export const CATEGORIES = [
	{ id: "all", label: "All", icon: Squares2X2Icon },
	{ id: "tts", label: "Voice", icon: MicrophoneIcon },
	{ id: "stt", label: "Transcription", icon: ChatBubbleLeftRightIcon },
	{ id: "llm", label: "Assistant", icon: SparklesIcon },
	{ id: "vc", label: "Voice Convert", icon: BoltIcon },
	{ id: "music", label: "Music", icon: MusicalNoteIcon },
	{ id: "sfx", label: "Sound Effects", icon: SpeakerWaveIcon },
	{ id: "instruments", label: "Instruments", icon: SpeakerWaveIcon },
	{ id: "translation", label: "Translation", icon: ChatBubbleLeftRightIcon },
	{ id: "extras", label: "Extras", icon: PuzzlePieceIcon },
	{ id: "utilities", label: "Utilities", icon: WrenchScrewdriverIcon },
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
	music: "Music",
	sfx: "Sound Effects",
	instruments: "Instrument Packs",
	translation: "Translation Packs",
	extras: "Extras",
	utilities: "Utilities",
};

/** Category hue identity — 3px top edge bar (hueLine pattern), solid card surface. */
export const CATEGORY_ACCENT: Record<string, string> = {
	tts: "border-t-[3px] border-accent",
	stt: "border-t-[3px] border-emerald-400",
	llm: "border-t-[3px] border-amber-400",
	vc: "border-t-[3px] border-cyan-400",
	music: "border-t-[3px] border-accent",
	instruments: "border-t-[3px] border-teal-400",
	translation: "border-t-[3px] border-sky-400",
	extras: "border-t-[3px] border-muted-foreground",
	sfx: "border-t-[3px] border-muted-foreground",
	utilities: "border-t-[3px] border-muted-foreground",
};

/** Rich per-model descriptions (ported from the old ServerSettings tree). */
export const MODEL_DESCRIPTIONS: Record<string, string> = {
	"phonon-31m-en":
		"Phonon-31m-en - 81MB tiny CPU English TTS. Apache-2.0, real-time on CPU.",
	supertonic:
		"Supertonic 3 - 31 languages, 10 preset voices. Apache-2.0. CPU-friendly.",
	"piper-en-us-lessac-medium":
		"Piper - 60MB, en-US lessac-medium voice. MIT. Minimal resource footprint.",
	"chatterbox-turbo":
		"Chatterbox Turbo - 667MB distilled 350M English TTS, MIT. Single built-in voice, 19 emotion/style tags ([laugh], [sigh], [happy], [angry], [whispering], ...).",
	"inflect-micro-v2":
		"Inflect Micro v2 - 69MB tiny English CPU TTS, Apache-2.0. Fast, requires eSpeak-ng.",
	"audio8-tts-realistic":
		"Audio8-TTS - 1.4GB, 12 languages with zero-shot clone. Apache-2.0.",
	cosyvoice3:
		"CosyVoice3 - 2.2GB FunAudioLLM cloning, cross-lingual synthesis. Apache-2.0.",
	"magpie-tts-357m":
		"MagpieTTS - 1.5GB NVIDIA multilingual lightweight, 10 baked voices. Apache-2.0.",
	zonos3:
		"ZONOS3-Mini - 1.1GB, Zyphra Apache-2.0. Clones voices from ~5s audio. ~110 ms CPU latency.",
	omnivoice:
		"OmniVoice - 1.29GB, 600+ languages, zero-shot clone + voice design. CC-BY-NC-4.0.",
	"drama-3-4bit":
		"Drama-3 - 23.5GB CUDA-only, Fish Audio Community License v1.0 (free < $500K/yr). VRAM 16GB+ required.",
	"yue2-3b":
		"Yue2-3B - 4.3GB, lyric-conditioned music generation with VAE. CC-BY-NC-4.0.",
	"stable-audio-3-small-music":
		"Stable Audio 3 Small Music - 1.6GB Stability Community License. Text-to-music.",
	"moss-soundeffect-v2":
		"MOSS-SoundEffect v2 - 3.8GB MOSS SFX v2, English+Chinese prompt. Apache-2.0.",
	"kokoro-onnx":
		"Kokoro 82M by hexgrad — the default Otoyin voice. Tiny 82M ONNX model that speaks in realtime on CPU, 45 warm preset voices across 8 languages, plus voice-mixing to blend your own. Apache 2.0, no PyTorch needed. Best starting point for podcasts, dialogue, and voice-overs.",
	"fish-speech-s2-pro":
		"Fish Audio S2 Pro (Dual-AR TTS, 4.5B GGUF) - 80+ languages, voice cloning from 10-30s, inline emotion tags ([whisper], [angry], etc). Slow-AR 4B + Fast-AR 0.4B. GPU or 24GB+ RAM.",
	"qwen3-tts-1.7b":
		"Qwen3-TTS 12Hz 1.7B (GGUF, Apache-2.0) - premium cloning via the audio.cpp sidecar. 10 languages, 24kHz, faithful timbre from a short sample. The upgrade when Kokoro isn't enough.",
	"bark-small":
		"Bark Small (GGUF, MIT) — 26 built-in speakers, 13 languages, plus laughs, sighs and music-aware generation. Runs via CrispASR one-shot, perfect for playful characters and sound-rich scenes.",
	styletts2:
		"StyleTTS2 — style-based TTS with a learned style encoder and differentiable duration. Expressive, stable pacing for long-form narration and audiobooks. 200–300% realtime on CPU.",
	"styletts2-onnx":
		"StyleTTS2 ONNX — same expressive voices, zero PyTorch. Five ONNX graphs run inside ONNX Runtime for a lighter install and faster cold start.",
	"f5-tts":
		"F5-TTS Small — flow-matching zero-shot clone with no speaker embedding. Clean, faithful cloning from one clip, English + Mandarin focus.",
	"pocket-tts":
		"Pocket TTS (100M) - compact CPU-realtime English TTS. Clone or pick from 26 packaged voices, ~270MB download.",
	"moss-tts-nano":
		"MOSS-TTS-Nano 100M ONNX — 20+ languages in 763MB. Zero-shot cloning without PyTorch, ideal for multilingual UIs and edge devices.",
	"parler-tts-mini":
		'Parler-TTS Mini — "describe the voice" instead of cloning. Prompt it like "a warm, low, fast NPR host" and get a matching voice, 14 presets to start from.',
	"kitten-tts-mini":
		"KittenTTS mini (80MB, Apache-2.0) — the instant-voice. 8 presets, CPU-only, no dependencies, <1s to first audio. Perfect for quick drafts and low-end machines.",
	"neutts-2e-orig":
		"NeuTTS-2E - emotion-aware TTS (angry, happy, sad, neutral...), 9 built-in voices, English only. Single GGUF via audio.cpp.",
	"orpheus-q4-k-m":
		"Orpheus 3B Q4 — 8 voices with inline tags <laugh> <sigh> <cough>. Expressive storyteller via llama-cpp + SNAC 24kHz. 2.4GB, great value.",
	"orpheus-q8-0":
		"Orpheus 3B Q8 — premium Orpheus with fuller timbre and steadier emotion tags. 4GB download, noticeably more natural on long passages.",
	"whisper-tiny-en":
		"Whisper Tiny EN (75MB) — the instant transcriber. English-only, fastest cold start, good for short captures and live dictation on weak machines.",
	"whisper-base-en":
		"Whisper Base EN (142MB) — the balanced pick. Faster than small, accurate enough for most voices and accents.",
	"whisper-small-en":
		"Whisper Small EN (466MB) — the sweet spot. 3× base, dramatically better WER, still realtime for dictation and auto-paste.",
	"whisper-medium-en":
		"Whisper Medium EN (1.5GB) — best English accuracy before large. Handles accents, noisy rooms, and technical jargon that smaller models miss.",
	"whisper-large-v3-turbo":
		"Whisper Large-v3-Turbo (1.6GB) — OpenAI's distilled flagship, 99 languages, near-human accuracy, 4–8× faster than full Large-v3. Runs on CPU.",
	"whisper-large-v3":
		"Whisper Large-v3 (3.1GB) — the full flagship, 99 languages, best quality when you can afford the download and RAM.",
	"parakeet-v3-q8":
		"Parakeet TDT 0.6B v3 Q8 (600MB) — 25 European languages in one model, auto-detect. Great when your captures switch languages.",
	"parakeet-v3-f16":
		"Parakeet TDT 0.6B v3 FP16 (220MB) — lighter Parakeet with the same 25 languages. Pick it for tighter disks.",
	"qwen3-asr-1.7b-int4":
		"Qwen3-ASR 1.7B INT4 — 52 languages, offline, ONNX Runtime. Near-cloud accuracy without the cloud.",
	"qwen3-asr-0.6b-int4":
		"Qwen3-ASR 0.6B INT4 — 52 languages in 600MB. Best quality-per-size for multilingual teams.",
	"planner-lfm2-2.6b":
		"LFM2.5-2.6B (Free) — LiquidAI's on-device planner. 128K context, 24 languages, native tool calling + thinking tags.",
	"llm-cloud-starter":
		"Cloud Starter — Coming Soon ($10/mo) — planned cloud-hosted LLM for the in-app assistant. No download, instant responses when live.",
	"llm-cloud-pro":
		"Cloud Pro — Coming Soon ($20/mo) — planned smarter cloud model for complex reasoning and coding.",
	"llm-cloud-max":
		"Cloud Max — Coming Soon ($50/mo) — planned top-tier cloud model, maximum capability.",
	"seed-vc":
		"Seed-VC — zero-shot voice conversion from a reference clip. Change timbre without re-generating text. GPU recommended.",
	"rvc-default":
		"RVC — classic voice packs (pre-trained). Instant conversion once the pack is installed.",
	"openvoice-v2":
		"OpenVoice V2 — tone-color conversion, zero-shot. Keep the prosody, swap the voice.",
	"neutts-air":
		"NeuTTS-Air — lightweight voice conversion air bridge. Quick timbre transfer for previews.",
	"steam-audio":
		"Steam Audio SDK (pre-installed) — binaural spatial audio, occlusion, and reflections for immersive mixes. ~10MB.",
	demucs_onnx:
		"Demucs HTDemucs ONNX (316MB, MIT) — pull vocals, drums, bass or other from any mix. Torch-free, runs on CPU.",
	"acestep-1-5":
		"ACE-Step 1.5 (10.3GB) — text-to-music generation. Describe genre, mood and tempo, get a stereo track 10s–10min. Offline, Apache-2.0/MIT weights.",
	"heartmula-3b":
		"HeartMuLa 3B (7.7GB) — melodic song generation, mono 48kHz. Tag with style-comma tags for mood, handle lyrics and duration control.",
	"stable-audio-3-small-sfx":
		"Stable Audio 3 Small SFX — one-shot sound effects from a prompt. Hits, whooshes, ambience beds.",
};

export function formatSize(sizeMb?: number): string {
	if (!sizeMb) {
		return "";
	}
	if (sizeMb < 1024) {
		return `${sizeMb.toFixed(1)} MB`;
	}
	return `${(sizeMb / 1024).toFixed(2)} GB`;
}

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
	if (model.commercial_use === false) {
		chips.push({ label: "Non-commercial", tone: "red" });
	} else if (model.license_id) {
		chips.push({ label: "License", tone: "zinc" });
	}
	if (model.preset_voices && model.preset_voices.length > 0) {
		chips.push({ label: `${model.preset_voices.length} voices`, tone: "zinc" });
	}
	return chips;
}

export function formatPrice(
	product: MarketplaceProduct,
	fx?: { currency: string; rate: number; locale: string },
): string {
	if (!product.paid) {
		return "Free";
	}
	if (product.localized_price) {
		return product.localized_price;
	}
	// No FX (offline/unknown locale) or USD: legacy plain-dollar display.
	if (!fx || fx.currency === "USD" || !(fx.rate > 0)) {
		return `$${product.price_usd}`;
	}
	return formatMoney(
		convertUsd(product.price_usd, fx.rate),
		fx.currency,
		fx.locale,
	);
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

export type SortMode = "default" | "price-asc" | "price-desc" | "name";

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
		// Utility-type categories always sink to the bottom of the
		// marketplace (utilities last of all) so core voices stay on top.
		const bottomRank = (c: string): number => {
			if (c === "utilities") {
				return 3;
			}
			if (c === "translation") {
				return 2;
			}
			if (c === "extras" || c === "sfx") {
				return 1;
			}
			return 0;
		};
		const aBottom = bottomRank(a.category);
		const bBottom = bottomRank(b.category);
		if (aBottom !== bBottom) {
			return aBottom - bBottom;
		}
		// Installed always first
		const aInst = installed.has(a.id) || owned.has(a.id) ? 0 : 1;
		const bInst = installed.has(b.id) || owned.has(b.id) ? 0 : 1;
		if (aInst !== bInst) {
			return aInst - bInst;
		}
		// Sort mode
		if (sortMode === "price-asc") {
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
			// Default: free before paid, then price ascending
			if (a.paid !== b.paid) {
				return a.paid ? 1 : -1;
			}
			if (a.price_usd !== b.price_usd) {
				return a.price_usd - b.price_usd;
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

/** Active (downloading) tasks keyed by model name. */
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

/** Failed tasks not yet dismissed, keyed by model name. */
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
