import {
	AdjustmentsHorizontalIcon,
	ArrowUpTrayIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	SparklesIcon,
	Squares2X2Icon,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/lib/api/client";
import type { EffectPresetResponse } from "@/lib/api/types";
import { getLanguageOptionsForEngine } from "@/lib/constants/languages";
import { useGenerationForm } from "@/lib/hooks/useGenerationForm";
import { useProfile, useProfiles } from "@/lib/hooks/useProfiles";
import { cn } from "@/lib/utils/cn";
import { useGenerationStore } from "@/stores/generationStore";
import { useUIStore } from "@/stores/uiStore";
import { Button } from "@/ui/button";
import { Switch } from "@/ui/controls";
import { FormProvider } from "@/ui/form";
import { Field, Textarea } from "@/ui/input";
import { Label } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { Slider } from "@/ui/slider";
import { useToast } from "@/ui/use-toast";
import { buildEffectsChain } from "./buildEffectsChain";
import {
	applyEngineSelection,
	EMOTION_OPTIONS,
	installableEngines,
	selectableEngines,
	useDownloadedEngines,
	useEngineCapabilities,
	VOICE_TYPE_LABELS,
} from "./engines";

/**
 * Voice-to-text composer: text, voice, language, emotion, engine,
 * temperature, effects, cleanup — one primary Generate action that
 * becomes Cancel while work is pending. Fresh layout; same backend
 * contract as the old generate box (useGenerationForm submit,
 * submit-time effects resolution, story add deferral).
 */
export function Composer({ storyId }: { storyId?: string | null }) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { toast } = useToast();
	const queryClient = useQueryClient();
	const selectedProfileId = useUIStore((s) => s.selectedProfileId);
	const setSelectedProfileId = useUIStore((s) => s.setSelectedProfileId);
	const setSelectedEngine = useUIStore((s) => s.setSelectedEngine);
	const addPendingStoryAdd = useGenerationStore((s) => s.addPendingStoryAdd);
	const { data: profiles } = useProfiles();
	const { data: selectedProfile } = useProfile(selectedProfileId ?? "");

	const [presetId, setPresetId] = useState<string | null>(null);
	const [instructOpen, setInstructOpen] = useState(false);
	const [expanded, setExpanded] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [cancelling, setCancelling] = useState(false);
	const [dragOver, setDragOver] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const dropRef = useRef<HTMLDivElement | null>(null);

	const { data: effectPresets } = useQuery({
		queryKey: ["effect-presets"],
		queryFn: () => apiClient.listEffectPresets(),
	});

	const composeMutation = useMutation({
		mutationFn: async () => {
			if (!selectedProfileId) {
				throw new Error("No profile selected");
			}
			return apiClient.composeWithPersonality(selectedProfileId);
		},
		onError: (err: Error) =>
			toast({
				title: t("generation.compose.failedTitle"),
				description: err.message || t("generation.compose.failedDescription"),
				variant: "destructive",
			}),
	});

	const { form, handleSubmit, isPending } = useGenerationForm({
		onSuccess: (generationId) => {
			setExpanded(false);
			if (storyId && generationId) {
				addPendingStoryAdd(generationId, storyId);
			}
		},
		getEffectsChain: () => {
			const cached = queryClient.getQueryData<EffectPresetResponse[]>([
				"effect-presets",
			]);
			return buildEffectsChain(
				presetId,
				selectedProfile,
				effectPresets ?? cached,
			);
		},
	});

	// Default-select the first voice; clear stale selections.
	useEffect(() => {
		if (!selectedProfileId && profiles && profiles.length > 0 && profiles[0]) {
			setSelectedProfileId(profiles[0].id);
			return;
		}
		if (
			selectedProfileId &&
			profiles &&
			!profiles.find((p) => p.id === selectedProfileId)
		) {
			setSelectedProfileId(
				profiles.length > 0 && profiles[0] ? profiles[0].id : null,
			);
		}
	}, [selectedProfileId, profiles, setSelectedProfileId]);

	// Sync form language/engine/effects/persona when the profile changes.
	const lastSynced = useRef<string | null | undefined>(undefined);
	useEffect(() => {
		const id = selectedProfile?.id;
		if (id === lastSynced.current) {
			return;
		}
		lastSynced.current = id;
		if (selectedProfile?.language) {
			form.setValue("language", selectedProfile.language as never);
		}
		const engine =
			selectedProfile?.default_engine ?? selectedProfile?.preset_engine;
		if (engine) {
			form.setValue("engine", engine as never);
		}
		if (
			selectedProfile?.effects_chain &&
			selectedProfile.effects_chain.length > 0
		) {
			const match = effectPresets?.find(
				(p) =>
					JSON.stringify(p.effects_chain) ===
					JSON.stringify(selectedProfile.effects_chain),
			);
			setPresetId(match ? match.id : "_profile");
		} else if (selectedProfile) {
			setPresetId(null);
		}
		if (selectedProfile && !selectedProfile.personality?.trim()) {
			form.setValue("personality", false);
		}
	}, [selectedProfile, effectPresets, form]);

	const engine = form.watch("engine") as string | undefined;
	const caps = useEngineCapabilities()[engine ?? ""];
	const supportsInstruct = !!(caps?.emotion_control || caps?.supports_instruct);
	const tags = caps?.paralinguistic_tags ? (caps.supported_tags ?? []) : [];
	useEffect(() => {
		if (engine) {
			setSelectedEngine(engine);
		}
	}, [engine, setSelectedEngine]);
	useEffect(() => {
		form.setValue("supportsInstruct", supportsInstruct);
	}, [form, supportsInstruct]);

	const downloaded = useDownloadedEngines(selectedProfile);
	const engineOptions = selectableEngines(selectedProfile, downloaded);
	const installable = installableEngines(selectedProfile, downloaded);
	const text = form.watch("text") ?? "";
	const temperature = form.watch("temperature");
	const tempAuto = temperature == null;
	const { ref: textRef, ...textRest } = form.register("text");

	const insertTag = (tag: string) => {
		const cur = form.getValues("text") ?? "";
		const el = textareaRef.current;
		const start = el?.selectionStart ?? cur.length;
		const end = el?.selectionEnd ?? cur.length;
		form.setValue("text", `${cur.slice(0, start)}${tag} ${cur.slice(end)}`, {
			shouldDirty: true,
			shouldValidate: true,
		});
		requestAnimationFrame(() => {
			if (el) {
				const pos = start + tag.length + 1;
				el.focus();
				el.setSelectionRange(pos, pos);
			}
		});
	};

	const handleFileDrop = (file: File) => {
		if (!file.name.endsWith(".txt") && !file.name.endsWith(".md")) {
			toast({
				title: "Unsupported file type",
				description: "Drop a .txt or .md file to use as script text.",
				variant: "destructive",
			});
			return;
		}
		const reader = new FileReader();
		reader.onload = (e) => {
			const content = e.target?.result;
			if (typeof content === "string") {
				form.setValue("text", content, {
					shouldDirty: true,
					shouldValidate: true,
				});
				setExpanded(true);
			}
		};
		reader.readAsText(file);
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setDragOver(false);
		const file = e.dataTransfer.files[0];
		if (file) {
			handleFileDrop(file);
		}
	};

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		setDragOver(true);
	};

	const handleDragLeave = (e: React.DragEvent) => {
		e.preventDefault();
		setDragOver(false);
	};

	const cancelLatest = async () => {
		const ids = [...useGenerationStore.getState().pendingGenerationIds];
		const latest = ids[ids.length - 1];
		if (!latest) {
			return;
		}
		setCancelling(true);
		try {
			await apiClient.cancelGeneration(latest);
			useGenerationStore.getState().removePendingGeneration(latest);
		} catch (e: unknown) {
			toast({
				title: "Cancel failed",
				description:
					e instanceof Error ? e.message : "Could not cancel generation",
				variant: "destructive",
			});
		} finally {
			setCancelling(false);
		}
	};

	return (
		<section
			aria-label="Generate"
			className="rounded-md border border-border bg-card p-4"
		>
			<h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
				<SparklesIcon className="size-4 text-accent" aria-hidden="true" />
				Generate
			</h2>
			<FormProvider {...form}>
				<form
					onSubmit={form.handleSubmit((data) =>
						handleSubmit(data, selectedProfileId),
					)}
					className="mt-3 flex flex-col gap-3"
				>
					{tags.length > 0 ? (
						<ul
							className="flex flex-wrap gap-1.5"
							aria-label="Insert voice tag"
						>
							{tags.map((tag) => (
								<li key={tag}>
									<button
										type="button"
										onClick={() => insertTag(tag)}
										title={`Insert ${tag}`}
										className="rounded-full border border-accent/30 bg-secondary px-2.5 py-0.5 font-mono text-xs text-accent transition-colors hover:bg-secondary-hover"
									>
										{tag}
									</button>
								</li>
							))}
						</ul>
					) : null}

					<div
						ref={dropRef}
						onDrop={handleDrop}
						onDragOver={handleDragOver}
						onDragLeave={handleDragLeave}
						className={cn(
							"relative rounded-md border-2 border-dashed transition-colors",
							dragOver ? "border-accent bg-accent/5" : "border-transparent",
						)}
					>
						<Field
							label="Text to speak"
							htmlFor="composer-text"
							error={form.formState.errors.text?.message}
						>
							<Textarea
								id="composer-text"
								{...textRest}
								ref={(node) => {
									textareaRef.current = node;
									textRef(node);
								}}
								placeholder={
									selectedProfile
										? t("generation.placeholder.profile", {
												name: selectedProfile.name,
											})
										: t("generation.placeholder.selectVoice")
								}
								disabled={!selectedProfileId}
								onFocus={() => setExpanded(true)}
								rows={expanded ? 5 : 2}
								className="max-h-[300px] min-h-[64px] resize-y"
							/>
						</Field>
						{dragOver ? (
							<div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-accent/10">
								<span className="flex items-center gap-2 text-sm font-medium text-accent">
									<ArrowUpTrayIcon className="size-4" aria-hidden="true" />
									Drop .txt or .md file
								</span>
							</div>
						) : null}
					</div>
					<p className="flex items-center justify-between text-xs text-muted-foreground/70">
						<span>Drop a .txt or .md file onto the text area</span>
						<span className="tabular-nums">
							{text.length.toLocaleString()} / 50,000
						</span>
					</p>

					{instructOpen && supportsInstruct ? (
						<Field label="Delivery instruction" htmlFor="composer-instruct">
							<Textarea
								id="composer-instruct"
								{...form.register("instruct")}
								placeholder={t("generation.instruct.placeholder")}
								rows={2}
								maxLength={500}
								className="min-h-[60px]"
							/>
						</Field>
					) : null}

					{/* Collapsible settings */}
					<button
						type="button"
						onClick={() => setSettingsOpen((v) => !v)}
						className="flex w-full items-center gap-2 rounded-md border border-border bg-secondary/50 px-3 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
						aria-expanded={settingsOpen}
					>
						<AdjustmentsHorizontalIcon
							className="size-3.5"
							aria-hidden="true"
						/>
						Settings
						<span className="ml-auto">
							{settingsOpen ? (
								<ChevronUpIcon className="size-3.5" />
							) : (
								<ChevronDownIcon className="size-3.5" />
							)}
						</span>
					</button>

					{settingsOpen ? (
						<>
							<div className="grid grid-cols-2 gap-2 md:grid-cols-4">
								<Field label="Voice" htmlFor="composer-voice">
									{profiles && profiles.length === 0 ? (
										<Button
											type="button"
											variant="outline"
											size="sm"
											className="w-full"
											onClick={() => navigate({ to: "/voices" })}
										>
											Create your first voice
										</Button>
									) : (
										<Select
											value={selectedProfileId ?? ""}
											onValueChange={(v) => setSelectedProfileId(v || null)}
										>
											<SelectTrigger
												id="composer-voice"
												className="h-8 text-xs"
											>
												<SelectValue
													placeholder={t(
														"generation.voiceSelector.placeholder",
													)}
												/>
											</SelectTrigger>
											<SelectContent>
												{profiles?.map((p) => (
													<SelectItem
														key={p.id}
														value={p.id}
														className="text-xs"
													>
														{p.name} ·{" "}
														{VOICE_TYPE_LABELS[p.voice_type ?? ""] ??
															p.voice_type}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									)}
								</Field>
								<Field label="Language" htmlFor="composer-lang">
									<Select
										value={form.watch("language")}
										onValueChange={(v) => form.setValue("language", v as never)}
									>
										<SelectTrigger id="composer-lang" className="h-8 text-xs">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{getLanguageOptionsForEngine(engine ?? "").map((l) => (
												<SelectItem
													key={l.value}
													value={l.value}
													className="text-xs"
												>
													{l.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
								<Field label="Emotion" htmlFor="composer-emotion">
									<Select
										value={form.watch("emotion") || ""}
										onValueChange={(v) =>
											form.setValue("emotion", v || undefined)
										}
									>
										<SelectTrigger
											id="composer-emotion"
											className="h-8 text-xs"
										>
											<SelectValue placeholder="Emotion" />
										</SelectTrigger>
										<SelectContent>
											{EMOTION_OPTIONS.map((o) => (
												<SelectItem
													key={o.value}
													value={o.value}
													className="text-xs"
												>
													{o.label}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
								<Field label="Engine" htmlFor="composer-engine">
									<Select
										value={engine ?? ""}
										onValueChange={(v) =>
											applyEngineSelection(
												(e) => form.setValue("engine", e),
												(l) => form.setValue("language", l),
												form.getValues("language"),
												v,
											)
										}
									>
										<SelectTrigger id="composer-engine" className="h-8 text-xs">
											<SelectValue placeholder="No engine installed" />
										</SelectTrigger>
										<SelectContent>
											{engineOptions.length === 0 ? (
												<p className="px-2 py-1.5 text-xs text-muted-foreground">
													Download a TTS model to generate
												</p>
											) : (
												engineOptions.map((o) => (
													<SelectItem
														key={o.value}
														value={o.value}
														className="text-xs"
													>
														{o.label}
													</SelectItem>
												))
											)}
										</SelectContent>
									</Select>
								</Field>
							</div>
							{installable.length > 0 ? (
								<p className="text-xs text-muted-foreground">
									{installable.length} engine{installable.length > 1 ? "s" : ""}{" "}
									not installed —{" "}
									<button
										type="button"
										onClick={() => navigate({ to: "/store" })}
										className="text-accent hover:underline"
									>
										Get from Store
									</button>
								</p>
							) : null}

							<div className="grid grid-cols-2 gap-2 md:grid-cols-4">
								<div>
									<Label className="mb-1.5 block text-xs">Creativity</Label>
									<span className="flex items-center gap-2">
										<Slider
											min={0}
											max={2}
											step={0.1}
											value={[tempAuto ? 0.7 : (temperature ?? 0.7)]}
											onValueChange={([v]) => form.setValue("temperature", v)}
											aria-label="Creativity (temperature)"
											className="flex-1"
										/>
										<button
											type="button"
											title={
												tempAuto
													? "Engine default — click to set"
													: "Click to reset to auto"
											}
											onClick={() =>
												form.setValue("temperature", tempAuto ? 0.7 : undefined)
											}
											className="w-8 rounded-sm text-right text-xs tabular-nums text-muted-foreground transition-colors hover:text-foreground"
										>
											{tempAuto ? "auto" : (temperature ?? 0.7).toFixed(1)}
										</button>
									</span>
								</div>
								<Field label="Effects" htmlFor="composer-effects">
									<Select
										value={presetId ?? "none"}
										onValueChange={(v) => setPresetId(v === "none" ? null : v)}
									>
										<SelectTrigger
											id="composer-effects"
											className="h-8 text-xs"
										>
											<SelectValue placeholder={t("generation.effects.none")} />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="none" className="text-xs">
												{t("generation.effects.none")}
											</SelectItem>
											{selectedProfile?.effects_chain &&
											selectedProfile.effects_chain.length > 0 ? (
												<SelectItem value="_profile" className="text-xs">
													{t("generation.effects.profileDefault")}
												</SelectItem>
											) : null}
											{effectPresets?.map((p) => (
												<SelectItem key={p.id} value={p.id} className="text-xs">
													{p.name}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
								<div className="flex items-end pb-1">
									<Switch
										checked={!!form.watch("voiceClean")}
										label="Clean up recording artifacts"
										onCheckedChange={(v) => form.setValue("voiceClean", v)}
									/>
								</div>
								<div className="flex items-end gap-1 pb-0.5">
									{selectedProfile?.personality?.trim() ? (
										<IconRailButton
											label={
												form.watch("personality") ? "Persona on" : "Persona off"
											}
											active={!!form.watch("personality")}
											onClick={() =>
												form.setValue("personality", !form.watch("personality"))
											}
										>
											<SparklesIcon className="size-4" aria-hidden="true" />
										</IconRailButton>
									) : null}
									{supportsInstruct ? (
										<IconRailButton
											label={
												instructOpen
													? t("generation.instruct.hide")
													: t("generation.instruct.show")
											}
											active={instructOpen}
											onClick={() => setInstructOpen((v) => !v)}
										>
											<AdjustmentsHorizontalIcon
												className="size-4"
												aria-hidden="true"
											/>
										</IconRailButton>
									) : null}
									{selectedProfile?.personality?.trim() ? (
										<IconRailButton
											label="Compose from personality"
											loading={composeMutation.isPending}
											disabled={composeMutation.isPending || !selectedProfileId}
											onClick={() => {
												composeMutation.mutateAsync().then(
													(result) => {
														form.setValue("text", result.text, {
															shouldDirty: true,
														});
														setExpanded(true);
													},
													() => {},
												);
											}}
										>
											<Squares2X2Icon className="size-4" aria-hidden="true" />
										</IconRailButton>
									) : null}
								</div>
							</div>
						</>
					) : null}

					<div className="flex items-center justify-end gap-2 pt-1">
						{isPending ? (
							<Button
								type="button"
								variant="destructive"
								size="lg"
								disabled={cancelling}
								loading={cancelling}
								onClick={cancelLatest}
							>
								{cancelling ? "Cancelling…" : "Cancel generation"}
							</Button>
						) : (
							<Button type="submit" size="lg" disabled={!selectedProfileId}>
								Generate
							</Button>
						)}
					</div>
				</form>
			</FormProvider>
		</section>
	);
}

function IconRailButton({
	label,
	active,
	loading,
	disabled,
	onClick,
	children,
}: {
	label: string;
	active?: boolean;
	loading?: boolean;
	disabled?: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			aria-pressed={active}
			disabled={disabled}
			onClick={onClick}
			className={cn(
				"grid size-9 shrink-0 place-items-center rounded-md border transition-colors duration-150",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				"disabled:cursor-not-allowed disabled:opacity-40",
				active
					? "border-accent bg-accent text-white"
					: "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground",
			)}
		>
			{loading ? (
				<span
					className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
					aria-hidden="true"
				/>
			) : (
				children
			)}
		</button>
	);
}
