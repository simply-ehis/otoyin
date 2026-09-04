import {
	MicrophoneIcon as Mic,
	PlayIcon as Play,
	RadioIcon as Radio,
	TrashIcon as Trash2,
} from "@heroicons/react/24/outline";
import type { UseMutationResult } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import type { ADRLine, ADRTake } from "./ADRViewTypes";
import { TakeWaveform } from "./AdrWaveformHelpers";

interface AdrTakeManagerProps {
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

export function AdrTakeManager({
	lines,
	activeLine,
	setActiveLineId,
	playAudio,
	selectTakeMut,
	deleteTakeMut,
	autoSelectMut,
}: AdrTakeManagerProps) {
	return (
		<>
			{/* Lines sidebar */}
			<div className="w-64 shrink-0 overflow-y-auto space-y-2 border-r border-border pr-3">
				<span className="text-xs font-medium text-muted-foreground">Lines</span>
				{lines.map((line: ADRLine) => (
					<button
						key={line.id}
						type="button"
						className={cn(
							"w-full text-left px-3 py-2 rounded-lg border transition-colors text-xs",
							activeLine?.id === line.id
								? "border-accent bg-accent/10"
								: "border-border bg-card hover:border-accent/50",
						)}
						onClick={() => setActiveLineId(line.id)}
					>
						<div className="font-medium text-foreground truncate">
							{line.character}
						</div>
						<div className="text-muted-foreground truncate mt-0.5">
							{line.original_text || "(empty)"}
						</div>
						{line.selected_take_id && (
							<Badge variant="outline" className="mt-1 text-xs">
								Take selected
							</Badge>
						)}
					</button>
				))}
			</div>

			{/* Takes for active line */}
			<div className="flex-1 overflow-y-auto space-y-2">
				{activeLine ? (
					<>
						<div className="flex items-center justify-between">
							<div>
								<span className="text-xs font-medium text-foreground">
									{activeLine.character}
								</span>
								<span className="text-xs text-muted-foreground ml-2">
									"{activeLine.original_text}"
								</span>
							</div>
							<div className="flex items-center gap-2">
								<span className="text-xs text-muted-foreground">
									{(activeLine.takes ?? []).length} takes
									{activeLine.target_duration_ms
										? activeLine.target_duration_ms > 0 &&
											` | target: ${((activeLine.target_duration_ms ?? 0) / 1000).toFixed(2)}s`
										: false}
								</span>
								{(activeLine.takes ?? []).length > 1 && (
									<Button
										variant="outline"
										size="sm"
										className="h-6 text-xs px-2"
										disabled={autoSelectMut.isPending}
										onClick={() => autoSelectMut.mutate(activeLine.id)}
										title="Auto-select best take by quality + target duration"
									>
										{autoSelectMut.isPending ? <Spinner /> : "Auto-Select"}
									</Button>
								)}
							</div>
						</div>
						{(activeLine.takes ?? []).length === 0 && (
							<EmptyState
								icon={<Mic className="size-6" />}
								title="No takes yet"
								description="Press Record to capture one"
							/>
						)}
						{(activeLine.takes ?? []).map((take: ADRTake) => (
							<div
								key={take.id}
								className={cn(
									"flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors",
									activeLine.selected_take_id === take.id
										? "border-accent bg-accent/10"
										: "border-border bg-card",
								)}
							>
								<span className="text-xs font-bold text-foreground min-w-[48px]">
									Take {take.take_number}
								</span>
								<TakeWaveform takeId={take.id} />
								<span className="text-xs font-mono tabular-nums text-muted-foreground min-w-[48px]">
									{take.duration_ms
										? `${((take.duration_ms ?? 0) / 1000).toFixed(2)}s`
										: "--"}
								</span>
								{take.quality_score
									? take.quality_score > 0 && (
											<Badge
												variant={
													(take.quality_score ?? 0) > 0.7
														? "default"
														: "secondary"
												}
												className="text-xs"
											>
												{((take.quality_score ?? 0) * 100).toFixed(0)}%
											</Badge>
										)
									: false}
								<button
									type="button"
									className="text-muted-foreground hover:text-foreground p-1"
									title="Play take"
									onClick={() =>
										playAudio(apiClient.getADRTakeAudioUrl(take.id))
									}
								>
									<Play className="h-3.5 w-3.5" />
								</button>
								<button
									type="button"
									className={cn(
										"text-xs px-2 py-0.5 rounded transition-colors",
										activeLine.selected_take_id === take.id
											? "text-accent"
											: "text-muted-foreground hover:text-foreground",
									)}
									onClick={() =>
										selectTakeMut.mutate({
											lineId: activeLine.id,
											takeId: take.id,
										})
									}
								>
									Use
								</button>
								<button
									type="button"
									className="text-destructive/60 hover:text-destructive p-1"
									title="Delete take"
									disabled={deleteTakeMut.isPending}
									onClick={() => {
										if (
											window.confirm(
												`Delete Take ${take.take_number}? This cannot be undone.`,
											)
										) {
											deleteTakeMut.mutate(take.id);
										}
									}}
								>
									<Trash2 className="size-3" />
								</button>
							</div>
						))}
					</>
				) : (
					<EmptyState
						icon={<Radio className="size-6" />}
						title="Select a line"
						description="Choose a line to view its takes"
					/>
				)}
			</div>
		</>
	);
}
