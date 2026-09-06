import {
	MicrophoneIcon,
	PlayIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import type { UseMutationResult } from "@tanstack/react-query";
import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
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
import { Badge, Spinner } from "@/ui/primitives";
import { EmptyState } from "@/ui/states";
import type { ADRLine } from "./types";
import { TakeWaveform } from "./WaveformBars";

interface TakeManagerProps {
	lines: ADRLine[];
	activeLine: ADRLine | null;
	setActiveLineId: (id: string) => void;
	playAudio: (url: string) => void;
	selectTakeMut: UseMutationResult<
		void,
		Error,
		{ lineId: string; takeId: string }
	>;
	deleteTakeMut: UseMutationResult<void, Error, string>;
	autoSelectMut: UseMutationResult<
		{ selected_take_id: string | null },
		Error,
		string
	>;
}

export function TakeManager({
	lines,
	activeLine,
	setActiveLineId,
	playAudio,
	selectTakeMut,
	deleteTakeMut,
	autoSelectMut,
}: TakeManagerProps) {
	const [deletingTakeId, setDeletingTakeId] = useState<string | null>(null);

	return (
		<>
			<div className="w-64 shrink-0 space-y-2 overflow-y-auto border-r border-border pr-3">
				<span className="text-xs font-medium text-muted-foreground">Lines</span>
				{lines.map((line) => (
					<button
						key={line.id}
						type="button"
						aria-current={activeLine?.id === line.id ? "true" : undefined}
						className={cn(
							"w-full rounded-md border px-3 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							activeLine?.id === line.id
								? "border-accent bg-accent-muted"
								: "border-border bg-card hover:border-strong",
						)}
						onClick={() => setActiveLineId(line.id)}
					>
						<div className="truncate font-medium text-foreground">
							{line.character}
						</div>
						<div className="mt-0.5 truncate text-muted-foreground">
							{line.original_text || "(empty)"}
						</div>
						{line.selected_take_id ? (
							<Badge tone="accent" className="mt-1">
								Take selected
							</Badge>
						) : null}
					</button>
				))}
			</div>

			<div className="min-w-0 flex-1 space-y-2 overflow-y-auto">
				{activeLine ? (
					<>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<p className="min-w-0 text-xs">
								<span className="font-medium text-foreground">
									{activeLine.character}
								</span>{" "}
								<span className="text-muted-foreground">
									“{activeLine.original_text}”
								</span>
							</p>
							<div className="flex items-center gap-2">
								<span className="text-xs tabular-nums text-muted-foreground">
									{(activeLine.takes ?? []).length} takes
									{activeLine.target_duration_ms
										? ` · target ${(activeLine.target_duration_ms / 1000).toFixed(2)}s`
										: ""}
								</span>
								{(activeLine.takes ?? []).length > 1 && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="h-6 px-2 text-xs"
										disabled={autoSelectMut.isPending}
										title="Auto-select best take by quality and target duration"
										aria-label="Auto-select best take"
										onClick={() => autoSelectMut.mutate(activeLine.id)}
									>
										{autoSelectMut.isPending ? (
											<Spinner size="xs" className="mr-1" />
										) : null}
										Auto-Select
									</Button>
								)}
							</div>
						</div>
						{(activeLine.takes ?? []).length === 0 && (
							<EmptyState
								icon={<MicrophoneIcon className="size-6" aria-hidden="true" />}
								title="No takes yet"
								body="Press Record to capture one."
							/>
						)}
						{(activeLine.takes ?? []).map((take) => (
							<div
								key={take.id}
								className={cn(
									"flex items-center gap-3 rounded-md border px-3 py-2",
									activeLine.selected_take_id === take.id
										? "border-accent bg-accent-muted"
										: "border-border bg-card",
								)}
							>
								<span className="min-w-12 text-xs font-bold text-foreground">
									Take {take.take_number}
								</span>
								<TakeWaveform takeId={take.id} />
								<span className="min-w-12 font-mono text-xs tabular-nums text-muted-foreground">
									{take.duration_ms
										? `${(take.duration_ms / 1000).toFixed(2)}s`
										: "--"}
								</span>
								{take.quality_score ? (
									<Badge tone={take.quality_score > 0.7 ? "accent" : "neutral"}>
										{(take.quality_score * 100).toFixed(0)}%
									</Badge>
								) : null}
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-7 px-2 text-xs"
									title="Play take"
									aria-label={`Play take ${take.take_number ?? ""}`.trim()}
									onClick={() =>
										playAudio(apiClient.getADRTakeAudioUrl(take.id))
									}
								>
									<PlayIcon className="size-3.5" aria-hidden="true" />
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-7 px-2 text-xs"
									disabled={selectTakeMut.isPending}
									title="Use this take"
									aria-label={`Use take ${take.take_number ?? ""}`.trim()}
									onClick={() =>
										selectTakeMut.mutate({
											lineId: activeLine.id,
											takeId: take.id,
										})
									}
								>
									Use
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-7 px-2 text-xs text-destructive hover:text-destructive"
									title="Delete take"
									aria-label={`Delete take ${take.take_number ?? ""}`.trim()}
									disabled={deleteTakeMut.isPending}
									onClick={() => setDeletingTakeId(take.id)}
								>
									<TrashIcon className="size-3" aria-hidden="true" />
								</Button>
							</div>
						))}
					</>
				) : (
					<EmptyState
						title="Select a line"
						body="Choose a line to view its takes."
					/>
				)}
			</div>

			<AlertDialog
				open={deletingTakeId !== null}
				onOpenChange={(open) => {
					if (!open) {
						setDeletingTakeId(null);
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogTitle>Delete take?</AlertDialogTitle>
					<AlertDialogDescription>
						This cannot be undone.
					</AlertDialogDescription>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={deleteTakeMut.isPending}
							onClick={() => {
								if (deletingTakeId) {
									deleteTakeMut.mutate(deletingTakeId);
								}
								setDeletingTakeId(null);
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
