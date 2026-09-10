import {
	ArchiveBoxIcon,
	ArrowDownTrayIcon,
	ClipboardDocumentIcon,
	FunnelIcon,
	PlayIcon,
	TagIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ClipboardPanel } from "@/features/clipboard/ClipboardPanel";
import { apiClient } from "@/lib/api/client";
import { copyClip } from "@/lib/clip";
import { showStudioErrorToast } from "@/lib/errors";
import { formatDuration, formatEngineName } from "@/lib/utils/format";
import { usePlayerStore } from "@/stores/playerStore";
import { Banner } from "@/ui/banner";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/controls";
import { Input, SearchInput } from "@/ui/input";
import { Badge, Separator } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { EmptyState, LoadingState, ScreenHeader } from "@/ui/states";

const KINDS = [
	{ value: "_all", label: "All kinds" },
	{ value: "generation", label: "Generations" },
	{ value: "capture", label: "Captures" },
	{ value: "profile_sample", label: "Samples" },
	{ value: "generation_version", label: "Versions" },
] as const;

const SORTS = [
	{ value: "newest", label: "Newest" },
	{ value: "oldest", label: "Oldest" },
	{ value: "duration", label: "Longest" },
	{ value: "name", label: "Name A-Z" },
] as const;

/**
 * Unified audio library: every generation, capture, and sample.
 * Search + kind/tag/sort filters, batch delete + tag, inline play,
 * clip copy, download. Row tag button selects the row and focuses
 * the batch tag field (no native prompt dialogs).
 */
export function LibraryTab() {
	const qc = useQueryClient();
	const [q, setQ] = useState("");
	const [kind, setKind] = useState("_all");
	const [tag, setTag] = useState("_all");
	const [sort, setSort] = useState("newest");
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [tagInput, setTagInput] = useState("");
	const [showClips, setShowClips] = useState(false);
	const tagInputRef = useRef<HTMLInputElement>(null);

	const libraryQuery = useQuery({
		queryKey: ["library", q, kind, tag, sort],
		queryFn: () =>
			apiClient.listLibrary({
				q: q || undefined,
				kind: kind !== "_all" ? kind : undefined,
				tag: tag !== "_all" ? tag : undefined,
				sort,
				page: 1,
				limit: 50,
			}),
	});
	const tagsQuery = useQuery({
		queryKey: ["library-tags"],
		queryFn: () => apiClient.listLibraryTags(),
	});

	const toggleSelect = (id: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	const batchDelete = useMutation({
		mutationFn: async () => {
			const items =
				libraryQuery.data?.items
					.filter((it) => selected.has(it.id))
					.map((it) => ({ kind: it.kind, id: it.id })) ?? [];
			return apiClient.batchDelete(items);
		},
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: ["library"] });
			setSelected(new Set());
		},
		onError: (e: unknown) => showStudioErrorToast(e),
	});

	const batchCopy = useMutation({
		mutationFn: async () => {
			const targets = (libraryQuery.data?.items ?? []).filter((it) =>
				selected.has(it.id),
			);
			for (const it of targets) {
				await copyClip({
					kind: it.kind as never,
					id: it.id,
					audioUrl: it.audio_url ?? "",
					name: it.title,
					durationMs: it.duration_ms ?? 0,
				});
			}
			return targets.length;
		},
		onSuccess: (count) => {
			void qc.invalidateQueries({ queryKey: ["clipboard-history"] });
			void qc.invalidateQueries({ queryKey: ["clipboard-live"] });
			setSelected(new Set());
			setShowClips(count > 1);
		},
		onError: (e: unknown) => showStudioErrorToast(e),
	});

	const batchTag = useMutation({
		mutationFn: async () => {
			if (!tagInput.trim()) {
				return;
			}
			const items =
				libraryQuery.data?.items
					.filter((it) => selected.has(it.id))
					.map((it) => ({ kind: it.kind, id: it.id })) ?? [];
			return apiClient.batchTag(items, {
				tag_name: tagInput.trim(),
				action: "add",
			});
		},
		onSuccess: () => {
			void qc.invalidateQueries({ queryKey: ["library"] });
			void qc.invalidateQueries({ queryKey: ["library-tags"] });
			setTagInput("");
		},
		onError: (e: unknown) => showStudioErrorToast(e),
	});

	const play = (audioUrl: string | null | undefined, id: string) => {
		if (!audioUrl) {
			return;
		}
		const resolved = apiClient.getLibraryAudioUrl({
			audio_url: audioUrl,
		} as never);
		usePlayerStore.getState().setAudioWithAutoPlay(resolved, id, null, id);
	};

	const focusTagFor = (id: string) => {
		setSelected(new Set([id]));
		requestAnimationFrame(() => tagInputRef.current?.focus());
	};

	const items = libraryQuery.data?.items ?? [];
	const total = libraryQuery.data?.total ?? 0;

	return (
		<div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
			<ScreenHeader
				title="Library"
				actions={
					<Button
						type="button"
						size="sm"
						variant={showClips ? "default" : "outline"}
						onClick={() => setShowClips((v) => !v)}
						title="Show copied clips — everything on the clipboard lives here"
						aria-label="Toggle clips library"
						aria-pressed={showClips}
					>
						<ClipboardDocumentIcon className="size-4" aria-hidden="true" />
						Clips
					</Button>
				}
			/>
			{showClips ? <ClipboardPanel /> : null}
			{libraryQuery.error ? (
				<Banner
					tone="danger"
					onDismiss={() => void libraryQuery.refetch()}
					dismissLabel="Retry loading"
				>
					Couldn&apos;t load the library — is the server running? Dismiss to
					retry.
				</Banner>
			) : null}
			<Separator />

			<div className="flex flex-wrap items-center gap-2">
				<SearchInput
					aria-label="Search library"
					placeholder="Search title or transcript…"
					value={q}
					onChange={(e) => setQ(e.target.value)}
					onClear={() => setQ("")}
					className="min-w-[200px] flex-1 [&_input]:h-8"
				/>
				<Select value={kind} onValueChange={setKind}>
					<SelectTrigger className="h-8 w-[160px]" aria-label="Kind filter">
						<SelectValue placeholder="All kinds" />
					</SelectTrigger>
					<SelectContent>
						{KINDS.map((k) => (
							<SelectItem key={k.value} value={k.value}>
								{k.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select value={sort} onValueChange={setSort}>
					<SelectTrigger className="h-8 w-[140px]" aria-label="Sort order">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{SORTS.map((s) => (
							<SelectItem key={s.value} value={s.value}>
								{s.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select value={tag} onValueChange={setTag}>
					<SelectTrigger className="h-8 w-[160px]" aria-label="Tag filter">
						<FunnelIcon className="size-3.5 opacity-60" aria-hidden="true" />
						<SelectValue placeholder="All tags" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="_all">All tags</SelectItem>
						{(tagsQuery.data ?? []).map((t) => (
							<SelectItem key={t.id} value={t.name}>
								{t.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{selected.size > 0 ? (
				<div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2 text-sm">
					<span className="text-muted-foreground">
						{selected.size} selected
					</span>
					<Button
						size="sm"
						variant="outline"
						onClick={() => batchDelete.mutate()}
						disabled={batchDelete.isPending}
						loading={batchDelete.isPending}
					>
						<TrashIcon className="mr-1 size-3.5" aria-hidden="true" />
						Delete
					</Button>
					<span className="flex items-center gap-1">
						<Input
							ref={tagInputRef}
							placeholder="Tag name"
							aria-label="Tag name for selected items"
							value={tagInput}
							onChange={(e) => setTagInput(e.target.value)}
							className="h-7 w-32"
						/>
						<Button
							size="sm"
							variant="outline"
							onClick={() => batchTag.mutate()}
							disabled={batchTag.isPending || !tagInput.trim()}
							loading={batchTag.isPending}
						>
							<TagIcon className="mr-1 size-3.5" aria-hidden="true" />
							Tag
						</Button>
					</span>
					<Button
						size="sm"
						variant="outline"
						onClick={() => batchCopy.mutate()}
						disabled={batchCopy.isPending}
						loading={batchCopy.isPending}
					>
						<ClipboardDocumentIcon
							className="mr-1 size-3.5"
							aria-hidden="true"
						/>
						Copy{selected.size > 1 ? ` ${selected.size}` : ""}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={() => setSelected(new Set())}
					>
						Clear
					</Button>
				</div>
			) : null}

			<div className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-card">
				{libraryQuery.isLoading ? (
					<LoadingState label="Loading library" lines={6} className="p-8" />
				) : items.length === 0 ? (
					<EmptyState
						icon={<ArchiveBoxIcon aria-hidden="true" />}
						title={
							total === 0
								? "Your library is empty"
								: "No audio found for this filter"
						}
						body={
							total === 0
								? "Generate, record, or import audio to fill it."
								: "Try widening the search or clearing a filter."
						}
					/>
				) : (
					<ul className="divide-y divide-border">
						{items.map((it) => (
							<li
								key={`${it.kind}:${it.id}`}
								className="flex items-center gap-3 p-3 transition-colors hover:bg-secondary"
							>
								<Checkbox
									label={`Select ${it.title}`}
									checked={selected.has(it.id)}
									onChange={() => toggleSelect(it.id)}
								/>
								<button
									type="button"
									title={it.audio_url ? `Play ${it.title}` : "No audio"}
									aria-label={
										it.audio_url ? `Play ${it.title}` : `${it.title} (no audio)`
									}
									disabled={!it.audio_url}
									onClick={() => play(it.audio_url, it.id)}
									className="grid size-7 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary-hover hover:text-foreground disabled:opacity-40"
								>
									<PlayIcon className="size-3.5" aria-hidden="true" />
								</button>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium text-foreground">
										{it.title}
									</p>
									<p className="flex items-center gap-2 text-xs text-muted-foreground">
										<Badge tone="neutral">{it.kind}</Badge>
										{it.engine ? (
											<span>{formatEngineName(it.engine)}</span>
										) : null}
										{it.duration_ms != null ? (
											<span className="tabular-nums">
												{formatDuration((it.duration_ms ?? 0) / 1000)}
											</span>
										) : null}
										{it.created_at ? (
											<span>
												{new Date(it.created_at).toLocaleDateString()}
											</span>
										) : null}
									</p>
									{it.tags.length > 0 ? (
										<p className="mt-1 flex flex-wrap gap-1">
											{it.tags.map((tg) => (
												<Badge key={tg.id} tone="neutral">
													{tg.color ? (
														<span
															aria-hidden="true"
															className="size-1.5 rounded-full"
															style={{ background: tg.color }}
														/>
													) : null}
													{tg.name}
												</Badge>
											))}
										</p>
									) : null}
								</div>
								<span className="flex shrink-0 gap-1">
									<button
										type="button"
										title="Copy to clipboard"
										aria-label={`Copy ${it.title} to clipboard`}
										onClick={() => {
											copyClip({
												kind: it.kind as never,
												id: it.id,
												audioUrl: it.audio_url ?? "",
												name: it.title,
												durationMs: it.duration_ms ?? 0,
											}).catch((e: unknown) => showStudioErrorToast(e));
										}}
										className="grid size-7 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary-hover hover:text-foreground"
									>
										<ClipboardDocumentIcon
											className="size-3.5"
											aria-hidden="true"
										/>
									</button>
									{it.audio_url ? (
										<a
											href={apiClient.getLibraryAudioUrl(it)}
											download
											title="Download"
											aria-label={`Download ${it.title}`}
											className="grid size-7 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary-hover hover:text-foreground"
										>
											<ArrowDownTrayIcon
												className="size-3.5"
												aria-hidden="true"
											/>
										</a>
									) : null}
									<button
										type="button"
										title="Tag this item"
										aria-label={`Tag ${it.title}`}
										onClick={() => focusTagFor(it.id)}
										className="grid size-7 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary-hover hover:text-foreground"
									>
										<TagIcon className="size-3.5" aria-hidden="true" />
									</button>
								</span>
							</li>
						))}
					</ul>
				)}
			</div>

			<p className="text-xs tabular-nums text-muted-foreground">
				{total} item{total === 1 ? "" : "s"}
			</p>
		</div>
	);
}
