import { ScrollArea } from "@/ui/scroll-area";
import { cn } from "@/lib/utils/cn";
import type { TranscriptEditorProps } from "./TranscriptEditor.types";

export function TranscriptEditor({
	words,
	loading,
	error,
	selectedIndices,
	onSeekWord,
	onSelect,
	onSelectRange,
}: TranscriptEditorProps) {
	const confidenceClass = (confidence: number) => {
		if (confidence >= 0.85) {
			return "";
		}
		if (confidence >= 0.6) {
			return "text-muted-foreground/70";
		}
		return "text-muted-foreground/40 underline decoration-dotted decoration-red-500/50";
	};

	const confidenceTooltip = (confidence: number) => {
		if (confidence >= 0.85) {
			return undefined;
		}
		if (confidence >= 0.6) {
			return `Confidence: ${(confidence * 100).toFixed(0)}%`;
		}
		return `Low confidence: ${(confidence * 100).toFixed(0)}% — verify before deleting`;
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center h-64 text-destructive">
				{error}
			</div>
		);
	}

	if (words.length === 0) {
		return (
			<div className="flex items-center justify-center h-64 text-muted-foreground">
				No transcript available. Click "Transcribe" to generate word timestamps.
			</div>
		);
	}

	return (
		<ScrollArea className="h-[400px] w-full">
			<div className="p-2 space-y-1">
				{words.map((word, index) => {
					const isSelected = selectedIndices.has(word.index);
					return (
						<button
							key={word.index}
							type="button"
							onClick={() => {
								onSelect(index, false);
								onSeekWord(word);
							}}
							onContextMenu={(e) => {
								e.preventDefault();
								onSelect(index, true);
							}}
							className={cn(
								"w-full text-left px-3 py-1.5 rounded-md transition-colors text-sm font-mono",
								isSelected && "bg-primary/20 text-primary",
								!isSelected && "hover:bg-muted/50",
								confidenceClass(word.confidence),
							)}
							title={confidenceTooltip(word.confidence)}
							onMouseDown={(e) => {
								if (e.shiftKey) {
									const lastSelected = Array.from(selectedIndices).pop();
									if (lastSelected !== undefined) {
										onSelectRange(lastSelected, index);
										return;
									}
								}
								if (e.ctrlKey || e.metaKey) {
									onSelect(index, true);
									return;
								}
								onSelect(index, false);
							}}
						>
							<div className="flex items-center gap-2">
								<span className="w-10 text-right text-xs text-muted-foreground/50 tabular-nums">
									{word.index}
								</span>
								<span className="flex-1 truncate">{word.word}</span>
								<span className="shrink-0 text-xs text-muted-foreground/50 tabular-nums">
									{word.start_ms.toFixed(0)}–{word.end_ms.toFixed(0)}ms
								</span>
								<span
									className={cn(
										"shrink-0 text-xs tabular-nums",
										confidenceClass(word.confidence),
									)}
								>
									{word.confidence < 1
										? `${(word.confidence * 100).toFixed(0)}%`
										: ""}
								</span>
								{isSelected && (
									<span className="shrink-0 text-primary text-sm">✓</span>
								)}
							</div>
						</button>
					);
				})}
			</div>
		</ScrollArea>
	);
}
