import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { Chapter, Utterance } from "@/lib/api/clientAudiobooks";
import { showStudioErrorToast } from "@/lib/errors";

export function UtteranceList({
	chapter,
	audiobookId,
	utterances,
	onRefresh,
}: {
	chapter: Chapter;
	audiobookId: string;
	utterances: Utterance[];
	onRefresh: () => void;
}) {
	const [busy, setBusy] = useState(false);
	const filtered = utterances.filter((u) => u.chapter_id === chapter.id);
	const hasScript = filtered.length > 0;
	async function parse() {
		setBusy(true);
		try {
			await apiClient.parseChapterScript(audiobookId, chapter.id);
			onRefresh();
		} catch (e) {
			showStudioErrorToast(e);
		} finally {
			setBusy(false);
		}
	}
	async function clear() {
		await apiClient.clearUtterances(audiobookId, chapter.id);
		onRefresh();
	}
	return (
		<div className="mt-2 border rounded bg-muted/20 p-2 space-y-2">
			<div className="flex items-center gap-2">
				<span className="text-xs font-medium">
					Utterances by ^Name: ({filtered.length})
				</span>
				<button
					type="button"
					onClick={parse}
					disabled={busy}
					className="text-xs px-2 py-1 rounded bg-secondary"
					title="Split this chapter's text into utterances by lines starting with Name:"
				>
					{busy ? "Parsing…" : hasScript ? "Re-parse" : "Split by Name:"}
				</button>
				{hasScript && (
					<button
						type="button"
						onClick={clear}
						className="text-xs px-2 py-1 rounded border"
						title="Clear utterances — chapter becomes single Narrator block"
					>
						Clear
					</button>
				)}
			</div>
			{filtered.length > 0 ? (
				<div className="space-y-1">
					{filtered.map((u) => (
						<div key={u.id} className="flex gap-2 text-xs">
							<span className="font-medium w-24 truncate">{u.character}</span>
							<span className="flex-1 truncate">{u.text.slice(0, 80)}</span>
							<span
								className={`px-1 rounded text-xs ${u.status === "done" ? "bg-green-500/20" : u.status === "failed" ? "bg-destructive/20" : "bg-muted"}`}
							>
								{u.status}
							</span>
						</div>
					))}
				</div>
			) : (
				<div className="text-xs text-muted-foreground">
					No utterances yet. If this chapter is a script (Alice: hello), click
					Split to create per-line voices. Otherwise it renders as single
					Narrator block.
				</div>
			)}
		</div>
	);
}
