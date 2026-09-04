import { useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import type { AudiobookDetail } from "@/lib/api/clientAudiobooks";
import { showStudioErrorToast } from "@/lib/errors";
import { useAudiobookStore } from "@/stores/audiobookStore";
import { CachedEngineSelector } from "./CachedEngineSelector";
import { ChapterList } from "./ChapterList";
import { ConvertPanel } from "./ConvertPanel";
import { VoiceCastPanel } from "./VoiceCastPanel";

export function BookDetail({
	detail,
	onRefresh,
}: {
	detail: AudiobookDetail;
	onRefresh: () => void;
}) {
	const [rendering, setRendering] = useState(false);
	const [coverBusy, setCoverBusy] = useState(false);
	const [_selectedEngine, _setSelectedEngine] = useState<string | null>(null);
	const { toast } = useToast();
	async function handleCover(e: React.ChangeEvent<HTMLInputElement>) {
		const f = e.target.files?.[0];
		if (!f) {
			return;
		}
		setCoverBusy(true);
		try {
			await apiClient.uploadCover(detail.id, f);
			onRefresh();
		} catch (err) {
			showStudioErrorToast(err);
		} finally {
			setCoverBusy(false);
			e.target.value = "";
		}
	}
	async function handleRender() {
		if (!_selectedEngine) {
			showStudioErrorToast(
				"Pick a cached engine first — no auto-download, no default forcing.",
			);
			return;
		}
		setRendering(true);
		try {
			const r = await apiClient.renderBook(detail.id, {
				engine: _selectedEngine,
			});
			toast({
				title: "Render Queued",
				description: `Job ${r.job_id} is in the batch queue — check Workspace → Batch`,
			});
			onRefresh();
		} catch (err) {
			showStudioErrorToast(err);
		} finally {
			setRendering(false);
		}
	}
	async function exportWav() {
		try {
			const blob = await apiClient.exportWav(detail.id);
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${detail.title}.wav`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (err) {
			showStudioErrorToast(err);
		}
	}
	async function exportM4b() {
		try {
			const blob = await apiClient.exportM4b(detail.id);
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${detail.title}.m4b`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (err) {
			showStudioErrorToast(err);
		}
	}
	return (
		<div className="space-y-4 pb-8">
			<div className="border rounded-lg p-4 bg-card flex gap-4">
				{detail.cover_path ? (
					<div className="size-24 bg-muted rounded overflow-hidden shrink-0 flex items-center justify-center text-xs">
						Cover
					</div>
				) : (
					<div className="size-24 bg-muted rounded shrink-0" />
				)}
				<div className="flex-1 min-w-0">
					<h2 className="text-lg font-semibold truncate">{detail.title}</h2>
					<div className="text-sm text-muted-foreground">
						{detail.author || "Unknown author"} · {detail.chapters.length}{" "}
						chapters{" "}
						{detail.total_duration_ms
							? `· ${Math.round(detail.total_duration_ms / 1000)}s`
							: ""}
					</div>
					<div className="flex flex-wrap gap-2 mt-3 items-center">
						<CachedEngineSelector
							value={_selectedEngine}
							onChange={_setSelectedEngine}
						/>
						<label
							className="text-xs px-3 py-1 rounded bg-secondary cursor-pointer"
							title="Upload cover image"
						>
							{coverBusy ? "Uploading…" : "Upload cover"}
							<input
								type="file"
								accept="image/*"
								className="hidden"
								onChange={handleCover}
							/>
						</label>
						<button
							type="button"
							onClick={handleRender}
							disabled={rendering || !_selectedEngine}
							className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50"
							title="Render all chapters to WAV — uses selected cached engine, never auto-downloads"
						>
							{rendering ? "Queuing…" : "Render WAV"}
						</button>
						<button
							type="button"
							onClick={exportWav}
							className="text-xs px-3 py-1 rounded border"
							title="Export concatenated WAV"
						>
							Export WAV
						</button>
						<button
							type="button"
							onClick={exportM4b}
							className="text-xs px-3 py-1 rounded border"
							title="Export .m4b with chapter marks + cover"
						>
							Export .m4b
						</button>
						<button
							type="button"
							onClick={() => {
								apiClient.deleteAudiobook(detail.id);
								useAudiobookStore.getState().setSelectedId(null);
								onRefresh();
							}}
							className="text-xs px-3 py-1 rounded border text-destructive"
						>
							Delete
						</button>
					</div>
				</div>
			</div>
			<VoiceCastPanel detail={detail} onRefresh={onRefresh} />
			<ChapterList detail={detail} onRefresh={onRefresh} />
			<ConvertPanel />
		</div>
	);
}
