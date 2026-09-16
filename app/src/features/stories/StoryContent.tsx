import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
	ArrowDownTrayIcon,
	ArrowUpTrayIcon,
	ArrowUturnLeftIcon,
	ArrowUturnRightIcon,
	BookOpenIcon,
	ClipboardDocumentIcon,
	MusicalNoteIcon,
	PlusIcon,
	SpeakerWaveIcon,
} from "@heroicons/react/24/outline";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/lib/api/client";
import { getClip } from "@/lib/clip";
import { useHistory } from "@/lib/hooks/useHistory";
import {
	useAddStoryItem,
	useCreateStory,
	useExportStoryAudio,
	useMatchStoryLoudness,
	useRedoStoryEdit,
	useRemoveStoryItem,
	useReorderStoryItems,
	useStory,
	useStoryHistoryDepth,
	useUndoStoryEdit,
} from "@/lib/hooks/useStories";
import { useStoryPlayback } from "@/lib/hooks/useStoryPlayback";
import { useGenerationStore } from "@/stores/generationStore";
import { useStoryStore } from "@/stores/storyStore";
import { useUIStore } from "@/stores/uiStore";
import { Button } from "@/ui/button";
import { SearchInput, Textarea } from "@/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { LoadingState } from "@/ui/states";
import { useToast } from "@/ui/use-toast";
import { SortableStoryChatItem } from "./StoryChatItem";

/**
 * Story content: sortable line items with playback highlight,
 * add-from-history, audio import, clip paste, export. File drops
 * anywhere import audio. Track-level editing lives in the studio.
 */
export function StoryContent() {
	const { t } = useTranslation();
	const { toast } = useToast();
	const selectedId = useStoryStore((s) => s.selectedStoryId);
	const { data: story, isLoading } = useStory(selectedId);
	const removeItem = useRemoveStoryItem();
	const reorderItems = useReorderStoryItems();
	const exportAudio = useExportStoryAudio();
	const addItem = useAddStoryItem();
	const undoEdit = useUndoStoryEdit();
	const redoEdit = useRedoStoryEdit();
	const matchLoudness = useMatchStoryLoudness();
	const createStory = useCreateStory();
	const { data: historyDepth } = useStoryHistoryDepth(selectedId);
	const addPendingGeneration = useGenerationStore(
		(s) => s.addPendingGeneration,
	);
	const pendingCount = useGenerationStore((s) => s.pendingGenerationIds.size);
	const importRef = useRef<HTMLInputElement>(null);
	const dragDepth = useRef(0);

	const [search, setSearch] = useState("");
	const [addOpen, setAddOpen] = useState(false);
	const [importing, setImporting] = useState(false);
	const [dragging, setDragging] = useState(false);
	const [scriptText, setScriptText] = useState("");
	const [generatingText, setGeneratingText] = useState(false);
	const selectedProfileId = useUIStore((s) => s.selectedProfileId);
	const { data: historyData } = useHistory();

	const isPlaying = useStoryStore((s) => s.isPlaying);
	const currentTimeMs = useStoryStore((s) => s.currentTimeMs);
	const playbackStoryId = useStoryStore((s) => s.playbackStoryId);
	useStoryPlayback(story?.items);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const sorted = useMemo(() => {
		if (!story?.items) {
			return [];
		}
		return [...story.items].sort((a, b) => a.start_time_ms - b.start_time_ms);
	}, [story?.items]);

	const available = useMemo(() => {
		if (!historyData?.items || !story) {
			return [];
		}
		const inStory = new Set(story.items.map((i) => i.generation_id));
		const q = search.toLowerCase();
		return historyData.items.filter(
			(gen) =>
				gen.status === "completed" &&
				!inStory.has(gen.id) &&
				(gen.text?.toLowerCase().includes(q) ||
					gen.profile_name?.toLowerCase().includes(q)),
		);
	}, [historyData, story, search]);

	const fail = (title: string) => (error: unknown) =>
		toast({
			title,
			description: error instanceof Error ? error.message : String(error),
			variant: "destructive",
		});

	if (!selectedId) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				<div className="text-center">
					<div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-secondary">
						<BookOpenIcon
							className="size-6 text-muted-foreground"
							aria-hidden="true"
						/>
					</div>
					<p className="mb-1 text-lg font-medium text-foreground">
						{t("storyContent.selectStory.title")}
					</p>
					<p className="mb-4 text-sm">{t("storyContent.selectStory.hint")}</p>
					<Button
						size="sm"
						onClick={() => {
							createStory.mutate(
								{ name: "New Story" },
								{
									onSuccess: (newStory) => {
										useStoryStore.getState().setSelectedStoryId(newStory.id);
									},
								},
							);
						}}
					>
						<PlusIcon className="mr-1.5 size-3.5" aria-hidden="true" />
						Create your first story
					</Button>
				</div>
			</div>
		);
	}
	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				<LoadingState label={t("storyContent.loading")} lines={5} />
			</div>
		);
	}
	if (!story) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				<div className="text-center">
					<p className="mb-2 text-lg font-medium text-foreground">
						{t("storyContent.notFound.title")}
					</p>
					<p className="text-sm">{t("storyContent.notFound.hint")}</p>
				</div>
			</div>
		);
	}

	const importFiles = async (files: FileList | File[]) => {
		for (const file of Array.from(files)) {
			setImporting(true);
			try {
				const generation = await apiClient.importAudio(file);
				await addItem.mutateAsync({
					storyId: story.id,
					data: { generation_id: generation.id },
				});
				setAddOpen(false);
			} catch (error: unknown) {
				toast({
					title: t("storyContent.toast.importFailed"),
					description: error instanceof Error ? error.message : String(error),
					variant: "destructive",
				});
			} finally {
				setImporting(false);
			}
		}
	};

	const pasteClip = async () => {
		try {
			const clip = await getClip();
			if (!clip) {
				toast({ title: t("storyContent.toast.noClip") });
				return;
			}
			addItem.mutate(
				{ storyId: story.id, data: { generation_id: clip.id } },
				{
					onSuccess: () => setAddOpen(false),
					onError: (error: unknown) =>
						toast({
							title: t("storyContent.toast.pasteFailed"),
							description:
								error instanceof Error ? error.message : String(error),
							variant: "destructive",
						}),
				},
			);
		} catch (error: unknown) {
			toast({
				title: t("storyContent.toast.pasteFailed"),
				description: error instanceof Error ? error.message : String(error),
				variant: "destructive",
			});
		}
	};

	const generateFromText = async () => {
		if (!scriptText.trim() || !selectedProfileId) {
			return;
		}
		setGeneratingText(true);
		try {
			const lines = scriptText.split("\n").filter((l) => l.trim());
			for (const line of lines) {
				const gen = await apiClient.generateSpeech({
					text: line.trim(),
					profile_id: selectedProfileId,
					language: "en" as never,
				});
				await addItem.mutateAsync({
					storyId: story.id,
					data: { generation_id: gen.id },
				});
			}
			setScriptText("");
			setAddOpen(false);
			toast({
				title: `${lines.length} line${lines.length > 1 ? "s" : ""} added to story`,
			});
		} catch (error: unknown) {
			toast({
				title: "Generation failed",
				description: error instanceof Error ? error.message : String(error),
				variant: "destructive",
			});
		} finally {
			setGeneratingText(false);
		}
	};

	return (
		<section
			aria-label={story.name}
			className="relative flex h-full min-h-0 flex-col overflow-hidden"
			onDragEnter={(e) => {
				if (!e.dataTransfer?.types.includes("Files")) {
					return;
				}
				e.preventDefault();
				dragDepth.current += 1;
				setDragging(true);
			}}
			onDragOver={(e) => {
				if (e.dataTransfer?.types.includes("Files")) {
					e.preventDefault();
				}
			}}
			onDragLeave={(e) => {
				if (!e.dataTransfer?.types.includes("Files")) {
					return;
				}
				dragDepth.current = Math.max(0, dragDepth.current - 1);
				if (dragDepth.current === 0) {
					setDragging(false);
				}
			}}
			onDrop={(e) => {
				if (!e.dataTransfer?.files?.length) {
					return;
				}
				e.preventDefault();
				dragDepth.current = 0;
				setDragging(false);
				void importFiles(e.dataTransfer.files);
			}}
		>
			<input
				ref={importRef}
				type="file"
				accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a,.aac,.webm"
				multiple
				className="hidden"
				aria-label="Import audio files"
				onChange={(e) => {
					if (e.target.files?.length) {
						void importFiles(e.target.files);
					}
					e.target.value = "";
				}}
			/>
			{dragging ? (
				<div className="pointer-events-none absolute inset-0 z-30 m-4 flex items-center justify-center rounded-md border-2 border-dashed border-accent bg-accent-muted">
					<p className="flex flex-col items-center gap-2 text-sm font-medium text-accent">
						<MusicalNoteIcon className="size-8" aria-hidden="true" />
						{t("storyContent.dropToImport")}
					</p>
				</div>
			) : null}

			<div className="flex shrink-0 items-center justify-between gap-3 px-1 pb-2">
				<div className="min-w-0">
					<h2 className="truncate text-2xl font-bold tracking-tight text-foreground">
						{story.name}
					</h2>
					{story.description ? (
						<p className="mt-1 text-sm text-muted-foreground">
							{story.description}
						</p>
					) : null}
				</div>
				<span className="flex shrink-0 items-center gap-2">
					{pendingCount > 0 ? (
						<span className="text-xs tabular-nums text-muted-foreground">
							{t("storyContent.generatingCount", { count: pendingCount })}
						</span>
					) : null}
					<Button
						variant="ghost"
						size="icon"
						className="size-8"
						disabled={
							!historyDepth || historyDepth.undo === 0 || undoEdit.isPending
						}
						title={t("storyContent.undo", { defaultValue: "Undo edit" })}
						aria-label={t("storyContent.undo", { defaultValue: "Undo edit" })}
						onClick={() =>
							undoEdit.mutate(story.id, {
								onError: (error: unknown) =>
									toast({
										title: t("storyContent.toast.undoFailed", {
											defaultValue: "Nothing to undo",
										}),
										description:
											error instanceof Error ? error.message : String(error),
										variant: "destructive",
									}),
							})
						}
					>
						<ArrowUturnLeftIcon className="size-4" aria-hidden="true" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-8"
						disabled={
							!historyDepth || historyDepth.redo === 0 || redoEdit.isPending
						}
						title={t("storyContent.redo", { defaultValue: "Redo edit" })}
						aria-label={t("storyContent.redo", { defaultValue: "Redo edit" })}
						onClick={() =>
							redoEdit.mutate(story.id, {
								onError: (error: unknown) =>
									toast({
										title: t("storyContent.toast.redoFailed", {
											defaultValue: "Nothing to redo",
										}),
										description:
											error instanceof Error ? error.message : String(error),
										variant: "destructive",
									}),
							})
						}
					>
						<ArrowUturnRightIcon className="size-4" aria-hidden="true" />
					</Button>
					{story.items.length > 1 ? (
						<Button
							variant="outline"
							size="sm"
							disabled={matchLoudness.isPending}
							title={t("storyContent.matchLoudnessTitle", {
								defaultValue:
									"Set every clip's gain so all lines play at one loudness",
							})}
							aria-label={t("storyContent.matchLoudness", {
								defaultValue: "Match loudness",
							})}
							onClick={() =>
								matchLoudness.mutate(
									{ storyId: story.id, data: {} },
									{
										onSuccess: () =>
											toast({
												title: t("storyContent.toast.loudnessMatched", {
													defaultValue: "Loudness matched across clips",
												}),
											}),
										onError: (error: unknown) =>
											toast({
												title: t("storyContent.toast.loudnessFailed", {
													defaultValue: "Match loudness failed",
												}),
												description:
													error instanceof Error
														? error.message
														: String(error),
												variant: "destructive",
											}),
									},
								)
							}
						>
							<SpeakerWaveIcon className="mr-1.5 size-4" aria-hidden="true" />
							{t("storyContent.matchLoudness", {
								defaultValue: "Match loudness",
							})}
						</Button>
					) : null}
					<Button variant="outline" size="sm" onClick={pasteClip}>
						<ClipboardDocumentIcon
							className="mr-1.5 size-4"
							aria-hidden="true"
						/>
						{t("storyContent.pasteClip")}
					</Button>
					<Popover open={addOpen} onOpenChange={setAddOpen}>
						<PopoverTrigger asChild>
							<Button variant="outline" size="sm">
								<PlusIcon className="mr-1.5 size-4" aria-hidden="true" />
								{t("storyContent.add")}
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-80 p-0" align="end">
							<div className="space-y-2 border-b border-border p-2">
								<SearchInput
									aria-label="Search generations"
									placeholder={t("storyContent.searchPlaceholder")}
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									onClear={() => setSearch("")}
									className="[&_input]:h-8 [&_input]:text-xs"
								/>
								<Button
									variant="outline"
									size="sm"
									className="w-full justify-start"
									disabled={importing}
									onClick={() => importRef.current?.click()}
								>
									<ArrowUpTrayIcon
										className="mr-1.5 size-4"
										aria-hidden="true"
									/>
									{importing
										? t("storyContent.importing")
										: t("storyContent.importAudio")}
								</Button>
								{selectedProfileId ? (
									<>
										<Textarea
											placeholder="Type or paste dialogue lines (one per line)"
											value={scriptText}
											onChange={(e) => setScriptText(e.target.value)}
											rows={3}
											className="min-h-[60px] max-h-[200px] overflow-y-auto resize-none text-xs"
										/>
										<Button
											size="sm"
											className="w-full"
											disabled={!scriptText.trim() || generatingText}
											onClick={() => void generateFromText()}
										>
											{generatingText
												? "Generating…"
												: `Generate & Add (${scriptText.split("\n").filter((l) => l.trim()).length} lines)`}
										</Button>
									</>
								) : (
									<p className="text-xs text-muted-foreground">
										Select a voice in Generate to type dialogue here
									</p>
								)}
							</div>
							<ul className="max-h-60 overflow-y-auto">
								{available.length === 0 ? (
									<li className="p-4 text-center text-sm text-muted-foreground">
										{search
											? t("storyContent.searchNoMatches")
											: t("storyContent.searchNoAvailable")}
									</li>
								) : (
									available.map((gen) => (
										<li key={gen.id}>
											<button
												type="button"
												onClick={() =>
													addItem.mutate(
														{
															storyId: story.id,
															data: { generation_id: gen.id },
														},
														{
															onSuccess: () => {
																setAddOpen(false);
																setSearch("");
															},
															onError: (error: unknown) =>
																toast({
																	title: t("storyContent.toast.addFailed"),
																	description:
																		error instanceof Error
																			? error.message
																			: String(error),
																	variant: "destructive",
																}),
														},
													)
												}
												className="w-full border-b border-border px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-secondary"
											>
												<p className="text-sm font-medium text-foreground">
													{gen.profile_name}
												</p>
												<p className="truncate text-xs text-muted-foreground">
													{gen.text.length > 50
														? `${gen.text.slice(0, 50)}…`
														: gen.text}
												</p>
											</button>
										</li>
									))
								)}
							</ul>
						</PopoverContent>
					</Popover>
					{story.items.length > 0 ? (
						<Button
							variant="outline"
							size="sm"
							disabled={exportAudio.isPending}
							loading={exportAudio.isPending}
							onClick={() =>
								exportAudio.mutate(
									{ storyId: story.id, storyName: story.name },
									{
										onError: (error) =>
											fail(t("storyContent.toast.exportFailed"))(error),
									},
								)
							}
						>
							<ArrowDownTrayIcon className="mr-1.5 size-4" aria-hidden="true" />
							{t("storyContent.exportAudio")}
						</Button>
					) : null}
				</span>
			</div>

			<div className="relative z-0 min-h-0 flex-1 space-y-3 overflow-y-auto">
				{sorted.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-12 text-center">
						<div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-secondary">
							<BookOpenIcon
								className="size-6 text-muted-foreground"
								aria-hidden="true"
							/>
						</div>
						<p className="mb-1 text-sm font-medium text-foreground">
							This story is empty
						</p>
						<p className="mb-4 text-xs text-muted-foreground">
							Add dialogue lines by generating from text, importing audio, or
							pasting from the clipboard.
						</p>
						<div className="flex gap-2">
							<Button size="sm" onClick={() => setAddOpen(true)}>
								<PlusIcon className="mr-1.5 size-3.5" aria-hidden="true" />
								Add first line
							</Button>
						</div>
					</div>
				) : (
					<DndContext
						sensors={sensors}
						collisionDetection={closestCenter}
						onDragEnd={(event: DragEndEvent) => {
							const { active, over } = event;
							if (!over || active.id === over.id) {
								return;
							}
							const from = sorted.findIndex(
								(i) => i.generation_id === active.id,
							);
							const to = sorted.findIndex((i) => i.generation_id === over.id);
							if (from === -1 || to === -1) {
								return;
							}
							const order = arrayMove(sorted, from, to).map(
								(i) => i.generation_id,
							);
							reorderItems.mutate(
								{ storyId: story.id, data: { generation_ids: order } },
								{
									onError: (error: unknown) =>
										toast({
											title: t("storyContent.toast.reorderFailed"),
											description:
												error instanceof Error ? error.message : String(error),
											variant: "destructive",
										}),
								},
							);
						}}
					>
						<SortableContext
							items={sorted.map((i) => i.generation_id)}
							strategy={verticalListSortingStrategy}
						>
							{sorted.map((item, index) => (
								<SortableStoryChatItem
									key={item.id}
									item={item}
									storyId={story.id}
									index={index}
									nextItemId={sorted[index + 1]?.id ?? null}
									onRemove={() =>
										removeItem.mutate(
											{ storyId: story.id, itemId: item.id },
											{
												onError: (error: unknown) =>
													toast({
														title: t("storyContent.toast.removeFailed"),
														description:
															error instanceof Error
																? error.message
																: String(error),
														variant: "destructive",
													}),
											},
										)
									}
									onRegenerate={
										item.engine === "import"
											? undefined
											: () => {
													apiClient
														.regenerateGeneration(item.generation_id)
														.then(() =>
															addPendingGeneration(item.generation_id),
														)
														.catch((error: unknown) =>
															toast({
																title: t("storyContent.toast.regenerateFailed"),
																description:
																	error instanceof Error
																		? error.message
																		: String(error),
																variant: "destructive",
															}),
														);
												}
									}
									currentTimeMs={currentTimeMs}
									isPlaying={isPlaying && playbackStoryId === story.id}
								/>
							))}
						</SortableContext>
					</DndContext>
				)}
			</div>
		</section>
	);
}
