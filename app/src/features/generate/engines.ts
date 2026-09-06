import { useQueryClient } from "@tanstack/react-query";
import type {
	ModelStatusListResponse,
	VoiceProfileResponse,
} from "@/lib/api/types";
import {
	ALL_ENGINES,
	CLONING_ENGINES,
	CLOUD_ENGINE,
	ENGLISH_ONLY_ENGINES,
	TTS_ENGINES,
} from "@/lib/constants/engines";
import { getLanguageOptionsForEngine } from "@/lib/constants/languages";
import type { GenerationFormValues } from "@/lib/hooks/useGenerationForm";

export interface EngineCapabilities {
	clone_voice: boolean;
	emotion_control: boolean;
	supports_instruct: boolean;
	paralinguistic_tags: boolean;
	voice_design: boolean;
	supports_editing: boolean;
	gpu_only: boolean;
	supported_tags: string[];
}

export interface EngineOption {
	value: string;
	label: string;
	engine: string;
}

const ENGINE_OPTIONS: readonly EngineOption[] = ALL_ENGINES.map((engine) => ({
	value: engine,
	label:
		engine === CLOUD_ENGINE
			? "Cloud (BYOK)"
			: ((TTS_ENGINES as Record<string, string>)[engine] ?? engine),
	engine,
}));

export const EMOTION_OPTIONS = [
	{ value: "", label: "No emotion" },
	{ value: "happy", label: "Happy" },
	{ value: "sad", label: "Sad" },
	{ value: "angry", label: "Angry" },
	{ value: "calm", label: "Calm" },
	{ value: "excited", label: "Excited" },
	{ value: "fearful", label: "Fearful" },
	{ value: "surprised", label: "Surprised" },
	{ value: "disgusted", label: "Disgusted" },
	{ value: "neutral", label: "Neutral" },
	{ value: "whisper", label: "Whisper" },
	{ value: "shout", label: "Shout" },
];

export const VOICE_TYPE_LABELS: Record<string, string> = {
	preset: "Preset",
	cloned: "Clone",
	designed: "Designed",
};

export const CAPABILITY_LABELS: Record<string, string> = {
	clone_voice: "Cloning",
	emotion_control: "Emotion",
	paralinguistic_tags: "Paralinguistic tags",
	voice_design: "Voice design",
	supports_editing: "Speech editing",
	gpu_only: "GPU only",
	supports_instruct: "Instruct",
};

export const CAPABILITY_HELP: { key: string; title: string; body: string }[] = [
	{
		key: "clone_voice",
		title: "Voice cloning",
		body: "Learns a target voice from a short reference clip and reproduces it on new text.",
	},
	{
		key: "emotion_control",
		title: "Emotion / instruct control",
		body: "Accepts an additive instruction (tone, mood, pacing) layered on top of the main text.",
	},
	{
		key: "paralinguistic_tags",
		title: "Paralinguistic tags",
		body: "Inline [tag] markers like [laugh] or [sigh] inside the text shape delivery.",
	},
	{
		key: "voice_design",
		title: "Voice design",
		body: "Generates a voice from a text description instead of a reference clip.",
	},
	{
		key: "supports_editing",
		title: "Speech editing",
		body: "Edits existing audio in place rather than synthesizing from scratch.",
	},
	{
		key: "gpu_only",
		title: "GPU only",
		body: "Requires an NVIDIA CUDA GPU. Unavailable on CPU-only machines.",
	},
];

/** Live capability map from the model-status cache (no extra fetch). */
export function useEngineCapabilities(): Record<string, EngineCapabilities> {
	const queryClient = useQueryClient();
	const data = queryClient.getQueryData<ModelStatusListResponse>([
		"modelStatus",
	]);
	const map: Record<string, EngineCapabilities> = {};
	for (const m of data?.models ?? []) {
		const key = m.engine ?? m.model_name;
		map[key] = {
			clone_voice: !!m.clone_voice,
			emotion_control: !!m.emotion_control,
			supports_instruct: !!m.supports_instruct,
			paralinguistic_tags: !!m.paralinguistic_tags,
			voice_design: !!m.voice_design,
			supports_editing: !!m.supports_editing,
			gpu_only: !!m.gpu_only,
			supported_tags: m.supported_tags ?? [],
		};
	}
	return map;
}

export function isProfileCompatibleWithEngine(
	profile: VoiceProfileResponse,
	engine: string,
): boolean {
	if (engine === "cloud") {
		return true;
	}
	const voiceType = profile.voice_type || "cloned";
	if (voiceType === "preset") {
		return profile.preset_engine === engine;
	}
	if (voiceType === "cloned") {
		return CLONING_ENGINES.has(engine);
	}
	return true;
}

/** Downloaded TTS engines, optionally filtered by profile compatibility. */
export function useDownloadedEngines(
	profile?: VoiceProfileResponse | null,
): Set<string> {
	const queryClient = useQueryClient();
	const data = queryClient.getQueryData<ModelStatusListResponse>([
		"modelStatus",
	]);
	return new Set(
		(data?.models ?? [])
			.filter((m) => m.downloaded && m.category === "tts" && m.engine)
			.filter(
				(m) =>
					!profile ||
					isProfileCompatibleWithEngine(profile, m.engine as string),
			)
			.map((m) => m.engine as string),
	);
}

export function selectableEngines(
	profile?: VoiceProfileResponse | null,
	downloaded?: Set<string>,
): EngineOption[] {
	let opts = [...ENGINE_OPTIONS];
	if (profile) {
		opts = opts.filter((opt) =>
			isProfileCompatibleWithEngine(profile, opt.engine),
		);
	}
	if (downloaded) {
		opts = opts.filter((opt) => downloaded.has(opt.engine));
	}
	return opts;
}

/** Compatible but not yet downloaded (cloud excluded — needs no download). */
export function installableEngines(
	profile?: VoiceProfileResponse | null,
	downloaded?: Set<string>,
): EngineOption[] {
	let opts = [...ENGINE_OPTIONS].filter((opt) => opt.engine !== "cloud");
	if (profile) {
		opts = opts.filter((opt) =>
			isProfileCompatibleWithEngine(profile, opt.engine),
		);
	}
	if (downloaded) {
		opts = opts.filter((opt) => !downloaded.has(opt.engine));
	}
	return opts;
}

/** Apply an engine choice: fix up language when the engine constrains it. */
export function applyEngineSelection(
	setEngine: (engine: GenerationFormValues["engine"]) => void,
	setLanguage: (language: GenerationFormValues["language"]) => void,
	currentLanguage: string,
	value: string,
) {
	setEngine(value as GenerationFormValues["engine"]);
	if (ENGLISH_ONLY_ENGINES.has(value)) {
		setLanguage("en");
		return;
	}
	const available = getLanguageOptionsForEngine(value);
	if (!available.some((l) => l.value === currentLanguage)) {
		setLanguage(
			(available[0]?.value ?? "en") as GenerationFormValues["language"],
		);
	}
}
