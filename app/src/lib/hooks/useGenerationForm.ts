import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { apiClient } from "@/lib/api/client";
import type { EffectConfig, ModelStatusListResponse } from "@/lib/api/types";
import { MODEL_NAME_MAP } from "@/lib/constants/engines";
import { LANGUAGE_CODES, type LanguageCode } from "@/lib/constants/languages";
import { ERR_DESC_NO_PROFILE, ERR_TITLE_VALIDATION } from "@/lib/errorMessages";
import { showStudioErrorToast } from "@/lib/errors";
import { useGeneration } from "@/lib/hooks/useGeneration";
import { useModelDownloadToast } from "@/lib/hooks/useModelDownloadToast";
import { useGenerationSettings } from "@/lib/hooks/useSettings";
import { useGenerationStore } from "@/stores/generationStore";
import { useUIStore } from "@/stores/uiStore";
import { useToast } from "@/ui/use-toast";

// Engine keys as const tuple for proper zod enum inference
const ENGINE_KEYS = [
	"kokoro",
	"fish_speech_s2",
	"qwen3_tts",
	"voxcpm2",
	"bark_small",
	"styletts2",
	"pocket_tts",
	"parler_tts_gguf",
	"moss_tts_nano",
	"kitten_tts",
	"neutts",
	"neutts_2e",
	"orpheus",
	"steer_tts",
	"audio8_tts",
	"chatterbox_turbo",
	"cosyvoice3",
	"fish_drama3",
	"inflect_v2",
	"magpie_tts",
	"omnivoice",
	"phonon",
	"piper_tts",
	"supertonic",
	"zonos3",
	"cloud",
] as const;

const generationSchema = z.object({
	text: z.string().min(1, "").max(50000),
	language: z.enum(LANGUAGE_CODES as [LanguageCode, ...LanguageCode[]]),
	seed: z.number().int().optional(),
	instruct: z.string().max(500).optional(),
	engine: z.enum(ENGINE_KEYS).optional(),
	personality: z.boolean().optional(),
	supportsInstruct: z.boolean().optional(),
	temperature: z.number().min(0).max(2).optional(),
	emotion: z.string().optional(),
	voiceClean: z.boolean().optional(),
});

export type GenerationFormValues = z.infer<typeof generationSchema>;

/**
 * Re-export MODEL_NAME_MAP from centralized constants for backward compatibility.
 * The canonical definition lives in @/lib/constants/engines.
 */
export { MODEL_NAME_MAP } from "@/lib/constants/engines";

/**
 * Pick the engine to pre-select for a fresh generation form.
 *
 * Preference: the user's last-selected engine if it is *downloaded*, otherwise
 * the first downloaded TTS engine (lightest-first, mirroring the backend's
 * dynamic hardware-aware ranking). Returns ``undefined`` when nothing is
 * installed yet, so the UI can prompt the user to download a model instead of
 * silently defaulting to a hardcoded engine.
 */
function resolveDefaultEngine(
	modelStatus: ModelStatusListResponse | undefined,
	persisted: string | undefined,
): GenerationFormValues["engine"] | undefined {
	const downloaded = (modelStatus?.models ?? [])
		.filter((m) => m.downloaded && m.category === "tts" && m.engine)
		.map((m) => m.engine as string);

	if (persisted && downloaded.includes(persisted)) {
		return persisted as GenerationFormValues["engine"];
	}
	for (const key of Object.keys(MODEL_NAME_MAP)) {
		if (key === "cloud") {
			continue;
		}
		if (downloaded.includes(key)) {
			return key as GenerationFormValues["engine"];
		}
	}
	return undefined;
}

interface UseGenerationFormOptions {
	onSuccess?: (generationId: string) => void;
	defaultValues?: Partial<GenerationFormValues>;
	getEffectsChain?: () => EffectConfig[] | undefined;
}

export function useGenerationForm(options: UseGenerationFormOptions = {}) {
	const { toast } = useToast();
	const generation = useGeneration();
	const queryClient = useQueryClient();
	const addPendingGeneration = useGenerationStore(
		(state) => state.addPendingGeneration,
	);
	const { settings: genSettings } = useGenerationSettings();
	const maxChunkChars = genSettings?.max_chunk_chars ?? 800;
	const crossfadeMs = genSettings?.crossfade_ms ?? 50;
	const normalizeAudio = genSettings?.normalize_audio ?? true;
	const selectedEngine = useUIStore((state) => state.selectedEngine);
	// Resolve the default engine for the form:
	// - use the user's persisted selection when it is valid AND downloaded,
	// - otherwise fall back to the first *downloaded* engine (never a hardcoded
	//  "kokoro" literal),
	// - when nothing is downloaded yet, keep the persisted selection so the UI
	//  still renders (generation will prompt a download).
	const modelStatusCache = queryClient.getQueryData<ModelStatusListResponse>([
		"modelStatus",
	]);
	const resolvedEngine = ((): GenerationFormValues["engine"] | undefined => {
		const validSelected =
			selectedEngine && selectedEngine in MODEL_NAME_MAP
				? (selectedEngine as GenerationFormValues["engine"])
				: undefined;
		const downloaded = (modelStatusCache?.models ?? [])
			.filter((m) => m.downloaded && m.category === "tts" && m.engine)
			.map((m) => m.engine as string);
		if (downloaded.length === 0) {
			return undefined;
		}
		if (validSelected && downloaded.includes(validSelected)) {
			return validSelected;
		}
		for (const key of Object.keys(MODEL_NAME_MAP)) {
			if (key === "cloud") {
				continue;
			}
			if (downloaded.includes(key)) {
				return key as GenerationFormValues["engine"];
			}
		}
		return undefined;
	})();
	const [downloadingModelName, setDownloadingModelName] = useState<
		string | null
	>(null);
	const [downloadingDisplayName, setDownloadingDisplayName] = useState<
		string | null
	>(null);

	useModelDownloadToast({
		modelName: downloadingModelName || "",
		displayName: downloadingDisplayName || "",
		enabled: !!downloadingModelName,
	});

	const form = useForm<GenerationFormValues>({
		resolver: zodResolver(generationSchema),
		defaultValues: {
			text: "",
			language: "en",
			seed: undefined,
			instruct: "",
			engine: resolvedEngine,
			personality: false,
			temperature: undefined,
			emotion: undefined,
			voiceClean: false,
			...options.defaultValues,
		},
	});

	async function handleSubmit(
		data: GenerationFormValues,
		selectedProfileId: string | null,
	): Promise<void> {
		if (!selectedProfileId) {
			toast({
				title: ERR_TITLE_VALIDATION,
				description: ERR_DESC_NO_PROFILE,
				variant: "destructive",
			});
			return;
		}

		try {
			const engine =
				data.engine ??
				resolveDefaultEngine(
					queryClient.getQueryData<ModelStatusListResponse>(["modelStatus"]),
					selectedEngine,
				);
			if (!engine) {
				toast({
					title: ERR_TITLE_VALIDATION,
					description:
						"No TTS engine is installed. Open the Models tab to download one before generating.",
					variant: "destructive",
				});
				return;
			}
			const modelName = (MODEL_NAME_MAP[engine]?.() ?? engine) as string;
			const displayName = modelName;

			// Check if model needs downloading
			try {
				const modelStatus = await apiClient.getModelStatus();
				const model = modelStatus.models.find(
					(m) => m.model_name === modelName,
				);

				if (model?.entitled && !model.downloaded) {
					setDownloadingModelName(modelName);
					setDownloadingDisplayName(displayName);
				}
			} catch (error) {
				showStudioErrorToast(error);
			}

			// instruct reaches the backend only for models that can act on it:
			// supports_instruct or emotion_control (instruct-as-emotion-tag for
			// styletts2/orpheus).
			const modelStatusCache =
				queryClient.getQueryData<ModelStatusListResponse>(["modelStatus"]);
			const capModel = modelStatusCache?.models.find(
				(m) => (m.engine ?? m.model_name) === engine,
			);
			const supportsInstruct = Boolean(
				capModel?.emotion_control || capModel?.supports_instruct,
			);
			const effectsChain = options.getEffectsChain?.();
			// This now returns immediately with status="generating"
			const result = await generation.mutateAsync({
				profile_id: selectedProfileId,
				text: data.text,
				language: data.language,
				seed: data.seed,
				engine,
				instruct: supportsInstruct ? data.instruct || undefined : undefined,
				temperature: data.temperature,
				personality: data.personality || undefined,
				max_chunk_chars: maxChunkChars,
				crossfade_ms: crossfadeMs,
				normalize: normalizeAudio,
				effects_chain: effectsChain?.length ? effectsChain : undefined,
				emotion: data.emotion || undefined,
				voice_clean: data.voiceClean || undefined,
				streaming: true,
				use_cloud: engine === "cloud",
			});

			// Track this generation for SSE status updates
			addPendingGeneration(result.id);

			// Reset form immediately — user can start typing again
			form.reset({
				text: "",
				language: data.language,
				seed: undefined,
				instruct: "",
				engine: data.engine,
				personality: data.personality,
				temperature: data.temperature,
				emotion: undefined,
				voiceClean: data.voiceClean,
			});
			options.onSuccess?.(result.id);
		} catch (error) {
			showStudioErrorToast(error);
			// Disarm only on error: on success the download-toast must stay
			// armed so it can track the real download to completion (it
			// dismisses itself on the terminal progress event).
			setDownloadingModelName(null);
			setDownloadingDisplayName(null);
		}
	}

	return {
		form,
		handleSubmit,
		isPending: generation.isPending,
	};
}
