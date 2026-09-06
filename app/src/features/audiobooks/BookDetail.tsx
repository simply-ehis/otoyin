import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { AudiobookDetail } from "@/lib/api/clientAudiobooks";
import { showStudioErrorToast } from "@/lib/errors";
import { useAudiobookStore } from "@/stores/audiobookStore";
import { Button } from "@/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
} from "@/ui/dialog";
import { Badge } from "@/ui/primitives";
import { useToast } from "@/ui/use-toast";
import { ChapterList } from "./ChapterList";
import { ConvertPanel } from "./ConvertPanel";
import { VoiceCastPanel } from "./VoiceCastPanel";

/**
 * Book detail: cover, render queue, exports, delete (confirmed),
 * voice cast, chapters with utterances, format conversion.
 */
export function BookDetail({
	detail,
	onRefresh,
}: {
	detail: AudiobookDetail;
	onRefresh: () => void;
}) {
	const { toast } = useToast();
	const [rendering, setRendering] = useState(false);
	const [coverBusy, setCoverBusy] = useState(false);
	const [engine, setEngine] = useState<string | null>(null);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const [deleting, setDeleting] = useState(false);

	const uploadCover = async (file: File | undefined) => {
		if (!file) {
			return;
		}
		setCoverBusy(true);
		try {
			await apiClient.uploadCover(detail.id, file);
			onRefresh();
		} catch (err: unknown) {
			showStudioErrorToast(err);
		} finally {
			setCoverBusy(false);
		}
	};

	const render = async () => {
		if (!engine) {
			showStudioErrorToast(
				new Error(
					"Pick a cached engine first — no auto-download, no default forcing.",
				),
			);
			return;
		}
		setRendering(true);
		try {
			const r = await apiClient.renderBook(detail.id, { engine });
			toast({
				title: "Render queued",
				description: `Job ${r.job_id} is in the batch queue — check Workspace → Batch.`,
			});
			onRefresh();
		} catch (err: unknown) {
			showStudioErrorToast(err);
		} finally {
			setRendering(false);
		}
	};

	const download = async (kind: "wav" | "m4b") => {
		try {
			const blob =
				kind === "wav"
					? await apiClient.exportWav(detail.id)
					: await apiClient.exportM4b(detail.id);
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${detail.title}.${kind === "wav" ? "wav" : "m4b"}`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (err: unknown) {
			showStudioErrorToast(err);
		}
	};

	return (
		<div className="flex flex-col gap-4 pb-8">
			<div className="flex gap-4 rounded-md border border-border bg-card p-4">
				<span className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-sm bg-secondary text-xs text-muted-foreground">
					Cover
				</span>
				<div className="min-w-0 flex-1">
					<h2 className="truncate text-lg font-semibold tracking-tight text-foreground">
						{detail.title}
					</h2>
					<p className="text-sm tabular-nums text-muted-foreground">
						{detail.author || "Unknown author"} · {detail.chapters.length}{" "}
						chapters
						{detail.total_duration_ms
							? ` · ${Math.round(detail.total_duration_ms / 1000)}s`
							: ""}
					</p>
					<div className="mt-3 flex flex-wrap items-center gap-2">
						<CachedEngineSelector value={engine} onChange={setEngine} />
						<label
							className="cursor-pointer rounded-sm border border-border px-3 py-1 text-xs text-foreground transition-colors hover:bg-secondary"
							title="Upload cover image"
						>
							{coverBusy ? "Uploading…" : "Upload cover"}
							<input
								type="file"
								accept="image/*"
								className="hidden"
								disabled={coverBusy}
								onChange={(e) => {
									void uploadCover(e.target.files?.[0]);
									e.target.value = "";
								}}
							/>
						</label>
						<Button
							size="sm"
							onClick={render}
							disabled={rendering || !engine}
							loading={rendering}
						>
							{rendering ? "Queuing…" : "Render WAV"}
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={() => void download("wav")}
						>
							Export WAV
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={() => void download("m4b")}
						>
							Export .m4b
						</Button>
						<Button
							size="sm"
							variant="ghost"
							className="text-destructive"
							onClick={() => setDeleteOpen(true)}
						>
							Delete
						</Button>
					</div>
				</div>
			</div>

			<VoiceCastPanel detail={detail} onRefresh={onRefresh} />
			<ChapterList detail={detail} onRefresh={onRefresh} />
			<ConvertPanel />

			<Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
				<DialogContent>
					<DialogTitle>Delete audiobook?</DialogTitle>
					<DialogDescription>
						This permanently removes “{detail.title}” and its rendered audio.
					</DialogDescription>
					<DialogFooter>
						<Button variant="ghost" onClick={() => setDeleteOpen(false)}>
							Cancel
						</Button>
						<Button
							variant="destructive"
							disabled={deleting}
							loading={deleting}
							onClick={() => {
								setDeleting(true);
								apiClient
									.deleteAudiobook(detail.id)
									.then(() => {
										useAudiobookStore.getState().setSelectedId(null);
										onRefresh();
										setDeleteOpen(false);
									})
									.catch((err: unknown) => showStudioErrorToast(err))
									.finally(() => setDeleting(false));
							}}
						>
							{deleting ? "Deleting…" : "Delete"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function CachedEngineSelector({
	value,
	onChange,
}: {
	value: string | null;
	onChange: (engine: string | null) => void;
}) {
	const [engines, setEngines] = useState<
		{ engine: string; display_name: string }[]
	>([]);
	const [loading, setLoading] = useState(true);
	useEffect(() => {
		apiClient
			.listCachedEngines()
			.then((r) => setEngines(r.engines))
			.catch(() => setEngines([]))
			.finally(() => setLoading(false));
	}, []);
	if (loading) {
		return (
			<span className="text-xs text-muted-foreground">
				Loading cached engines…
			</span>
		);
	}
	if (engines.length === 0) {
		return (
			<Badge tone="warning">
				No TTS engines cached — download one from Models tab first. No
				auto-download, no default.
			</Badge>
		);
	}
	return (
		<label className="flex items-center gap-1.5 text-xs text-muted-foreground">
			Engine
			<select
				value={value ?? ""}
				onChange={(e) => onChange(e.target.value || null)}
				title="Pick a cached TTS engine — only downloaded models are listed"
				className="h-7 rounded-sm border border-input bg-sunken px-2 text-xs text-foreground focus:border-ring focus:outline-none"
			>
				<option value="">— select engine —</option>
				{engines.map((e) => (
					<option key={e.engine} value={e.engine}>
						{e.display_name} ({e.engine})
					</option>
				))}
			</select>
		</label>
	);
}
