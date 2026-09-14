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
import { ModelOfferings } from "@/features/voices/ModelOfferings";
import {
	ACCENT_GROUPS,
	ACCENT_LABEL_BY_VALUE,
	AGE_OPTIONS,
	ATTRIBUTE_LABELS,
	ATTRIBUTE_OPTIONS,
	GENDER_OPTIONS,
	PACING_OPTIONS,
	STYLE_GROUPS,
	STYLE_OPTIONS,
	TONE_OPTIONS,
} from "@/features/voices/voiceDesignOptions";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api/client";
import type { VoiceAttributes } from "@/lib/api/types";
import type { ProfileFormValues } from "./profileFormHelpers";

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
	all_models?: {
		model_name: string;
		display_name: string;
		engine: string;
		languages: string[];
		preset_voice_count: number;
		preset_voices: {
			id: string;
			name: string;
			gender?: string | null;
			language?: string | null;
		}[];
		clone_voice: boolean;
		voice_design: boolean;
		supports_voice_mixing: boolean;
		emotion_control: boolean;
		paralinguistic_tags: boolean;
		supports_instruct: boolean;
		supported_tags: string[];
		quality_score: number;
	}[];
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
			<ModelOfferings models={capabilities?.all_models} />
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
					if (attrKey === "accent") {
						return (
							<FormField
								key={attrKey}
								control={form.control}
								name={"voiceAttributes.accent" as keyof ProfileFormValues}
								render={({ field }) => (
									<FormItem>
										<FormLabel className="text-xs">Accent / Nationality</FormLabel>
										{currentEngine?.attributes_help?.accent ? (
											<p className="text-xs text-muted-foreground/50 -mt-1 mb-1">
												{currentEngine.attributes_help.accent}
											</p>
										) : null}
										<Select
											value={(field.value as string) ?? ""}
											onValueChange={(v) => {
												const attrs =
													(form.getValues(
														"voiceAttributes",
													) as VoiceAttributes) ?? {};
												form.setValue("voiceAttributes", {
													...attrs,
													accent: v,
												} as VoiceAttributes);
											}}
										>
											<FormControl>
												<SelectTrigger className="h-8 text-xs">
													<SelectValue placeholder="Any accent / nationality" />
												</SelectTrigger>
											</FormControl>
											<SelectContent className="max-h-[260px]">
												{ACCENT_GROUPS.map((g) => (
													<div key={g.label}>
														<p className="px-2 pb-0.5 pt-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
															{g.label}
														</p>
														{g.accents.map((o) => (
															<SelectItem key={o.value} value={o.value}>
																{o.label}
															</SelectItem>
														))}
													</div>
												))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
						);
					}
					if (attrKey === "style") {
						return (
							<FormField
								key={attrKey}
								control={form.control}
								name={"voiceAttributes.style" as keyof ProfileFormValues}
								render={({ field }) => (
									<FormItem>
										<FormLabel className="text-xs">Speaking Style</FormLabel>
										{currentEngine?.attributes_help?.style ? (
											<p className="text-xs text-muted-foreground/50 -mt-1 mb-1">
												{currentEngine.attributes_help.style}
											</p>
										) : null}
										<Select
											value={(field.value as string) ?? ""}
											onValueChange={(v) => {
												const attrs =
													(form.getValues(
														"voiceAttributes",
													) as VoiceAttributes) ?? {};
												form.setValue("voiceAttributes", {
													...attrs,
													style: v,
												} as VoiceAttributes);
											}}
										>
											<FormControl>
												<SelectTrigger className="h-8 text-xs">
													<SelectValue placeholder="Any speaking style" />
												</SelectTrigger>
											</FormControl>
											<SelectContent className="max-h-[260px]">
												{STYLE_GROUPS.map((g) => (
													<div key={g.label}>
														<p className="px-2 pb-0.5 pt-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
															{g.label} — {g.help}
														</p>
														{g.styles.map((o) => (
															<SelectItem key={o.value} value={o.value}>
																{o.label}
															</SelectItem>
														))}
													</div>
												))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
						);
					}
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
		const accentValue = attrs.accent as string | undefined;
		const accent = accentValue
			? (ACCENT_LABEL_BY_VALUE[accentValue] ?? accentValue)
			: undefined;
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
