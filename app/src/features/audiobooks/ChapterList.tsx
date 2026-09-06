import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { AudiobookDetail } from "@/lib/api/clientAudiobooks";
import { showStudioErrorToast } from "@/lib/errors";
import { Button } from "@/ui/button";
import { Badge } from "@/ui/primitives";

/**
 * Chapter list with per-chapter status, utterance splitting
 * (^Name: lines → per-line voices), and WAV/.m4b detail actions
 * living in BookDetail. Utterances expand inline per chapter.
 */
export function ChapterList({
	detail,
	onRefresh,
}: {
	detail: AudiobookDetail;
	onRefresh: () => void;
}) {
	const [busyChapter, setBusyChapter] = useState<string | null>(null);

	const parse = async (chapterId: string) => {
		setBusyChapter(chapterId);
		try {
			await apiClient.parseChapterScript(detail.id, chapterId);
			onRefresh();
		} catch (e: unknown) {
			showStudioErrorToast(e);
		} finally {
			setBusyChapter(null);
		}
	};

	const clear = async (chapterId: string) => {
		try {
			await apiClient.clearUtterances(detail.id, chapterId);
			onRefresh();
		} catch (e: unknown) {
			showStudioErrorToast(e);
		}
	};

	return (
		<section
			aria-label={`Chapters (${detail.chapters.length})`}
			className="overflow-hidden rounded-md border border-border bg-card"
		>
			<p className="border-b border-border px-3 py-2 text-sm font-medium text-foreground">
				Chapters ({detail.chapters.length})
			</p>
			<ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
				{detail.chapters.length === 0 ? (
					<li className="p-4 text-center text-xs text-muted-foreground">
						No chapters — import a book or add manually.
					</li>
				) : (
					detail.chapters.map((ch) => {
						const utterances = (detail.utterances ?? []).filter(
							(u) => u.chapter_id === ch.id,
						);
						return (
							<li key={ch.id} className="px-3 py-2">
								<div className="flex gap-3">
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium text-foreground">
											{ch.order_index + 1}. {ch.title}
										</p>
										<p className="line-clamp-2 text-xs text-muted-foreground">
											{ch.text.slice(0, 180)}…
										</p>
										<p className="mt-1 text-xs tabular-nums text-muted-foreground">
											{ch.word_count || 0} words · {ch.status}
											{ch.duration_ms
												? ` · ${Math.round(ch.duration_ms / 1000)}s`
												: ""}
										</p>
										{ch.error ? (
											<p role="alert" className="text-xs text-destructive">
												{ch.error}
											</p>
										) : null}
									</div>
									<Badge
										tone={
											ch.status === "done"
												? "success"
												: ch.status === "failed"
													? "danger"
													: "neutral"
										}
									>
										{ch.status}
									</Badge>
								</div>
								<div className="mt-2 rounded-sm border border-border bg-sunken p-2">
									<p className="flex items-center gap-2">
										<span className="text-xs font-medium text-foreground">
											Utterances by ^Name: ({utterances.length})
										</span>
										<span className="flex-1" />
										<Button
											size="sm"
											variant="outline"
											className="h-6 text-xs"
											disabled={busyChapter === ch.id}
											onClick={() => void parse(ch.id)}
										>
											{utterances.length > 0 ? "Re-parse" : "Split by Name:"}
										</Button>
										{utterances.length > 0 ? (
											<Button
												size="sm"
												variant="ghost"
												className="h-6 text-xs"
												onClick={() => void clear(ch.id)}
											>
												Clear
											</Button>
										) : null}
									</p>
									{utterances.length > 0 ? (
										<ul className="mt-1.5 flex flex-col gap-1">
											{utterances.map((u) => (
												<li key={u.id} className="flex gap-2 text-xs">
													<span className="w-24 shrink-0 truncate font-medium text-foreground">
														{u.character}
													</span>
													<span className="min-w-0 flex-1 truncate text-muted-foreground">
														{u.text.slice(0, 80)}
													</span>
													<Badge
														tone={
															u.status === "done"
																? "success"
																: u.status === "failed"
																	? "danger"
																	: "neutral"
														}
													>
														{u.status}
													</Badge>
												</li>
											))}
										</ul>
									) : (
										<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
											No utterances yet. If this chapter is a script (Alice:
											hello), click Split to create per-line voices. Otherwise
											it renders as a single Narrator block.
										</p>
									)}
								</div>
							</li>
						);
					})
				)}
			</ul>
		</section>
	);
}
