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
import { ModelOfferings } from "./ModelOfferings";
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
} from "./voiceDesignOptions";

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
			<ModelOfferings models={capabilities?.all_models} />
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
				if (attr === "accent") {
					return (
						<AccentField
							key={attr}
							form={form}
							help={current?.attributes_help?.[attr]}
						/>
					);
				}
				if (attr === "style") {
					return (
						<StyleField
							key={attr}
							form={form}
							help={current?.attributes_help?.[attr]}
						/>
					);
				}
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

function AccentField({
	form,
	help,
}: {
	form: UseFormReturn<DesignFormValues & Record<string, unknown>>;
	help?: string;
}) {
	return (
		<FormField
			control={form.control}
			name={"voiceAttributes.accent" as never}
			render={({ field }) => (
				<FormItem>
					<FormLabel className="text-xs">Accent / Nationality</FormLabel>
					{help ? (
						<p className="-mb-1 mt-1 text-xs text-muted-foreground/70">{help}</p>
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
								{ ...attrs, accent: v } as never,
							);
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

function StyleField({
	form,
	help,
}: {
	form: UseFormReturn<DesignFormValues & Record<string, unknown>>;
	help?: string;
}) {
	return (
		<FormField
			control={form.control}
			name={"voiceAttributes.style" as never}
			render={({ field }) => (
				<FormItem>
					<FormLabel className="text-xs">Speaking Style</FormLabel>
					{help ? (
						<p className="-mb-1 mt-1 text-xs text-muted-foreground/70">{help}</p>
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
								{ ...attrs, style: v } as never,
							);
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
	const accentValue = supported.includes("accent")
		? ((attrs as Record<string, unknown>).accent as string | undefined)
		: undefined;
	const accent = accentValue
		? (ACCENT_LABEL_BY_VALUE[accentValue] ?? accentValue)
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
