import {
	CheckIcon,
	ChevronDownIcon,
	PlayIcon,
	SparklesIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/lib/api/client";
import type { HistoryResponse } from "@/lib/api/types";
import { useHistory } from "@/lib/hooks/useHistory";
import { debug } from "@/lib/utils/debug";
import { useEffectsStore } from "@/stores/effectsStore";
import { usePlayerStore } from "@/stores/playerStore";
import { Button } from "@/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
} from "@/ui/dialog";
import { Field, Input, SearchInput, Textarea } from "@/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { Label, Separator } from "@/ui/primitives";
import { EmptyState } from "@/ui/states";
import { ChainEditor } from "./ChainEditor";

/** Generation picker for effect previews (completed only, searchable). */
function GenerationPicker({
	selectedId,
	onSelect,
	className,
}: {
	selectedId: string | null;
	onSelect: (gen: HistoryResponse) => void;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const { data } = useHistory({ limit: 50 });
	const completed = (data?.items ?? []).filter((g) => g.status === "completed");
	const q = query.trim().toLowerCase();
	const filtered = completed.filter(
		(g) =>
			!q ||
			g.text.toLowerCase().includes(q) ||
			g.profile_name.toLowerCase().includes(q),
	);
	const selected = completed.find((g) => g.id === selectedId);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="outline" size="sm" className={className}>
					<span className="min-w-0 flex-1 truncate text-left">
						{selected ? (
							<>
								<span className="font-medium">{selected.profile_name}</span>
								<span className="ml-1.5 text-muted-foreground">
									{selected.text.length > 30
										? `${selected.text.slice(0, 30)}…`
										: selected.text}
								</span>
							</>
						) : (
							<span className="text-muted-foreground">
								Select a generation…
							</span>
						)}
					</span>
					<ChevronDownIcon
						className="h-3.5 w-3.5 shrink-0 opacity-60"
						aria-hidden="true"
					/>
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-80 p-0" align="start">
				<div className="border-b border-border p-2">
					<SearchInput
						aria-label="Search generations"
						placeholder="Search by voice or text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onClear={() => setQuery("")}
						className="[&_input]:h-8 [&_input]:text-xs"
					/>
				</div>
				<ul className="max-h-60 overflow-y-auto">
					{filtered.length === 0 ? (
						<li className="p-4 text-center text-xs text-muted-foreground">
							No generations found
						</li>
					) : (
						filtered.map((gen) => (
							<li key={gen.id}>
								<button
									type="button"
									onClick={() => {
										onSelect(gen);
										setOpen(false);
										setQuery("");
									}}
									className="w-full border-b border-border px-3 py-2 text-left transition-colors last:border-0 hover:bg-secondary"
								>
									<p className="text-sm font-medium text-foreground">
										{gen.profile_name}
									</p>
									<p className="truncate text-xs text-muted-foreground">
										{gen.text.length > 60
											? `${gen.text.slice(0, 60)}…`
											: gen.text}
									</p>
								</button>
							</li>
						))
					)}
				</ul>
			</PopoverContent>
		</Popover>
	);
}

/**
 * Preset detail: rename, chain edit, audition on a generation, save /
 * save-as / delete. Builtins are read-only except save-as-custom.
 */
export function PresetDetail() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const selectedId = useEffectsStore((s) => s.selectedPresetId);
	const creating = useEffectsStore((s) => s.isCreatingNew);
	const setCreating = useEffectsStore((s) => s.setIsCreatingNew);
	const chain = useEffectsStore((s) => s.workingChain);
	const setChain = useEffectsStore((s) => s.setWorkingChain);
	const setSelectedId = useEffectsStore((s) => s.setSelectedPresetId);
	const setAudio = usePlayerStore((s) => s.setAudioWithAutoPlay);

	// Effects that have a trim region set — shows visual feedback when trimming is active.
	const trimmedEffects = chain.filter(
		(e) => (e.trim_start_ms ?? 0) > 0 || (e.trim_end_ms ?? 0) > 0,
	);
	const hasTrim = trimmedEffects.length > 0;

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [saving, setSaving] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [saveAsOpen, setSaveAsOpen] = useState(false);
	const [saveAsName, setSaveAsName] = useState("");
	const [saveAsDescription, setSaveAsDescription] = useState("");
	const [previewId, setPreviewId] = useState<string | null>(null);
	const [previewing, setPreviewing] = useState(false);
	const blobRef = useRef<string | null>(null);

	const { data: preset } = useQuery({
		queryKey: ["effect-preset", selectedId],
		queryFn: () =>
			selectedId
				? apiClient
						.listEffectPresets()
						.then((all) => all.find((p) => p.id === selectedId) ?? null)
				: null,
		enabled: !!selectedId,
		staleTime: 30_000,
	});
	const { data: historyData } = useHistory({ limit: 1 });
	useEffect(() => {
		if (!previewId && historyData?.items?.length) {
			const first = historyData.items.find((g) => g.status === "completed");
			if (first) {
				setPreviewId(first.id);
			}
		}
	}, [historyData, previewId]);
	useEffect(
		() => () => {
			if (blobRef.current) {
				URL.revokeObjectURL(blobRef.current);
			}
		},
		[],
	);
	useEffect(() => {
		if (preset) {
			setName(preset.name);
			setDescription(preset.description ?? "");
		} else if (creating) {
			setName("");
			setDescription("");
		}
	}, [preset, creating]);

	const editing = !!selectedId || creating;
	const builtin = preset?.is_builtin ?? false;
	const displayName = preset
		? preset.is_builtin
			? t(`effects.builtinPresets.${preset.name}.name`, {
					defaultValue: preset.name,
				})
			: preset.name
		: "";

	const preview = async () => {
		if (!previewId || chain.length === 0) {
			return;
		}
		setPreviewing(true);
		try {
			const blob = await apiClient.previewEffects(previewId, chain);
			if (blobRef.current) {
				URL.revokeObjectURL(blobRef.current);
			}
			const url = URL.createObjectURL(blob);
			blobRef.current = url;
			setAudio(url, `preview-${Date.now()}`, null, "Effects Preview");
		} catch (error: unknown) {
			debug.warn("[effects] preview failed:", error);
		} finally {
			setPreviewing(false);
		}
	};

	const saveNew = async (presetName: string, presetDescription: string) => {
		if (!presetName.trim()) {
			return null;
		}
		setSaving(true);
		try {
			const created = await apiClient.createEffectPreset({
				name: presetName.trim(),
				description: presetDescription.trim() || undefined,
				effects_chain: chain,
			});
			void queryClient.invalidateQueries({ queryKey: ["effect-presets"] });
			setCreating(false);
			setSelectedId(created.id);
			return created;
		} finally {
			setSaving(false);
		}
	};

	if (!editing) {
		return (
			<EmptyState
				icon={<SparklesIcon aria-hidden="true" />}
				title={t("effects.placeholder")}
				body="Pick a preset on the left, or create a new chain."
			/>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="mb-4 flex items-center justify-between gap-3">
				<h2 className="truncate text-lg font-semibold tracking-tight text-foreground">
					{creating
						? t("effects.detail.newTitle")
						: builtin
							? displayName
							: t("effects.detail.editTitle")}
				</h2>
				<span className="flex shrink-0 items-center gap-2">
					{!builtin && !creating ? (
						<>
							<Button
								variant="ghost"
								size="sm"
								className="h-8 gap-2 text-destructive"
								disabled={deleting}
								loading={deleting}
								onClick={() => {
									if (!selectedId) {
										return;
									}
									setDeleting(true);
									apiClient
										.deleteEffectPreset(selectedId)
										.then(() => {
											void queryClient.invalidateQueries({
												queryKey: ["effect-presets"],
											});
											setSelectedId(null);
											setChain([]);
										})
										.catch((e: unknown) =>
											debug.warn("[effects] delete failed:", e),
										)
										.finally(() => setDeleting(false));
								}}
							>
								<TrashIcon className="h-3.5 w-3.5" aria-hidden="true" />
								{deleting ? t("effects.detail.deleting") : t("common.delete")}
							</Button>
							<Button
								size="sm"
								className="h-8 gap-2"
								disabled={saving || chain.length === 0}
								loading={saving}
								onClick={() => {
									if (!selectedId || !name.trim()) {
										return;
									}
									setSaving(true);
									apiClient
										.updateEffectPreset(selectedId, {
											name: name.trim(),
											description: description.trim() || undefined,
											effects_chain: chain,
										})
										.then(() => {
											void queryClient.invalidateQueries({
												queryKey: ["effect-presets"],
											});
											void queryClient.invalidateQueries({
												queryKey: ["effect-preset", selectedId],
											});
										})
										.catch((e: unknown) =>
											debug.warn("[effects] save failed:", e),
										)
										.finally(() => setSaving(false));
								}}
							>
								<CheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
								{saving ? t("effects.detail.saving") : t("common.save")}
							</Button>
						</>
					) : null}
					{creating ? (
						<Button
							size="sm"
							className="h-8 gap-2"
							disabled={saving || chain.length === 0}
							loading={saving}
							onClick={() => {
								void saveNew(name, description);
							}}
						>
							<CheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
							{saving
								? t("effects.detail.saving")
								: t("effects.detail.savePreset")}
						</Button>
					) : null}
					{builtin ? (
						<Button
							size="sm"
							variant="outline"
							className="h-8 gap-2"
							disabled={saving}
							onClick={() => {
								setSaveAsName(
									t("effects.saveAs.suggestedName", { name: displayName }),
								);
								setSaveAsDescription(description);
								setSaveAsOpen(true);
							}}
						>
							<CheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
							{saving
								? t("effects.detail.saving")
								: t("effects.detail.saveAsCustom")}
						</Button>
					) : null}
				</span>
			</div>

			<div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
				{(creating || !builtin) && (
					<div className="flex flex-col gap-3">
						<Field label={t("effects.fields.name")} htmlFor="preset-name">
							<Input
								id="preset-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder={t("effects.fields.namePlaceholder")}
								className="h-9"
							/>
						</Field>
						<Field
							label={t("effects.fields.description")}
							htmlFor="preset-description"
						>
							<Textarea
								id="preset-description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder={t("effects.fields.descriptionPlaceholder")}
								className="min-h-[60px] resize-none"
							/>
						</Field>
					</div>
				)}

				<ChainEditor value={chain} onChange={setChain} showPresets={false} />

				{hasTrim && (
					<div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-warning/20 bg-warning-soft">
						<span className="text-xs font-medium text-warning-text">
							{trimmedEffects.length} effect
							{trimmedEffects.length > 1 ? "s" : ""} trimmed
						</span>
						{trimmedEffects
							.map(
								(e) =>
									`${e.type} (${e.trim_start_ms ?? 0}–${e.trim_end_ms ?? 0} ms)`,
							)
							.join(" • ")}
					</div>
				)}

				<Separator />

				<div className="flex flex-col gap-3">
					<Label className="text-xs">{t("effects.preview.label")}</Label>
					<div className="flex items-center gap-2">
						<GenerationPicker
							selectedId={previewId}
							onSelect={(gen) => setPreviewId(gen.id)}
							className="flex-1"
						/>
						<Button
							variant="outline"
							size="sm"
							className="h-8 shrink-0 gap-2"
							disabled={!previewId || chain.length === 0 || previewing}
							loading={previewing}
							onClick={preview}
						>
							<PlayIcon className="h-3.5 w-3.5" aria-hidden="true" />
							{t("effects.preview.button")}
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						{t("effects.preview.hint")}
					</p>
				</div>
			</div>

			<Dialog open={saveAsOpen} onOpenChange={setSaveAsOpen}>
				<DialogContent>
					<DialogTitle>{t("effects.saveAs.title")}</DialogTitle>
					<DialogDescription>
						{t("effects.saveAs.description")}
					</DialogDescription>
					<div className="flex flex-col gap-3 py-2">
						<Field label={t("effects.fields.name")} htmlFor="saveas-name">
							<Input
								id="saveas-name"
								value={saveAsName}
								onChange={(e) => setSaveAsName(e.target.value)}
								placeholder={t("effects.fields.namePlaceholder")}
								className="h-9"
								autoFocus
								onKeyDown={(e) => {
									if (e.key === "Enter" && saveAsName.trim()) {
										void saveNew(saveAsName, saveAsDescription).then(
											(created) => {
												if (created) {
													setSaveAsOpen(false);
												}
											},
										);
									}
								}}
							/>
						</Field>
						<Field
							label={t("effects.fields.description")}
							htmlFor="saveas-description"
						>
							<Textarea
								id="saveas-description"
								value={saveAsDescription}
								onChange={(e) => setSaveAsDescription(e.target.value)}
								placeholder={t("effects.fields.descriptionPlaceholder")}
								className="min-h-[60px] resize-none"
							/>
						</Field>
					</div>
					<DialogFooter>
						<Button
							variant="ghost"
							onClick={() => setSaveAsOpen(false)}
							disabled={saving}
						>
							{t("common.cancel")}
						</Button>
						<Button
							onClick={() => {
								void saveNew(saveAsName, saveAsDescription).then((created) => {
									if (created) {
										setSaveAsOpen(false);
									}
								});
							}}
							disabled={saving || !saveAsName.trim()}
							loading={saving}
						>
							<CheckIcon className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
							{saving ? t("effects.detail.saving") : t("common.save")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
