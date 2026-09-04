import type { AudiobookDetail } from "@/lib/api/clientAudiobooks";
import { UtteranceList } from "./UtteranceList";

export function ChapterList({
	detail,
	onRefresh,
}: {
	detail: AudiobookDetail;
	onRefresh: () => void;
}) {
	return (
		<div className="border rounded-lg bg-card overflow-hidden">
			<div className="px-3 py-2 text-sm font-medium border-b">
				Chapters ({detail.chapters.length})
			</div>
			<div className="divide-y max-h-[420px] overflow-y-auto">
				{detail.chapters.map((ch) => (
					<div key={ch.id} className="px-3 py-2">
						<div className="flex gap-3">
							<div className="flex-1 min-w-0">
								<div className="text-sm font-medium truncate">
									{ch.order_index + 1}. {ch.title}
								</div>
								<div className="text-xs text-muted-foreground line-clamp-2">
									{ch.text.slice(0, 180)}…
								</div>
								<div className="text-xs text-muted-foreground mt-1">
									{ch.word_count || 0} words · {ch.status}
									{ch.duration_ms
										? ` · ${Math.round(ch.duration_ms / 1000)}s`
										: ""}
								</div>
								{ch.error && (
									<div className="text-xs text-destructive">{ch.error}</div>
								)}
							</div>
							<span
								className={`text-xs px-2 py-1 rounded h-fit ${ch.status === "done" ? "bg-green-500/20" : ch.status === "failed" ? "bg-destructive/20" : "bg-muted"}`}
							>
								{ch.status}
							</span>
						</div>
						<UtteranceList
							chapter={ch}
							audiobookId={detail.id}
							utterances={detail.utterances}
							onRefresh={onRefresh}
						/>
					</div>
				))}
				{detail.chapters.length === 0 && (
					<div className="text-xs text-muted-foreground p-4 text-center">
						No chapters — import a book or add manually
					</div>
				)}
			</div>
		</div>
	);
}
