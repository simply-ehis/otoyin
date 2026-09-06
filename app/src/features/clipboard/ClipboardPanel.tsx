import {
	ArrowUturnLeftIcon,
	PlayIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
	type ClipHistoryEntry,
	clearClip,
	copyClip,
	deleteClipHistory,
	getClip,
	listClipHistory,
} from "@/lib/clip";
import { showStudioErrorToast } from "@/lib/errors";
import { usePlayerStore } from "@/stores/playerStore";
import { Button } from "@/ui/button";
import { Badge, Spinner } from "@/ui/primitives";
import { EmptyState } from "@/ui/states";
import { useToast } from "@/ui/use-toast";

function formatDuration(ms: number): string {
	const s = Math.max(0, Math.round(ms / 1000));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Clips library: every recent copy in one place. Shows the live slot plus
 * history (newest 20), with play, restore-to-slot, and delete. Mounted from
 * the Library header — no router changes needed.
 */
export function ClipboardPanel() {
	const { t } = useTranslation();
	const { toast } = useToast();
	const qc = useQueryClient();

	const live = useQuery({
		queryKey: ["clipboard-live"],
		queryFn: getClip,
		staleTime: 10_000,
	});
	const history = useQuery({
		queryKey: ["clipboard-history"],
		queryFn: listClipHistory,
		staleTime: 10_000,
	});

	const invalidate = () => {
		void qc.invalidateQueries({ queryKey: ["clipboard-live"] });
		void qc.invalidateQueries({ queryKey: ["clipboard-history"] });
	};

	const restore = useMutation({
		mutationFn: (entry: ClipHistoryEntry) =>
			copyClip({
				kind: entry.kind,
				id: entry.id,
				audioUrl: entry.audioUrl,
				name: entry.name,
				durationMs: entry.durationMs,
			}),
		onSuccess: () => {
			invalidate();
			toast({
				title: t("history.actions.copyClipDone", {
					defaultValue: "Copied to clipboard — paste into any tab",
				}),
			});
		},
		onError: (e: unknown) => showStudioErrorToast(e),
	});

	const removeEntry = useMutation({
		mutationFn: (historyId: string) => deleteClipHistory(historyId),
		onSuccess: invalidate,
		onError: (e: unknown) => showStudioErrorToast(e),
	});

	const clear = useMutation({
		mutationFn: clearClip,
		onSuccess: invalidate,
		onError: (e: unknown) => showStudioErrorToast(e),
	});

	function play(entry: { audioUrl: string; id: string }) {
		if (!entry.audioUrl) {
			return;
		}
		usePlayerStore
			.getState()
			.setAudioWithAutoPlay(entry.audioUrl, entry.id, null, entry.id);
	}

	if (history.isLoading || live.isLoading) {
		return (
			<output
				className="flex items-center justify-center py-8"
				aria-label={t("common.loading", { defaultValue: "Loading" })}
			>
				<Spinner size="md" />
			</output>
		);
	}

	if (history.error) {
		return (
			<p role="alert" className="py-4 text-sm text-destructive">
				{t("clipboard.loadFailed", {
					defaultValue: "Couldn't load clips — is the server running?",
				})}
			</p>
		);
	}

	const entries = history.data ?? [];
	if (!live.data && entries.length === 0) {
		return (
			<EmptyState
				title={t("clipboard.emptyTitle", { defaultValue: "No clips yet" })}
				body={t("clipboard.emptyBody", {
					defaultValue:
						"Use Copy as clip on any capture, generation, sample, or message — it lands here for every tab to paste.",
				})}
			/>
		);
	}

	return (
		<div className="space-y-2">
			{live.data ? (
				<div className="flex items-center gap-2 rounded-md border border-accent/40 bg-secondary p-2 text-sm">
					<Badge tone="accent">
						{t("clipboard.liveSlot", { defaultValue: "On clipboard now" })}
					</Badge>
					<span className="min-w-0 flex-1 truncate font-medium">
						{live.data.name || live.data.id}
					</span>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() => clear.mutate()}
						disabled={clear.isPending}
						title={t("clipboard.clear", { defaultValue: "Clear clipboard" })}
						aria-label={t("clipboard.clear", {
							defaultValue: "Clear clipboard",
						})}
					>
						<TrashIcon className="size-3.5" aria-hidden="true" />
					</Button>
				</div>
			) : null}
			<ul className="divide-y divide-border rounded-md border border-border bg-card">
				{entries.map((entry) => (
					<li key={entry.historyId} className="flex items-center gap-3 p-2.5">
						<button
							type="button"
							title={
								entry.audioUrl
									? t("clipboard.play", { defaultValue: "Play" })
									: t("clipboard.noAudio", { defaultValue: "No audio" })
							}
							aria-label={
								entry.audioUrl
									? `${t("clipboard.play", { defaultValue: "Play" })} ${entry.name}`
									: `${entry.name} (${t("clipboard.noAudio", { defaultValue: "No audio" })})`
							}
							disabled={!entry.audioUrl}
							onClick={() => play(entry)}
							className="grid size-7 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary-hover hover:text-foreground disabled:opacity-40"
						>
							<PlayIcon className="size-3.5" aria-hidden="true" />
						</button>
						<div className="min-w-0 flex-1">
							<p className="truncate text-sm font-medium text-foreground">
								{entry.name || entry.id}
							</p>
							<p className="flex items-center gap-2 text-xs text-muted-foreground">
								<Badge tone="neutral">{entry.kind}</Badge>
								{entry.durationMs > 0 ? (
									<span className="tabular-nums">
										{formatDuration(entry.durationMs)}
									</span>
								) : null}
							</p>
						</div>
						<span className="flex shrink-0 gap-1">
							<button
								type="button"
								title={t("clipboard.restore", {
									defaultValue: "Put back on clipboard",
								})}
								aria-label={`${t("clipboard.restore", { defaultValue: "Put back on clipboard" })}: ${entry.name}`}
								onClick={() => restore.mutate(entry)}
								disabled={restore.isPending}
								className="grid size-7 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary-hover hover:text-foreground disabled:opacity-40"
							>
								<ArrowUturnLeftIcon className="size-3.5" aria-hidden="true" />
							</button>
							<button
								type="button"
								title={t("common.delete", { defaultValue: "Delete" })}
								aria-label={`${t("common.delete", { defaultValue: "Delete" })} ${entry.name}`}
								onClick={() => removeEntry.mutate(entry.historyId)}
								disabled={removeEntry.isPending}
								className="grid size-7 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary-hover hover:text-destructive disabled:opacity-40"
							>
								<TrashIcon className="size-3.5" aria-hidden="true" />
							</button>
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}
