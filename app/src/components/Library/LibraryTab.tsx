import {
	ArrowDownTrayIcon,
	ClipboardDocumentIcon,
	FunnelIcon,
	ArchiveBoxIcon as LibraryIcon,
	MagnifyingGlassIcon,
	PlayIcon,
	TagIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Spinner } from "@/components/ui/Spinner";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { apiClient } from "@/lib/api/client";
import { copyClip } from "@/lib/clip";
import { showStudioErrorToast } from "@/lib/errors";
import { formatDuration, formatEngineName } from "@/lib/utils/format";
import { usePlayerStore } from "@/stores/playerStore";

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

export function LibraryTab() {
	const qc = useQueryClient();
	const [q, setQ] = useState("");
	const [kind, setKind] = useState("_all");
	const [tag, setTag] = useState("_all");
	const [sort, setSort] = useState("newest");
	const [page] = useState(1);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [tagInput, setTagInput] = useState("");

	const libraryQuery = useQuery({
		queryKey: ["library", q, kind, tag, sort, page],
		queryFn: () =>
			apiClient.listLibrary({
				q: q || undefined,
				kind: kind !== "_all" ? kind : undefined,
				tag: tag !== "_all" ? tag : undefined,
				sort,
				page,
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
			qc.invalidateQueries({ queryKey: ["library"] });
			setSelected(new Set());
		},
		onError: (e) => showStudioErrorToast(e),
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
			qc.invalidateQueries({ queryKey: ["library"] });
			qc.invalidateQueries({ queryKey: ["library-tags"] });
			setTagInput("");
		},
		onError: (e) => showStudioErrorToast(e),
	});

	const handlePlay = (audioUrl: string | null | undefined, id: string) => {
		if (!audioUrl) {
			return;
		}
		const resolved = apiClient.getLibraryAudioUrl({
			audio_url: audioUrl,
		} as unknown as never);
		usePlayerStore.getState().setAudioWithAutoPlay(resolved, id, null, id);
	};

	const items = libraryQuery.data?.items ?? [];
	const total = libraryQuery.data?.total ?? 0;

	return (
		<div className="flex flex-col h-full p-4 gap-4">
			<ScreenHeader
				icon={<LibraryIcon className="size-5" />}
				title="Library"
				description="Unified audio library — all generations, captures, and samples. Search, tag, and batch-manage."
			/>
			{libraryQuery.error && (
				<Alert
					variant="destructive"
					message="Couldn't load library — is the server running?"
					onDismiss={() => libraryQuery.refetch()}
				/>
			)}
			<Separator />

			{/* Controls */}
			<div className="flex flex-wrap gap-2 items-center">
				<div className="relative flex-1 min-w-[200px]">
					<MagnifyingGlassIcon className="absolute left-2 top-3 size-4 text-muted-foreground" />
					<Input
						aria-label="Search library"
						placeholder="Search title or transcript..."
						value={q}
						onChange={(e) => setQ(e.target.value)}
						className="pl-8 h-8"
					/>
				</div>
				<Select value={kind} onValueChange={setKind}>
					<SelectTrigger className="w-[160px] h-8">
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
					<SelectTrigger className="w-[140px] h-8">
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
					<SelectTrigger className="w-[160px] h-8">
						<FunnelIcon className="size-3.5 mr-1" />
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

			{/* Batch bar */}
			{selected.size > 0 && (
				<div className="flex flex-wrap gap-2 items-center p-2 rounded-md bg-muted border text-sm">
					<span className="text-muted-foreground">
						{selected.size} selected
					</span>
					<Button
						size="sm"
						variant="outline"
						onClick={() => batchDelete.mutate()}
						disabled={batchDelete.isPending}
					>
						<TrashIcon className="size-3.5 mr-1" />
						Delete
					</Button>
					<div className="flex gap-1 items-center">
						<Input
							placeholder="Tag name"
							value={tagInput}
							onChange={(e) => setTagInput(e.target.value)}
							className="h-7 w-32"
						/>
						<Button
							size="sm"
							variant="outline"
							onClick={() => batchTag.mutate()}
							disabled={batchTag.isPending || !tagInput.trim()}
						>
							<TagIcon className="size-3.5 mr-1" />
							Tag
						</Button>
					</div>
					<Button
						size="sm"
						variant="ghost"
						onClick={() => setSelected(new Set())}
					>
						Clear
					</Button>
				</div>
			)}

			{/* List */}
			<div className="flex-1 min-h-0 overflow-auto rounded-md border bg-card divide-y">
				{libraryQuery.isLoading ? (
					<div className="p-8 text-center">
						<Spinner size="md" />
					</div>
				) : items.length === 0 ? (
					<div className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-3">
						<span className="leading-relaxed">
							{total === 0
								? "Your library is empty — generate, record, or import audio"
								: "No audio found for this filter"}
						</span>
						{total === 0 && (
							<button
								type="button"
								onClick={() => {
									window.location.href = "/";
								}}
								className="text-xs font-medium text-accent hover:underline"
							>
								Generate your first voice
							</button>
						)}
					</div>
				) : (
					items.map((it) => (
						<div
							key={`${it.kind}:${it.id}`}
							className="flex items-center gap-3 p-3 hover:bg-muted/50"
						>
							<Checkbox
								checked={selected.has(it.id)}
								onCheckedChange={() => toggleSelect(it.id)}
							/>
							<Button
								size="icon"
								variant="ghost"
								className="size-7 shrink-0"
								onClick={() => it.audio_url && handlePlay(it.audio_url, it.id)}
								disabled={!it.audio_url}
							>
								<PlayIcon className="size-3.5" />
							</Button>
							<div className="flex-1 min-w-0">
								<div className="text-sm font-medium truncate">{it.title}</div>
								<div className="flex gap-2 text-xs text-muted-foreground">
									<Badge variant="outline" className="text-xs h-4">
										{it.kind}
									</Badge>
									{it.engine && <span>{formatEngineName(it.engine)}</span>}
									{it.duration_ms != null && (
										<span>{formatDuration((it.duration_ms ?? 0) / 1000)}</span>
									)}
									{it.created_at && (
										<span>{new Date(it.created_at).toLocaleDateString()}</span>
									)}
								</div>
								{it.tags.length > 0 && (
									<div className="flex gap-1 mt-1 flex-wrap">
										{it.tags.map((t) => (
											<Badge
												key={t.id}
												variant="secondary"
												className="text-xs h-4"
												style={t.color ? { borderColor: t.color } : undefined}
											>
												{t.name}
											</Badge>
										))}
									</div>
								)}
							</div>
							<div className="flex gap-1 shrink-0">
								<Button
									size="icon"
									variant="ghost"
									className="size-7"
									title="Copy to clipboard"
									onClick={async () => {
										try {
											await copyClip({
												kind: it.kind as never,
												id: it.id,
												audioUrl: it.audio_url ?? "",
												name: it.title,
												durationMs: it.duration_ms ?? 0,
											});
										} catch (e) {
											showStudioErrorToast(e);
										}
									}}
								>
									<ClipboardDocumentIcon className="size-3.5" />
								</Button>
								{it.audio_url && (
									<a href={apiClient.getLibraryAudioUrl(it)} download>
										<Button
											size="icon"
											variant="ghost"
											className="size-7"
											title="Download"
										>
											<ArrowDownTrayIcon className="size-3.5" />
										</Button>
									</a>
								)}
								<Button
									size="icon"
									variant="ghost"
									className="size-7"
									title="Add tag"
									onClick={async () => {
										const name = prompt("Tag name?");
										if (!name) {
											return;
										}
										try {
											await apiClient.addTagToItem(
												it.kind,
												it.id,
												undefined,
												name,
											);
											qc.invalidateQueries({ queryKey: ["library"] });
											qc.invalidateQueries({ queryKey: ["library-tags"] });
										} catch (e) {
											showStudioErrorToast(e);
										}
									}}
								>
									<TagIcon className="size-3.5" />
								</Button>
							</div>
						</div>
					))
				)}
			</div>

			<div className="text-xs text-muted-foreground">
				{total} items • page {libraryQuery.data?.page ?? 1}
			</div>
		</div>
	);
}
