import { useQuery } from "@tanstack/react-query";
import type { UseFormReturn } from "react-hook-form";
import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api/client";
import type { VoiceAttributes } from "@/lib/api/types";
import type { ProfileFormValues } from "./profileFormHelpers";

// ── Option maps (matching backend _ACCENT_MAP / _GENDER_MAP / _AGE_MAP) ──

const GENDER_OPTIONS = [
	{ value: "female", label: "Female" },
	{ value: "male", label: "Male" },
	{ value: "non_binary", label: "Non-binary" },
] as const;

const AGE_OPTIONS = [
	{ value: "child", label: "Child" },
	{ value: "teen", label: "Teen" },
	{ value: "young_adult", label: "Young adult" },
	{ value: "adult", label: "Adult" },
	{ value: "middle_aged", label: "Middle-aged" },
	{ value: "senior", label: "Senior" },
] as const;

const ACCENT_OPTIONS = [
	{ value: "american", label: "American" },
	{ value: "british", label: "British" },
	{ value: "australian", label: "Australian" },
	{ value: "canadian", label: "Canadian" },
	{ value: "indian", label: "Indian" },
	{ value: "irish", label: "Irish" },
	{ value: "scottish", label: "Scottish" },
	{ value: "french", label: "French" },
	{ value: "german", label: "German" },
	{ value: "spanish", label: "Spanish" },
	{ value: "italian", label: "Italian" },
	{ value: "japanese", label: "Japanese" },
	{ value: "chinese", label: "Chinese" },
	{ value: "korean", label: "Korean" },
	{ value: "brazilian", label: "Brazilian" },
	{ value: "mexican", label: "Mexican" },
	{ value: "russian", label: "Russian" },
	{ value: "arabic", label: "Arabic" },
	{ value: "african", label: "African" },
	{ value: "caribbean", label: "Caribbean" },
	{ value: "new_zealand", label: "New Zealand" },
	{ value: "south_african", label: "South African" },
] as const;

const TONE_OPTIONS = [
	{ value: "warm", label: "Warm" },
	{ value: "bright", label: "Bright" },
	{ value: "soft", label: "Soft" },
	{ value: "deep", label: "Deep" },
	{ value: "husky", label: "Husky" },
	{ value: "clear", label: "Clear" },
	{ value: "smooth", label: "Smooth" },
	{ value: "rough", label: "Rough" },
	{ value: "raspy", label: "Raspy" },
	{ value: "silky", label: "Silky" },
	{ value: "resonant", label: "Resonant" },
	{ value: "breathy", label: "Breathy" },
	{ value: "rich", label: "Rich" },
	{ value: "light", label: "Light" },
	{ value: "mellow", label: "Mellow" },
	{ value: "crisp", label: "Crisp" },
] as const;

const STYLE_OPTIONS = [
	{ value: "formal", label: "Formal" },
	{ value: "casual", label: "Casual" },
	{ value: "enthusiastic", label: "Enthusiastic" },
	{ value: "calm", label: "Calm" },
	{ value: "dramatic", label: "Dramatic" },
	{ value: "whispered", label: "Whispered" },
	{ value: "authoritative", label: "Authoritative" },
	{ value: "friendly", label: "Friendly" },
	{ value: "narrative", label: "Narrative" },
	{ value: "conversational", label: "Conversational" },
	{ value: "newsreader", label: "Newsreader" },
	{ value: "storytelling", label: "Storytelling" },
	{ value: "energetic", label: "Energetic" },
	{ value: "soothing", label: "Soothing" },
	{ value: "commanding", label: "Commanding" },
	{ value: "gentle", label: "Gentle" },
] as const;

const PACING_OPTIONS = [
	{ value: "slow", label: "Slow" },
	{ value: "moderate", label: "Moderate" },
	{ value: "fast", label: "Fast" },
] as const;

/** Map attribute keys to their option arrays. */
const ATTRIBUTE_OPTIONS: Record<
	string,
	readonly { value: string; label: string }[]
> = {
	gender: GENDER_OPTIONS,
	age: AGE_OPTIONS,
	accent: ACCENT_OPTIONS,
	tone: TONE_OPTIONS,
	style: STYLE_OPTIONS,
	pacing: PACING_OPTIONS,
};

/** Human-readable labels for attribute keys. */
const ATTRIBUTE_LABELS: Record<string, string> = {
	gender: "Gender",
	age: "Age",
	accent: "Accent / Nationality",
	tone: "Tone",
	style: "Speaking Style",
	pacing: "Pacing",
};

interface VoiceDesignEngineCapabilities {
	label: string;
	design_mode: string;
	description: string;
	supported_attributes: string[];
	attributes_help: Record<string, string>;
}

interface VoiceDesignCapabilitiesResponse {
	engines: Record<string, VoiceDesignEngineCapabilities>;
	default_engine: string;
	composed_prompt_preview: boolean;
}

interface VoiceDesignPanelProps {
	form: UseFormReturn<ProfileFormValues>;
	designEngine: string;
	onSetDesignEngine: (engine: string) => void;
}

/**
 * Structured voice design panel — replaces the single textarea with
 * dropdowns for gender, age, accent, tone, style, and pacing.
 * Attributes are composed into a natural-language description at save time
 * and stored in voice_attributes (JSON) + design_prompt (composed text).
 *
 * Now engine-aware: fetches /profiles/voice-design-capabilities to know
 * which attributes each engine supports, and shows an engine selector.
 */
export function VoiceDesignPanel({
	form,
	designEngine,
	onSetDesignEngine,
}: VoiceDesignPanelProps) {
	const { data: capabilities } = useQuery<VoiceDesignCapabilitiesResponse>({
		queryKey: ["voiceDesignCapabilities"],
		queryFn: () => apiClient.getVoiceDesignCapabilities(),
		staleTime: 300_000,
	});

	const engines = capabilities?.engines ?? {};
	const engineList = Object.entries(engines);
	const currentEngine = engines[designEngine];
	const supportedAttrs = currentEngine?.supported_attributes ?? [
		"gender",
		"age",
		"accent",
		"tone",
		"style",
		"pacing",
	];

	return (
		<div className="space-y-3">
			<p className="text-xs text-muted-foreground/70">
				{currentEngine?.description ??
					"Configure the voice character. Attributes are composed into a description that design-capable engines use."}
			</p>

			{/* Engine selector — only shown if multiple design engines are available */}
			{engineList.length > 1 && (
				<FormItem>
					<FormLabel className="text-xs">Design Engine</FormLabel>
					<Select value={designEngine} onValueChange={onSetDesignEngine}>
						<FormControl>
							<SelectTrigger className="h-8 text-xs">
								<SelectValue />
							</SelectTrigger>
						</FormControl>
						<SelectContent>
							{engineList.map(([key, eng]) => (
								<SelectItem key={key} value={key}>
									{eng.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</FormItem>
			)}

			{/* Engine badge when only one engine available */}
			{engineList.length === 1 && currentEngine && (
				<div className="flex items-center gap-2">
					<span className="text-xs px-2 py-0.5 rounded-full bg-accent-muted text-accent-foreground border border-accent/20">
						{currentEngine.label}
					</span>
					<span className="text-xs text-muted-foreground/50">
						{currentEngine.design_mode === "text_description"
							? "Text-described design"
							: "Voice design"}
					</span>
				</div>
			)}

			{/* Dynamic attribute dropdowns — only show supported ones */}
			<div className="space-y-2">
				{supportedAttrs.map((attrKey) => {
					const options = ATTRIBUTE_OPTIONS[attrKey];
					const label = ATTRIBUTE_LABELS[attrKey] ?? attrKey;
					const helpText = currentEngine?.attributes_help?.[attrKey];
					if (!options) {
						return null;
					}

					return (
						<FormField
							key={attrKey}
							control={form.control}
							name={`voiceAttributes.${attrKey}` as keyof ProfileFormValues}
							render={({ field }) => (
								<FormItem>
									<FormLabel className="text-xs">{label}</FormLabel>
									{helpText && (
										<p className="text-xs text-muted-foreground/50 -mt-1 mb-1">
											{helpText}
										</p>
									)}
									<Select
										value={(field.value as string) ?? ""}
										onValueChange={(v) => {
											const attrs =
												(form.getValues(
													"voiceAttributes",
												) as VoiceAttributes) ?? {};
											form.setValue("voiceAttributes", {
												...attrs,
												[attrKey]: v,
											} as VoiceAttributes);
										}}
									>
										<FormControl>
											<SelectTrigger className="h-8 text-xs">
												<SelectValue
													placeholder={`Any ${label.toLowerCase()}`}
												/>
											</SelectTrigger>
										</FormControl>
										<SelectContent
											className={
												options.length > 10 ? "max-h-[240px]" : undefined
											}
										>
											{options.map((o) => (
												<SelectItem key={o.value} value={o.value}>
													{o.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>
					);
				})}
			</div>

			{/* Free-text override / additional notes */}
			<FormField
				control={form.control}
				name="voiceDescription"
				render={({ field }) => (
					<FormItem>
						<FormLabel className="text-xs">
							Additional notes{" "}
							<span className="text-muted-foreground/50">(optional)</span>
						</FormLabel>
						<FormControl>
							<Textarea
								placeholder="Any extra details about the voice (e.g. 'slightly nasal', 'with a warm smile')"
								className="min-h-[60px] text-xs"
								{...field}
							/>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>

			{/* Preview of composed description */}
			<ComposedPreview form={form} supportedAttrs={supportedAttrs} />
		</div>
	);
}

/** Live preview of the composed voice description from structured attributes. */
function ComposedPreview({
	form,
	supportedAttrs,
}: {
	form: UseFormReturn<ProfileFormValues>;
	supportedAttrs: string[];
}) {
	const attrs = (form.watch("voiceAttributes") as VoiceAttributes) ?? {};
	const extra = form.watch("voiceDescription") ?? "";

	const hasAny = Object.values(attrs).some(Boolean) || extra.trim();
	if (!hasAny) {
		return null;
	}

	const parts: string[] = [];

	if (supportedAttrs.includes("gender")) {
		const gender = GENDER_OPTIONS.find((o) => o.value === attrs.gender)?.label;
		if (gender) {
			parts.push(gender.toLowerCase());
		}
	}
	if (supportedAttrs.includes("age")) {
		const age = AGE_OPTIONS.find((o) => o.value === attrs.age)?.label;
		if (age) {
			parts.push(age.toLowerCase());
		}
	}
	if (supportedAttrs.includes("accent")) {
		const accent = ACCENT_OPTIONS.find((o) => o.value === attrs.accent)?.label;
		if (accent) {
			parts.push(`${accent} accent`);
		}
	}

	const nounParts = parts.length ? [parts.join(" ")] : [];
	const noun = nounParts.length ? nounParts.join(" ") : "Speaker";

	let description = "";
	if (noun !== "Speaker") {
		description = `A ${noun}`;
	} else {
		description = "A speaker";
	}

	if (supportedAttrs.includes("tone")) {
		const tone = TONE_OPTIONS.find((o) => o.value === attrs.tone)?.label;
		if (tone) {
			description += ` with a ${tone.toLowerCase()} tone`;
		}
	}
	if (supportedAttrs.includes("style")) {
		const style = STYLE_OPTIONS.find((o) => o.value === attrs.style)?.label;
		if (style) {
			description += ` and a ${style.toLowerCase()} delivery`;
		}
	}
	if (supportedAttrs.includes("pacing")) {
		const pacing = PACING_OPTIONS.find((o) => o.value === attrs.pacing)?.label;
		if (pacing) {
			description += ` speaking at a ${pacing.toLowerCase()} pace`;
		}
	}

	description += ".";

	if (extra.trim()) {
		description = `${description.slice(0, -1)}, ${extra.trim().toLowerCase()}.`;
	}

	return (
		<div className="rounded-md border border-dashed border-border/60 bg-secondary px-3 py-2">
			<p className="text-xs text-muted-foreground/50 mb-1">
				Composed description:
			</p>
			<p className="text-xs text-foreground/80 italic">{description}</p>
		</div>
	);
}
