import { PlusIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { RecordTakeButton } from "@/features/capture/RecordTakeButton";
import { apiClient } from "@/lib/api/client";
import type { EffectPresetResponse } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { useEffectsStore } from "@/stores/effectsStore";
import { Button } from "@/ui/button";
import { Badge, Spinner } from "@/ui/primitives";
import { EmptyState, ErrorState, ScreenHeader } from "@/ui/states";
import { PresetDetail } from "./PresetDetail";

function PresetCard({
	preset,
	selected,
	onSelect,
}: {
	preset: EffectPresetResponse;
	selected: boolean;
	onSelect: () => void;
}) {
	const { t } = useTranslation();
	const name = preset.is_builtin
		? t(`effects.builtinPresets.${preset.name}.name`, {
				defaultValue: preset.name,
			})
		: preset.name;
	const description = preset.is_builtin
		? t(`effects.builtinPresets.${preset.name}.description`, {
				defaultValue: preset.description ?? "",
			})
		: preset.description;
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-pressed={selected}
			className={cn(
				"w-full rounded-md border p-3 text-left transition-colors",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				selected
					? "border-accent bg-secondary"
					: "border-border bg-card hover:border-strong",
			)}
		>
			<p className="flex items-center gap-2">
				<SparklesIcon
					className={cn(
						"size-4 shrink-0",
						selected ? "text-accent" : "text-muted-foreground",
					)}
					aria-hidden="true"
				/>
				<span className="truncate text-sm font-medium text-foreground">
					{name}
				</span>
				{preset.is_builtin ? (
					<Badge tone="neutral">{t("effects.badge.builtin")}</Badge>
				) : null}
			</p>
			<p className="mt-1 line-clamp-1 pl-6 text-xs text-muted-foreground">
				{description || t("effects.noDescription")}
			</p>
			<p className="mt-1.5 flex items-center gap-2 pl-6 text-xs text-muted-foreground">
				<span className="tabular-nums">
					{t("effects.effectCount", { count: preset.effects_chain.length })}
				</span>
				<span className="truncate tabular-nums text-muted-foreground/70">
					{preset.effects_chain
						.filter((e) => e.enabled)
						.map((e) => e.type)
						.join(" → ")}
				</span>
			</p>
		</button>
	);
}

/**
 * Effect presets: builtin + custom lists, detail editor (chain,
 * preview on a generation, save/save-as/delete). Unsaved new preset
 * gets its own section until saved or discarded.
 */
export function EffectsTab() {
	const { t } = useTranslation();
	const selectedId = useEffectsStore((s) => s.selectedPresetId);
	const setSelectedId = useEffectsStore((s) => s.setSelectedPresetId);
	const setWorkingChain = useEffectsStore((s) => s.setWorkingChain);
	const creating = useEffectsStore((s) => s.isCreatingNew);
	const setCreating = useEffectsStore((s) => s.setIsCreatingNew);
	// Handoff params from "Send to Effects" links (?generation=<id> | ?path=<storage_path>)
	const handoff = useSearch({ from: "/effects" });

	const {
		data: presets,
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: ["effect-presets"],
		queryFn: () => apiClient.listEffectPresets(),
		staleTime: 30_000,
	});

	const builtIn = presets?.filter((p) => p.is_builtin) ?? [];
	const custom = presets?.filter((p) => !p.is_builtin) ?? [];

	return (
		<div className="flex h-full min-h-0 flex-col gap-4">
			<ScreenHeader
				title={t("effects.title")}
				helpPath="/effects"
				actions={
					<div className="flex items-center gap-2">
						<RecordTakeButton
							filenameBase="effects-test-take"
							label={t("effects.recordSample", {
								defaultValue: "Record a test sample",
							})}
						/>
						<Button
							size="sm"
							onClick={() => {
								setCreating(true);
								setWorkingChain([]);
							}}
						>
							<PlusIcon className="mr-1.5 size-4" aria-hidden="true" />
							{t("effects.newPreset")}
						</Button>
					</div>
				}
			/>
			{error ? (
				<ErrorState
					title="Couldn't load effects"
					body="Is the server running?"
					onRetry={() => void refetch()}
				/>
			) : null}
			<div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
				<div className="flex w-full max-w-[360px] shrink-0 flex-col gap-4 overflow-y-auto">
					{isLoading ? (
						<output
							className="flex items-center justify-center py-12"
							aria-label="Loading presets"
						>
							<Spinner size="md" />
						</output>
					) : (
						<>
							{builtIn.length > 0 ? (
								<section aria-label={t("effects.sections.builtin")}>
									<h3 className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
										{t("effects.sections.builtin")}
									</h3>
									<ul className="flex flex-col gap-1.5">
										{builtIn.map((p) => (
											<li key={p.id}>
												<PresetCard
													preset={p}
													selected={selectedId === p.id && !creating}
													onSelect={() => {
														setSelectedId(p.id);
														setWorkingChain(p.effects_chain);
													}}
												/>
											</li>
										))}
									</ul>
								</section>
							) : null}
							{custom.length > 0 ? (
								<section aria-label={t("effects.sections.custom")}>
									<h3 className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
										{t("effects.sections.custom")}
									</h3>
									<ul className="flex flex-col gap-1.5">
										{custom.map((p) => (
											<li key={p.id}>
												<PresetCard
													preset={p}
													selected={selectedId === p.id && !creating}
													onSelect={() => {
														setSelectedId(p.id);
														setWorkingChain(p.effects_chain);
													}}
												/>
											</li>
										))}
									</ul>
								</section>
							) : null}
							{creating ? (
								<section aria-label={t("effects.sections.new")}>
									<h3 className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
										{t("effects.sections.new")}
									</h3>
									<div className="rounded-md border-2 border-accent/40 bg-secondary p-3">
										<p className="flex items-center gap-2 text-sm font-medium text-foreground">
											<SparklesIcon
												className="size-4 text-accent"
												aria-hidden="true"
											/>
											{t("effects.unsaved.title")}
										</p>
										<p className="mt-1 text-xs text-muted-foreground">
											{t("effects.unsaved.hint")}
										</p>
									</div>
								</section>
							) : null}
							{builtIn.length === 0 && custom.length === 0 && !creating ? (
								<EmptyState
									title="No presets yet"
									body="Create your first effect chain."
								/>
							) : null}
						</>
					)}
				</div>
				<div className="min-w-0 flex-1 overflow-y-auto pr-1">
					<PresetDetail
						initialPreviewId={handoff.generation}
						previewPath={handoff.path}
					/>
				</div>
			</div>
		</div>
	);
}
