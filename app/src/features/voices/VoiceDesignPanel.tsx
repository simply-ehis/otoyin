import { useQuery } from "@tanstack/react-query";
import type { UseFormReturn } from "react-hook-form";
import { apiClient } from "@/lib/api/client";
import type { VoiceAttributes } from "@/lib/api/types";
import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/ui/form";
import { Textarea } from "@/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";

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

const ATTRIBUTE_LABELS: Record<string, string> = {
	gender: "Gender",
	age: "Age",
	accent: "Accent / Nationality",
	tone: "Tone",
	style: "Speaking Style",
	pacing: "Pacing",
};

export interface DesignFormValues {
	voiceAttributes?: VoiceAttributes;
	voiceDescription?: string;
}

/**
 * Structured voice-design panel: engine-aware attribute dropdowns plus
 * free-text notes, with a live composed-description preview.
 */
export function VoiceDesignPanel({
	form,
	designEngine,
	onSetDesignEngine,
}: {
	form: UseFormReturn<DesignFormValues & Record<string, unknown>>;
	designEngine: string;
	onSetDesignEngine: (engine: string) => void;
}) {
	const { data: capabilities } = useQuery({
		queryKey: ["voiceDesignCapabilities"],
		queryFn: () => apiClient.getVoiceDesignCapabilities(),
		staleTime: 300_000,
	});

	const engines = capabilities?.engines ?? {};
	const engineList = Object.entries(engines);
	const current = engines[designEngine];
	const supported: string[] = current?.supported_attributes ?? [
		"gender",
		"age",
		"accent",
		"tone",
		"style",
		"pacing",
	];

	return (
		<div className="flex flex-col gap-3">
			<p className="text-xs text-muted-foreground/80">
				{current?.description ??
					"Configure the voice character. Attributes compose into a description that design-capable engines use."}
			</p>
			{engineList.length > 1 ? (
				<FormItem>
					<FormLabel className="text-xs">Design engine</FormLabel>
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
			) : null}
			{engineList.length === 1 && current ? (
				<p className="flex items-center gap-2">
					<span className="rounded-full border border-accent/30 bg-secondary px-2 py-0.5 text-xs text-accent">
						{current.label}
					</span>
					<span className="text-xs text-muted-foreground/70">
						{current.design_mode === "text_description"
							? "Text-described design"
							: "Voice design"}
					</span>
				</p>
			) : null}

			{supported.map((attr) => {
				const options = ATTRIBUTE_OPTIONS[attr];
				if (!options) {
					return null;
				}
				return (
					<FormField
						key={attr}
						control={form.control}
						name={`voiceAttributes.${attr}` as never}
						render={({ field }) => (
							<FormItem>
								<FormLabel className="text-xs">
									{ATTRIBUTE_LABELS[attr] ?? attr}
								</FormLabel>
								{current?.attributes_help?.[attr] ? (
									<p className="-mb-1 mt-1 text-xs text-muted-foreground/70">
										{current.attributes_help[attr]}
									</p>
								) : null}
								<Select
									value={(field.value as string) ?? ""}
									onValueChange={(v) => {
										const attrs =
											(form.getValues(
												"voiceAttributes" as never,
											) as VoiceAttributes) ?? {};
										form.setValue(
											"voiceAttributes" as never,
											{ ...attrs, [attr]: v } as never,
										);
									}}
								>
									<FormControl>
										<SelectTrigger className="h-8 text-xs">
											<SelectValue
												placeholder={`Any ${(ATTRIBUTE_LABELS[attr] ?? attr).toLowerCase()}`}
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

			<FormField
				control={form.control}
				name={"voiceDescription" as never}
				render={({ field }) => (
					<FormItem>
						<FormLabel className="text-xs">
							Additional notes{" "}
							<span className="text-muted-foreground/60">(optional)</span>
						</FormLabel>
						<FormControl>
							<Textarea
								placeholder="Any extra details about the voice (e.g. 'slightly nasal', 'with a warm smile')"
								className="min-h-[60px] text-xs"
								{...field}
								value={(field.value as string) ?? ""}
							/>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>

			<ComposedPreview form={form} supported={supported} />
		</div>
	);
}

function ComposedPreview({
	form,
	supported,
}: {
	form: UseFormReturn<DesignFormValues & Record<string, unknown>>;
	supported: string[];
}) {
	const attrs =
		(form.watch("voiceAttributes" as never) as unknown as VoiceAttributes) ??
		{};
	const extra =
		(form.watch("voiceDescription" as never) as unknown as string) ?? "";
	const pick = (
		key: string,
		options: readonly { value: string; label: string }[],
	) =>
		options.find((o) => o.value === (attrs as Record<string, unknown>)[key])
			?.label;

	if (
		!Object.values(attrs as Record<string, unknown>).some(Boolean) &&
		!extra.trim()
	) {
		return null;
	}
	const parts: string[] = [];
	const gender = supported.includes("gender")
		? pick("gender", GENDER_OPTIONS)
		: undefined;
	const age = supported.includes("age") ? pick("age", AGE_OPTIONS) : undefined;
	const accent = supported.includes("accent")
		? pick("accent", ACCENT_OPTIONS)
		: undefined;
	if (gender) {
		parts.push(gender.toLowerCase());
	}
	if (age) {
		parts.push(age.toLowerCase());
	}
	if (accent) {
		parts.push(`${accent} accent`);
	}
	let description = parts.length > 0 ? `A ${parts.join(" ")}` : "A speaker";
	if (supported.includes("tone")) {
		const tone = pick("tone", TONE_OPTIONS);
		if (tone) {
			description += ` with a ${tone.toLowerCase()} tone`;
		}
	}
	if (supported.includes("style")) {
		const style = pick("style", STYLE_OPTIONS);
		if (style) {
			description += ` and a ${style.toLowerCase()} delivery`;
		}
	}
	if (supported.includes("pacing")) {
		const pacing = pick("pacing", PACING_OPTIONS);
		if (pacing) {
			description += ` speaking at a ${pacing.toLowerCase()} pace`;
		}
	}
	description += ".";
	if (extra.trim()) {
		description = `${description.slice(0, -1)}, ${extra.trim().toLowerCase()}.`;
	}
	return (
		<div className="rounded-sm border border-dashed border-strong bg-secondary px-3 py-2">
			<p className="mb-1 text-xs text-muted-foreground/70">
				Composed description:
			</p>
			<p className="text-xs italic text-foreground/90">{description}</p>
		</div>
	);
}
