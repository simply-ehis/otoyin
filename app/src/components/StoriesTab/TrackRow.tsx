import { PlusIcon as Plus } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils/cn";
import { useStoryStore } from "@/stores/storyStore";
import { TRACK_HEIGHT } from "./timeline";

interface TrackRowProps {
	index: number;
	isFirst: boolean;
	isLast: boolean;
	onAddTrackAbove: () => void;
	onAddTrackBelow: () => void;
}

export function TrackRow({
	index,
	isFirst,
	isLast,
	onAddTrackAbove,
	onAddTrackBelow,
}: TrackRowProps) {
	const trackConfig = useStoryStore((s) => s.trackConfigs[index]);
	const toggleMute = useStoryStore((s) => s.toggleTrackMute);
	const toggleSolo = useStoryStore((s) => s.toggleTrackSolo);
	const isMuted = trackConfig?.muted ?? false;
	const isSolo = trackConfig?.solo ?? false;

	return (
		<div
			className="absolute left-0 right-0 flex"
			style={{
				top: `${index * TRACK_HEIGHT}px`,
				height: `${TRACK_HEIGHT}px`,
			}}
		>
			<div className="w-16 shrink-0 border-b border-r flex flex-col items-center justify-center sticky left-0 z-20 h-full bg-background">
				<div className="absolute inset-0 bg-muted/20 pointer-events-none" />
				<span className="relative text-xs text-muted-foreground select-none">
					{index}
				</span>
				<div className="relative flex gap-0.5 mt-0.5">
					<button
						type="button"
						onClick={() => toggleMute(index)}
						className={cn(
							"w-4 h-3 text-[7px] font-bold rounded flex items-center justify-center transition-colors",
							isMuted
								? "bg-warning text-warning-foreground"
								: "bg-muted text-muted-foreground hover:bg-secondary",
						)}
						title={isMuted ? "Unmute track" : "Mute track"}
						aria-label={isMuted ? "Unmute track" : "Mute track"}
					>
						M
					</button>
					<button
						type="button"
						onClick={() => toggleSolo(index)}
						className={cn(
							"w-4 h-3 text-[7px] font-bold rounded flex items-center justify-center transition-colors",
							isSolo
								? "bg-info text-info-foreground"
								: "bg-muted text-muted-foreground hover:bg-secondary",
						)}
						title={isSolo ? "Unsolo track" : "Solo track"}
						aria-label={isSolo ? "Unsolo track" : "Solo track"}
					>
						S
					</button>
				</div>
				{isFirst && (
					<button
						type="button"
						onClick={onAddTrackAbove}
						title="Add track above"
						aria-label="Add track above"
						className="absolute top-0 right-0 left-0 h-3 flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors"
					>
						<Plus className="h-2.5 w-2.5" />
					</button>
				)}
				{isLast && (
					<button
						type="button"
						onClick={onAddTrackBelow}
						title="Add track below"
						aria-label="Add track below"
						className="absolute bottom-0 right-0 left-0 h-3 flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors"
					>
						<Plus className="h-2.5 w-2.5" />
					</button>
				)}
			</div>
			<div
				className={cn(
					"border-b flex-1 pointer-events-none",
					index % 2 === 0 ? "bg-background" : "bg-sunken",
					isMuted && "bg-yellow-500/5",
				)}
			/>
		</div>
	);
}
