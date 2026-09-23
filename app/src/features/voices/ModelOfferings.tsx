import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { PresetVoiceAuditionList } from "./PresetVoiceAuditionList";

export interface ModelOffering {
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
}

/**
 * What each model offers — every TTS model in one collapsible matrix.
 * Badges make clone/design/presets/languages scannable without opening
 * each Store card.
 */
export function ModelOfferings({ models }: { models?: ModelOffering[] }) {
	const [open, setOpen] = useState(false);
	// Downloaded flags come from the shared model-status cache (no extra
	// fetch), keyed by model — sibling configs sharing an engine must not
	// all read as downloaded when only one of them is.
	const { data: modelStatus } = useQuery({
		queryKey: ["modelStatus"],
		queryFn: () => apiClient.getModelStatus(),
		staleTime: 30_000,
	});
	const downloadedByModel = new Map(
		(modelStatus?.models ?? []).map((m) => [m.model_name, m.downloaded]),
	);
	if (!models || models.length === 0) {
		return null;
	}
	const designCount = models.filter((m) => m.voice_design).length;
	const cloneCount = models.filter((m) => m.clone_voice).length;
	const presetTotal = models.reduce((n, m) => n + m.preset_voice_count, 0);

	return (
		<section className="rounded-md border border-border bg-card">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
			>
				<span className="text-xs font-medium text-foreground">
					What each model offers
				</span>
				<span className="text-xs text-muted-foreground">
					{models.length} voices engines · {presetTotal} presets · {cloneCount}{" "}
					clone · {designCount} design {open ? "▴" : "▾"}
				</span>
			</button>
			{open ? (
				<ul className="flex max-h-64 flex-col gap-2 overflow-y-auto border-t border-border p-3">
					{models.map((m) => (
						<li
							key={m.model_name}
							className="rounded-sm border border-border bg-secondary/40 px-2.5 py-2"
						>
							<p className="flex items-center justify-between gap-2">
								<span className="truncate text-xs font-medium text-foreground">
									{m.display_name}
								</span>
								<span className="shrink-0 text-xs text-muted-foreground"></span>
							</p>
							<p className="mt-0.5 text-xs text-muted-foreground">
								{m.languages.join(", ").toUpperCase()} · {m.engine}
								{m.preset_voice_count > 0
									? ` · ${m.preset_voice_count} presets`
									: " · no presets"}
							</p>
							<p className="mt-1.5 flex flex-wrap gap-1">
								{m.clone_voice ? <Chip tone="accent">Clone</Chip> : null}
								{m.voice_design ? <Chip tone="accent">Design</Chip> : null}
								{m.preset_voice_count > 0 ? (
									<Chip>{m.preset_voice_count} voices</Chip>
								) : null}
								{m.supports_voice_mixing ? <Chip>Mix</Chip> : null}
								{m.emotion_control ? <Chip>Emotion</Chip> : null}
								{m.paralinguistic_tags ? <Chip>Tags</Chip> : null}
								{m.supports_instruct ? <Chip>Instruct</Chip> : null}
								{m.supported_tags.slice(0, 3).map((t) => (
									<Chip key={t}>{t}</Chip>
								))}
							</p>
							{m.preset_voices.length > 0 ? (
								<div className="mt-1.5">
									<PresetVoiceAuditionList
										engine={m.engine}
										voices={m.preset_voices}
										downloaded={downloadedByModel.get(m.model_name) ?? false}
									/>
								</div>
							) : null}
						</li>
					))}
				</ul>
			) : null}
		</section>
	);
}

function Chip({
	children,
	tone,
}: {
	children: React.ReactNode;
	tone?: "accent";
}) {
	return (
		<span
			className={cn(
				"rounded-full border border-border bg-secondary px-1.5 py-0.5 text-xs",
				tone === "accent"
					? "border-accent/30 text-accent"
					: "text-muted-foreground",
			)}
		>
			{children}
		</span>
	);
}
