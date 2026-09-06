import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { FormControl } from "@/components/ui/form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api/client";
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
import { showStudioErrorToast } from "@/lib/errors";
import type { GenerationFormValues } from "@/lib/hooks/useGenerationForm";

const ENGINE_OPTIONS = ALL_ENGINES.map((engine) => ({
	value: engine,
	label:
		engine === CLOUD_ENGINE
			? "Cloud (BYOK)"
			: (TTS_ENGINES as Record<string, string>)[engine],
	engine,
})) satisfies readonly { value: string; label: string; engine: string }[];

const ENGINE_DESCRIPTIONS: Record<string, string> = {
	kokoro:
		"82M params, CPU realtime, 45 preset voices, 8 languages, voice mixing",
	fish_speech: "0.5B, cloning, 40+ emotion markers, 13 languages",
	fish_speech_s2:
		"4.5B Dual-AR, 10 languages, voice cloning, [emotion] tags, GPU (s2.cpp)",
	zonos: "Clone + 8D emotion vector, 5 languages, 44.1kHz",
	qwen3_tts: "10 languages, voice cloning, 24kHz, CPU (llama-tts)",
	bark_small: "13 languages, 26 preset voices, 24kHz, CPU (CrispASR)",
	styletts2: "Fast, high-quality cloning (English)",
	chattts: "Seed-based voices, [laugh]/[cry]/[sigh] tags, EN+CN",
	f5_tts: "Flow-matching cloning, EN+CN",
	pocket_tts: "20 preset voices, cloning, 6 languages, CPU",
	parler_tts: "14 preset speakers, text-described voice design, Apache 2.0",
	moss_tts_nano: "100M ONNX, zero-shot clone, 20+ languages",
	kitten_tts: "80MB, 8 preset voices, CPU-only, Apache 2.0",
	neutts: "GGUF (Q4), instant clone, CPU-only, Apache 2.0",
	neutts_2e: "Emotion-aware, 4 preset speakers, 7 emotions, voice cloning",
	orpheus: "3B GGUF, 8 preset voices, inline emotion tags, SNAC 24kHz",
	cloud:
		"Uses your configured BYOK cloud provider \u2014 no local model download.",
};

/**
 * Capability lookup sourced from the live model status cache (['modelStatus']).
 * Falls back to a safe default when status isn't loaded yet.
 */
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

type EngineOption = (typeof ENGINE_OPTIONS)[number];

/** Engines selectable right now: compatible with the profile AND downloaded. */
function getSelectableOptions(
	selectedProfile?: VoiceProfileResponse | null,
	downloaded?: Set<string>,
): EngineOption[] {
	let opts: EngineOption[] = [...ENGINE_OPTIONS];
	if (selectedProfile) {
		opts = opts.filter((opt) =>
			isProfileCompatibleWithEngine(selectedProfile, opt.engine),
		);
	}
	if (downloaded) {
		opts = opts.filter((opt) => downloaded.has(opt.engine));
	}
	return opts;
}

/**
 * Engines the user can install: compatible with the profile but not yet
 * downloaded (excludes the BYOK cloud engine, which needs no download).
 * Rendered as one-tap "download needed" install chips below the selector.
 */
function getInstallableOptions(
	selectedProfile?: VoiceProfileResponse | null,
	downloaded?: Set<string>,
): EngineOption[] {
	let opts: EngineOption[] = [...ENGINE_OPTIONS];
	if (selectedProfile) {
		opts = opts.filter((opt) =>
			isProfileCompatibleWithEngine(selectedProfile, opt.engine),
		);
	}
	opts = opts.filter((opt) => opt.engine !== "cloud");
	if (downloaded) {
		opts = opts.filter((opt) => !downloaded.has(opt.engine));
	}
	return opts;
}

export function applyEngineSelection(
	form: UseFormReturn<GenerationFormValues>,
	value: string,
) {
	const engine = value as GenerationFormValues["engine"];
	form.setValue("engine", engine);
	if (ENGLISH_ONLY_ENGINES.has(value)) {
		form.setValue("language", "en");
	} else {
		const currentLang = form.getValues("language");
		const available = getLanguageOptionsForEngine(value);
		if (!available.some((l) => l.value === currentLang)) {
			form.setValue("language", available[0]?.value ?? "en");
		}
	}
}

interface EngineModelSelectorProps {
	form: UseFormReturn<GenerationFormValues>;
	compact?: boolean;
	selectedProfile?: VoiceProfileResponse | null;
}

export function EngineModelSelector({
	form,
	compact,
	selectedProfile,
}: EngineModelSelectorProps) {
	const engine = form.watch("engine");
	const selectValue = engine ?? "";
	const queryClient = useQueryClient();

	const modelStatus = queryClient.getQueryData<ModelStatusListResponse>([
		"modelStatus",
	]);
	const downloaded = new Set(
		(modelStatus?.models ?? [])
			.filter((m) => m.downloaded && m.category === "tts" && m.engine)
			.map((m) => m.engine as string),
	);

	const selectableOptions = getSelectableOptions(selectedProfile, downloaded);
	const installableOptions = getInstallableOptions(selectedProfile, downloaded);

	const currentEngineAvailable = selectableOptions.some(
		(opt) => opt.value === selectValue,
	);

	const handleEngineChange = useCallback(
		(v: string) => {
			applyEngineSelection(form, v);
			// Load-on-switch: offload the previous TTS provider and load the newly
			// selected one immediately (single resident slot enforced server-side).
			// Only attempt when the model is already downloaded; otherwise the user
			// must fetch it from the Downloads page first (generation enforces this).
			const status = queryClient.getQueryData<ModelStatusListResponse>([
				"modelStatus",
			]);
			const model = status?.models?.find(
				(m) => (m.engine ?? m.model_name) === v,
			);
			if (model?.downloaded) {
				void apiClient.loadModel(v).catch((err) => showStudioErrorToast(err));
			}
		},
		[form, queryClient],
	);

	useEffect(() => {
		if (!currentEngineAvailable && selectableOptions.length > 0) {
			applyEngineSelection(form, selectableOptions[0].value);
		}
	}, [selectableOptions, currentEngineAvailable, form]);

	const itemClass = compact ? "text-xs text-muted-foreground" : undefined;
	const triggerClass = compact
		? "h-8 text-xs bg-card border-border rounded-full hover:bg-accent transition-colors"
		: undefined;

	return (
		<div className="flex flex-col gap-1.5">
			{!compact && (
				<span className="text-xs text-muted-foreground font-medium">
					Engine
				</span>
			)}
			<Select
				value={selectValue || undefined}
				onValueChange={handleEngineChange}
			>
				<FormControl>
					<SelectTrigger className={triggerClass}>
						<SelectValue placeholder="No engine installed" />
					</SelectTrigger>
				</FormControl>
				<SelectContent>
					{selectableOptions.length === 0 ? (
						<div className="px-2 py-1.5 text-xs text-muted-foreground">
							Download a TTS model to generate
						</div>
					) : (
						selectableOptions.map((opt) => (
							<SelectItem
								key={opt.value}
								value={opt.value}
								className={itemClass}
							>
								{opt.label}
							</SelectItem>
						))
					)}
				</SelectContent>
			</Select>

			{installableOptions.length > 0 && (
				<div className="flex items-center gap-1 text-xs text-muted-foreground">
					<span>
						{installableOptions.length} engine
						{installableOptions.length > 1 ? "s" : ""} not installed
					</span>
					<Link to="/store" className="text-accent hover:underline">
						Get from Store
					</Link>
				</div>
			)}
		</div>
	);
}

/** Returns a human-readable description for the currently selected engine. */
export function getEngineDescription(engine: string): string {
	return ENGINE_DESCRIPTIONS[engine] ?? "";
}

/**
 * Check if a profile is compatible with the currently selected engine.
 * Useful for UI hints.
 */
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
	return true; // designed — future
}

const CAPABILITY_LABELS: Record<keyof EngineCapabilities, string> = {
	clone_voice: "Cloning",
	emotion_control: "Emotion",
	paralinguistic_tags: "Paralinguistic tags",
	voice_design: "Voice design",
	supports_editing: "Speech editing",
	gpu_only: "GPU only",
	supported_tags: "Supported tags",
	supports_instruct: "Instruct",
};

const CAPABILITY_HELP: {
	key: keyof EngineCapabilities;
	title: string;
	body: string;
}[] = [
	{
		key: "clone_voice",
		title: "Voice cloning",
		body: "Learns a target voice from a short reference clip (sample or capture) and reproduces it on new text.",
	},
	{
		key: "emotion_control",
		title: "Emotion / instruct control",
		body: "Accepts an additive instruction (tone, mood, pacing) layered on top of the main text via the instruct field.",
	},
	{
		key: "paralinguistic_tags",
		title: "Paralinguistic tags",
		body: "Supports inline [tag] markers like [laugh], [cough], [sad] inside the text to shape delivery.",
	},
	{
		key: "voice_design",
		title: "Voice design",
		body: "Generates a voice from a text description (speaker style) instead of a reference clip.",
	},
	{
		key: "supports_editing",
		title: "Speech editing",
		body: "Edits existing audio — clone, re-emotion, or rewrite segments in place rather than synthesizing from scratch.",
	},
	{
		key: "gpu_only",
		title: "GPU only",
		body: "Requires an NVIDIA CUDA GPU on Linux. Unavailable on CPU-only or macOS machines.",
	},
];

/**
 * Inline capability chips for the currently selected engine, with a `?`
 * button that opens a modal explaining each capability. Chips reflect the
 * live model status from getModelStatus() via useEngineCapabilities().
 */
export function EngineCapabilitiesChips({ engine }: { engine: string }) {
	const caps = useEngineCapabilities()[engine];
	const [helpOpen, setHelpOpen] = useState(false);

	if (!caps) {
		return null;
	}

	const flags: (keyof EngineCapabilities)[] = [
		"clone_voice",
		"emotion_control",
		"paralinguistic_tags",
		"voice_design",
		"supports_editing",
		"gpu_only",
	];
	const active = flags.filter((f) => caps[f]);

	return (
		<div className="flex flex-wrap items-center gap-2">
			{active.map((f) => (
				<span
					key={f}
					className="rounded-full border border-accent/30 bg-accent-muted px-2 py-0.5 text-xs font-medium text-accent-foreground/80"
				>
					{CAPABILITY_LABELS[f]}
				</span>
			))}
			{caps.supported_tags.length > 0 && (
				<span
					className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground"
					title={caps.supported_tags.join(", ")}
				>
					{caps.supported_tags.slice(0, 4).join(" ")}
					{caps.supported_tags.length > 4 ? " …" : ""}
				</span>
			)}
			<Dialog open={helpOpen} onOpenChange={setHelpOpen}>
				<DialogTrigger asChild>
					<button
						type="button"
						aria-label="What do these engine capabilities mean?"
						className="ml-0.5 inline-flex size-4 items-center justify-center rounded-full border border-border text-xs text-muted-foreground hover:bg-muted/50"
					>
						?
					</button>
				</DialogTrigger>
				<DialogContent className="max-h-[80vh] overflow-y-auto">
					<DialogHeader>
						<DialogTitle>Engine capabilities</DialogTitle>
						<DialogDescription>
							What each tag on the selected engine means.
						</DialogDescription>
					</DialogHeader>
					<dl className="space-y-3">
						{CAPABILITY_HELP.map(({ key, body }) => (
							<div key={key} className="flex gap-3">
								<dt
									className={
										caps[key]
											? "shrink-0 rounded-full border border-accent/30 bg-accent-muted px-2 py-0.5 text-xs font-medium text-accent-foreground/80"
											: "shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground line-through"
									}
								>
									{CAPABILITY_LABELS[key]}
								</dt>
								<dd className="text-xs text-muted-foreground">{body}</dd>
							</div>
						))}
					</dl>
				</DialogContent>
			</Dialog>
		</div>
	);
}
