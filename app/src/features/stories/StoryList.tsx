import {
	ArrowDownTrayIcon,
	ArrowUpTrayIcon,
	BookOpenIcon,
	EllipsisHorizontalIcon,
	PencilIcon,
	PlusIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/lib/api/client";
import {
	useCreateStory,
	useDeleteStory,
	useStories,
	useUpdateStory,
} from "@/lib/hooks/useStories";
import { cn } from "@/lib/utils/cn";
import { downloadBlob } from "@/lib/utils/download";
import { formatDate } from "@/lib/utils/format";
import { useStoryStore } from "@/stores/storyStore";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogTitle,
} from "@/ui/alert-dialog";
import { Button } from "@/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
} from "@/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { Field, Input, SearchInput, Textarea } from "@/ui/input";
import { EmptyState, LoadingState } from "@/ui/states";
import { useToast } from "@/ui/use-toast";

/**
 * Story library rail: search, create, rename, delete (confirmed),
 * auto-select first. Selection drives the content pane + composer.
 */
export function StoryList() {
	const { t } = useTranslation();
	const { toast } = useToast();
	const { data: stories, isLoading } = useStories();
	const selectedId = useStoryStore((s) => s.selectedStoryId);
	const setSelectedId = useStoryStore((s) => s.setSelectedStoryId);
	const createStory = useCreateStory();
	const updateStory = useUpdateStory();
	const deleteStory = useDeleteStory();

	const [search, setSearch] = useState("");
	const [createOpen, setCreateOpen] = useState(false);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [editing, setEditing] = useState<{
		id: string;
		name: string;
		description?: string;
	} | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [busyStoryId, setBusyStoryId] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const queryClient = useQueryClient();

	useEffect(() => {
		if (!selectedId && stories && stories.length > 0 && stories[0]) {
			setSelectedId(stories[0].id);
		}
	}, [selectedId, stories, setSelectedId]);

	const q = search.trim().toLowerCase();
	const filtered = (stories ?? []).filter(
		(s) =>
			!q ||
			s.name.toLowerCase().includes(q) ||
			(s.description ?? "").toLowerCase().includes(q),
	);

	const exportOne = async (storyId: string, storyName: string) => {
		setBusyStoryId(storyId);
		try {
			const { blob, filename } = await apiClient.exportStory(storyId);
			downloadBlob(blob, filename);
			toast({ title: "Story exported", description: storyName });
		} catch (e: unknown) {
			toast({
				title: t("common.error"),
				description: e instanceof Error ? e.message : "Export failed",
				variant: "destructive",
			});
		} finally {
			setBusyStoryId(null);
		}
	};

	const importOne = async (file: File) => {
		try {
			const result = await apiClient.importStory(file);
			await queryClient.invalidateQueries({ queryKey: ["stories"] });
			setSelectedId(result.id);
			toast({ title: "Story imported", description: result.message });
		} catch (e: unknown) {
			toast({
				title: t("common.error"),
				description: e instanceof Error ? e.message : "Import failed",
				variant: "destructive",
			});
		}
	};

	const create = () => {
		if (!name.trim()) {
			toast({
				title: t("stories.toast.nameRequired"),
				description: t("stories.toast.nameRequiredDescription"),
				variant: "destructive",
			});
			return;
		}
		createStory.mutate(
			{ name: name.trim(), description: description.trim() || undefined },
			{
				onSuccess: (story) => {
					setSelectedId(story.id);
					setCreateOpen(false);
					setName("");
					setDescription("");
				},
				onError: (e: Error) =>
					toast({
						title: t("common.error"),
						description: e.message,
						variant: "destructive",
					}),
			},
		);
	};

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex shrink-0 items-center gap-2 px-1 pb-2">
				<h2 className="text-sm font-semibold text-foreground">Stories</h2>
				<span className="flex-1" />
				<input
					ref={fileInputRef}
					type="file"
					accept=".zip,.dstf.zip,application/zip"
					className="hidden"
					aria-label="Import story archive"
					onChange={(e) => {
						const file = e.target.files?.[0];
						e.target.value = "";
						if (file) {
							void importOne(file);
						}
					}}
				/>
				<Button
					size="sm"
					variant="outline"
					onClick={() => fileInputRef.current?.click()}
					title="Import a story from a .dstf.zip archive"
				>
					<ArrowUpTrayIcon className="mr-1.5 size-4" aria-hidden="true" />
					Import
				</Button>
				<Button size="sm" onClick={() => setCreateOpen(true)}>
					<PlusIcon className="mr-1.5 size-4" aria-hidden="true" />
					New
				</Button>
			</div>
			<SearchInput
				aria-label="Search stories"
				placeholder="Search stories…"
				value={search}
				onChange={(e) => setSearch(e.target.value)}
				onClear={() => setSearch("")}
				className="shrink-0 px-1 pb-2 [&_input]:h-8"
			/>
			<div className="min-h-0 flex-1 overflow-y-auto px-1 pb-4">
				{isLoading ? (
					<LoadingState label="Loading stories" lines={4} />
				) : filtered.length === 0 ? (
					<EmptyState
						icon={<BookOpenIcon aria-hidden="true" />}
						title={search ? "No matching stories" : "No stories yet"}
						body={
							search
								? "Try a different search."
								: "Create a story to sequence generations."
						}
					/>
				) : (
					<ul className="flex flex-col gap-1">
						{filtered.map((story) => {
							const active = story.id === selectedId;
							return (
								<li key={story.id}>
									<div
										className={cn(
											"relative block rounded-md border p-3 transition-colors",
											active
												? "border-border bg-secondary"
												: "border-transparent hover:bg-secondary",
										)}
									>
										{active ? (
											<span
												aria-hidden="true"
												className="absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-r bg-accent"
											/>
										) : null}
										<p className="flex items-center gap-2">
											<button
												type="button"
												onClick={() => setSelectedId(story.id)}
												aria-current={active ? "true" : undefined}
												aria-label={`Open ${story.name}`}
												className="min-w-0 flex-1 truncate rounded-sm text-left text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											>
												{story.name}
											</button>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<button
														type="button"
														title="Story actions"
														aria-label={`Actions for ${story.name}`}
														className="ml-auto grid size-6 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary-hover hover:text-foreground"
													>
														<EllipsisHorizontalIcon
															className="size-4"
															aria-hidden="true"
														/>
													</button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem
														disabled={busyStoryId === story.id}
														onClick={() => void exportOne(story.id, story.name)}
													>
														<ArrowDownTrayIcon
															className="mr-2 size-4"
															aria-hidden="true"
														/>
														Export (.dstf.zip)
													</DropdownMenuItem>
													<DropdownMenuItem
														onClick={() =>
															setEditing({
																id: story.id,
																name: story.name,
																description: story.description,
															})
														}
													>
														<PencilIcon
															className="mr-2 size-4"
															aria-hidden="true"
														/>
														Rename
													</DropdownMenuItem>
													<DropdownMenuItem
														className="text-destructive"
														onClick={() => setDeletingId(story.id)}
													>
														<TrashIcon
															className="mr-2 size-4"
															aria-hidden="true"
														/>
														Delete
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</p>
										{story.description ? (
											<p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
												{story.description}
											</p>
										) : null}
										<p className="mt-1 text-xs tabular-nums text-muted-foreground/70">
											{story.item_count} lines ·{" "}
											{formatDate(story.updated_at ?? story.created_at)}
										</p>
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</div>

			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent>
					<DialogTitle>New story</DialogTitle>
					<DialogDescription>
						Long-form narration, sequenced line by line.
					</DialogDescription>
					<div className="flex flex-col gap-4 py-2">
						<Field label="Name" htmlFor="story-name">
							<Input
								id="story-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="My story"
								autoFocus
							/>
						</Field>
						<Field label="Description (optional)" htmlFor="story-description">
							<Textarea
								id="story-description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								rows={2}
							/>
						</Field>
					</div>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setCreateOpen(false)}>
							{t("common.cancel")}
						</Button>
						<Button
							disabled={createStory.isPending}
							loading={createStory.isPending}
							onClick={create}
						>
							Create story
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={editing !== null}
				onOpenChange={(open) => !open && setEditing(null)}
			>
				<DialogContent>
					<DialogTitle>Rename story</DialogTitle>
					<div className="flex flex-col gap-4 py-2">
						<Field label="Name" htmlFor="story-rename">
							<Input
								id="story-rename"
								value={editing?.name ?? ""}
								onChange={(e) =>
									setEditing((prev) =>
										prev ? { ...prev, name: e.target.value } : prev,
									)
								}
								autoFocus
							/>
						</Field>
						<Field label="Description" htmlFor="story-redescription">
							<Textarea
								id="story-redescription"
								value={editing?.description ?? ""}
								onChange={(e) =>
									setEditing((prev) =>
										prev ? { ...prev, description: e.target.value } : prev,
									)
								}
								rows={2}
							/>
						</Field>
					</div>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setEditing(null)}>
							{t("common.cancel")}
						</Button>
						<Button
							disabled={updateStory.isPending}
							loading={updateStory.isPending}
							onClick={() => {
								if (!editing || !editing.name.trim()) {
									return;
								}
								updateStory.mutate(
									{
										storyId: editing.id,
										data: {
											name: editing.name.trim(),
											description: editing.description,
										},
									},
									{
										onSuccess: () => setEditing(null),
										onError: (e: Error) =>
											toast({
												title: t("common.error"),
												description: e.message,
												variant: "destructive",
											}),
									},
								);
							}}
						>
							Save
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<AlertDialog
				open={deletingId !== null}
				onOpenChange={(open) => !open && setDeletingId(null)}
			>
				<AlertDialogContent>
					<AlertDialogTitle>Delete story?</AlertDialogTitle>
					<AlertDialogDescription>
						This permanently removes the story and its line order. Generated
						audio stays in history.
					</AlertDialogDescription>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
						<AlertDialogAction
							disabled={deleteStory.isPending}
							onClick={() => {
								if (deletingId) {
									deleteStory.mutate(deletingId, {
										onSuccess: () => {
											if (selectedId === deletingId) {
												setSelectedId(null);
											}
											setDeletingId(null);
										},
										onError: (e: Error) =>
											toast({
												title: t("common.error"),
												description: e.message,
												variant: "destructive",
											}),
									});
								}
							}}
						>
							{deleteStory.isPending ? "Deleting…" : t("common.delete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
