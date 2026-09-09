import {
	ArrowUpTrayIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	SparklesIcon,
} from "@heroicons/react/24/outline";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
	selectableEngines,
	useDownloadedEngines,
	useEngineCapabilities,
	VOICE_TYPE_LABELS,
} from "./engines";

/**
 * Compact prompt bar for the Generate page. Replaces the old
 * VoicePicker + Composer duo with a single inline component.
 *
 * Layout:
 *   Row 1: [Voice ▾] [Engine ▾] [Language ▾]         [Attach +]
 *   Row 2: [Textarea........................] [Generate ▶]
 *   Row 3: [More ▾] → Effects, Temp, Cleanup, Persona
 */
export function PromptBar({ storyId }: { storyId?: string | null }) {
	const { t } = useTranslation();
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
	const [moreOpen, setMoreOpen] = useState(false);
	const [cancelling, setCancelling] = useState(false);
	const [dragOver, setDragOver] = useState(false);
	const [voiceOpen, setVoiceOpen] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const fileRef = useRef<HTMLInputElement | null>(null);
	const voiceRef = useRef<HTMLDivElement | null>(null);

	const { data: effectPresets } = useQuery({
		queryKey: ["effect-presets"],
		queryFn: () => apiClient.listEffectPresets(),
	});

	const { form, handleSubmit, isPending } = useGenerationForm({
		onSuccess: (generationId) => {
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

	// Default-select the first voice
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

	// Sync form language/engine when profile changes
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
			}
		};
		reader.readAsText(file);
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
			ref={voiceRef}
			aria-label="Voice generation prompt"
			tabIndex={-1}
			className="rounded-md border border-border bg-card"
			onDrop={(e) => {
				e.preventDefault();
				setDragOver(false);
				const file = e.dataTransfer.files[0];
				if (file) {
					handleFileDrop(file);
				}
			}}
			onDragOver={(e) => {
				e.preventDefault();
				setDragOver(true);
			}}
			onDragLeave={(e) => {
				e.preventDefault();
				setDragOver(false);
			}}
		>
			{/* Row 1: Voice + Engine + Language + Attach */}
			<div className="flex items-center gap-2 border-b border-border px-3 py-2">
				{/* Voice selector */}
				<div className="relative">
					<button
						type="button"
						onClick={() => setVoiceOpen((v) => !v)}
						className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/50 px-2 py-1 text-xs transition-colors hover:bg-secondary"
						aria-expanded={voiceOpen}
						aria-haspopup="listbox"
					>
						{selectedProfile ? (
							<>
								<span className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-accent/20 text-[10px] font-medium text-accent">
									{selectedProfile.name.charAt(0).toUpperCase()}
								</span>
								<span className="max-w-[100px] truncate font-medium text-foreground">
									{selectedProfile.name}
								</span>
							</>
						) : (
							<span className="text-muted-foreground">Select voice</span>
						)}
						<ChevronDownIcon
							className={cn(
								"size-3 text-muted-foreground transition-transform",
								voiceOpen && "rotate-180",
							)}
						/>
					</button>

					{/* Voice dropdown */}
					{voiceOpen ? (
						<>
						<div
							aria-hidden="true"
							className="fixed inset-0 z-40"
							onClick={() => setVoiceOpen(false)}
							onKeyDown={(e) => {
								if (e.key === "Escape") {
									setVoiceOpen(false);
								}
							}}
						/>
							<div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-md border border-border bg-card shadow-lg">
								<div className="max-h-64 overflow-y-auto p-1.5">
									{profiles && profiles.length === 0 ? (
										<p className="px-2 py-4 text-center text-xs text-muted-foreground">
											No voices yet.{" "}
											<button
												type="button"
												onClick={() => {
													setVoiceOpen(false);
													window.location.href = "/voices";
												}}
												className="text-accent hover:underline"
											>
												Create one
											</button>
										</p>
									) : (
										profiles?.map((p) => (
											<button
												key={p.id}
												type="button"
												role="option"
												aria-selected={p.id === selectedProfileId}
												onClick={() => {
													setSelectedProfileId(p.id);
													setVoiceOpen(false);
												}}
												className={cn(
													"flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors",
													p.id === selectedProfileId
														? "bg-accent/10 text-accent"
														: "hover:bg-secondary",
												)}
											>
												<span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-accent/20 text-[10px] font-medium text-accent">
													{p.name.charAt(0).toUpperCase()}
												</span>
												<div className="min-w-0 flex-1">
													<div className="flex items-center gap-1.5">
														<span className="truncate font-medium">
															{p.name}
														</span>
														<span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
															{VOICE_TYPE_LABELS[p.voice_type ?? ""] ??
																p.voice_type}
														</span>
													</div>
													<div className="text-[11px] text-muted-foreground">
														{p.language} · {p.generation_count} gen
													</div>
												</div>
											</button>
										))
									)}
								</div>
							</div>
						</>
					) : null}
				</div>

				{/* Engine selector (only if multiple) */}
				{engineOptions.length > 1 ? (
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
						<SelectTrigger
							className="h-7 w-auto min-w-[80px] text-xs"
							aria-label="Engine"
						>
							<SelectValue placeholder="Engine" />
						</SelectTrigger>
						<SelectContent>
							{engineOptions.map((o) => (
								<SelectItem key={o.value} value={o.value} className="text-xs">
									{o.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : null}

				{/* Language selector */}
				<Select
					value={form.watch("language")}
					onValueChange={(v) => form.setValue("language", v as never)}
				>
					<SelectTrigger
						className="h-7 w-auto min-w-[70px] text-xs"
						aria-label="Language"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{getLanguageOptionsForEngine(engine ?? "").map((l) => (
							<SelectItem key={l.value} value={l.value} className="text-xs">
								{l.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				{/* Paralinguistic tags */}
				{tags.length > 0 ? (
					<div className="flex flex-wrap gap-1">
						{tags.slice(0, 3).map((tag) => (
							<button
								key={tag}
								type="button"
								onClick={() => insertTag(tag)}
								title={`Insert ${tag}`}
								className="rounded-full border border-accent/30 bg-secondary px-2 py-0.5 font-mono text-[10px] text-accent transition-colors hover:bg-secondary-hover"
							>
								{tag}
							</button>
						))}
						{tags.length > 3 ? (
							<span className="self-center text-[10px] text-muted-foreground">
								+{tags.length - 3}
							</span>
						) : null}
					</div>
				) : null}

				<div className="flex-1" />

				{/* Attach button */}
				<button
					type="button"
					onClick={() => fileRef.current?.click()}
					title="Attach .txt or .md file"
					className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
				>
					<ArrowUpTrayIcon className="size-4" aria-hidden="true" />
				</button>
				<input
					ref={fileRef}
					type="file"
					accept=".txt,.md"
					className="hidden"
					onChange={(e) => {
						const f = e.target.files?.[0];
						if (f) {
						handleFileDrop(f);
					}
						e.target.value = "";
					}}
				/>
			</div>

			{/* Row 2: Textarea + Generate */}
			<FormProvider {...form}>
				<form
					onSubmit={form.handleSubmit((data) =>
						handleSubmit(data, selectedProfileId),
					)}
				>
					<div
						className={cn(
							"flex items-end gap-2 px-3 py-2 transition-colors",
							dragOver && "bg-accent/5",
						)}
					>
						<textarea
							{...textRest}
							ref={(node) => {
								textareaRef.current = node;
								textRef(node);
							}}
							placeholder={
								selectedProfile
									? `Type a script for ${selectedProfile.name}...`
									: "Select a voice, then type your script..."
							}
							disabled={!selectedProfileId}
							rows={1}
							className="min-h-[36px] max-h-[200px] flex-1 resize-none rounded-md border-0 bg-transparent px-0 py-1 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-0"
							onInput={(e) => {
								const el = e.currentTarget;
								el.style.height = "auto";
								el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
									e.preventDefault();
									form.handleSubmit((data) =>
										handleSubmit(data, selectedProfileId),
									)();
								}
							}}
						/>
						{isPending ? (
							<Button
								type="button"
								variant="destructive"
								size="sm"
								disabled={cancelling}
								onClick={cancelLatest}
								className="shrink-0"
							>
								{cancelling ? "Cancel" : "Generating…"}
							</Button>
						) : (
							<Button
								type="submit"
								size="sm"
								disabled={!selectedProfileId || !text.trim()}
								className="shrink-0"
							>
								<SparklesIcon className="mr-1 size-3.5" aria-hidden="true" />
								Generate
							</Button>
						)}
					</div>
				</form>
			</FormProvider>

			{/* Row 3: More (advanced controls) */}
			<div className="border-t border-border">
				<button
					type="button"
					onClick={() => setMoreOpen((v) => !v)}
					className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
					aria-expanded={moreOpen}
				>
					{moreOpen ? (
						<ChevronUpIcon className="size-3" />
					) : (
						<ChevronDownIcon className="size-3" />
					)}
					More
					<span className="ml-auto tabular-nums text-muted-foreground/60">
						{text.length > 0 ? `${text.length.toLocaleString()} chars` : ""}
					</span>
				</button>

				{moreOpen ? (
					<div className="space-y-2 border-t border-border px-3 py-2">
						{/* Row: Effects + Temperature */}
						<div className="flex flex-wrap items-center gap-3">
							<div className="flex items-center gap-2">
								<Label className="text-[11px]">Effects</Label>
								<Select
									value={presetId ?? "none"}
									onValueChange={(v) => setPresetId(v === "none" ? null : v)}
								>
									<SelectTrigger
										className="h-7 w-[140px] text-xs"
										aria-label="Effects preset"
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
							</div>

							<div className="flex items-center gap-2">
								<Label className="text-[11px]">Temp</Label>
								<Slider
									min={0}
									max={2}
									step={0.1}
									value={[tempAuto ? 0.7 : (temperature ?? 0.7)]}
									onValueChange={([v]) => form.setValue("temperature", v)}
									aria-label="Creativity (temperature)"
									className="w-20"
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
									className="w-8 rounded-sm text-right text-[11px] tabular-nums text-muted-foreground transition-colors hover:text-foreground"
								>
									{tempAuto ? "auto" : (temperature ?? 0.7).toFixed(1)}
								</button>
							</div>

							<div className="flex items-center gap-2">
								<Switch
									checked={!!form.watch("voiceClean")}
									label="Clean"
									onCheckedChange={(v) => form.setValue("voiceClean", v)}
								/>
							</div>

							{selectedProfile?.personality?.trim() ? (
								<button
									type="button"
									title={
										form.watch("personality") ? "Persona on" : "Persona off"
									}
									onClick={() =>
										form.setValue("personality", !form.watch("personality"))
									}
									className={cn(
										"rounded-md border px-2 py-0.5 text-[11px] transition-colors",
										form.watch("personality")
											? "border-accent bg-accent text-white"
											: "border-border text-muted-foreground hover:bg-secondary",
									)}
								>
									<SparklesIcon className="mr-1 inline size-3" />
									Persona
								</button>
							) : null}

							{supportsInstruct ? (
								<button
									type="button"
									onClick={() => setInstructOpen((v) => !v)}
									className={cn(
										"rounded-md border px-2 py-0.5 text-[11px] transition-colors",
										instructOpen
											? "border-accent bg-accent text-white"
											: "border-border text-muted-foreground hover:bg-secondary",
									)}
								>
									Instruct
								</button>
							) : null}
						</div>

						{/* Instruct textarea */}
						{instructOpen && supportsInstruct ? (
							<textarea
								{...form.register("instruct")}
								placeholder={t("generation.instruct.placeholder")}
								rows={2}
								maxLength={500}
								className="w-full resize-none rounded-md border border-border bg-secondary/30 px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
							/>
						) : null}
					</div>
				) : null}
			</div>
		</section>
	);
}
