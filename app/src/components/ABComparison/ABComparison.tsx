import {
	ArrowsRightLeftIcon as ArrowLeftRight,
	SpeakerWaveIcon as Volume2,
	SpeakerXMarkIcon as VolumeX,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

interface ABComparisonProps {
	originalAudioPath: string;
	processedAudioPath: string;
	currentTime: number;
	onPlay: (path: string) => void;
	onStop: () => void;
}

export function ABComparison({
	originalAudioPath,
	processedAudioPath,
	currentTime: _currentTime,
	onPlay,
	onStop,
}: ABComparisonProps) {
	const [mode, setMode] = useState<"original" | "processed" | "ab">("ab");
	const [isPlaying, setIsPlaying] = useState(false);

	const handlePlay = () => {
		if (mode === "original") {
			onPlay(originalAudioPath);
		} else if (mode === "processed") {
			onPlay(processedAudioPath);
		} else {
			// A/B mode: play original, then switch to processed
			onPlay(originalAudioPath);
			setTimeout(() => onPlay(processedAudioPath), 2000);
		}
		setIsPlaying(true);
	};

	const handleStop = () => {
		onStop();
		setIsPlaying(false);
	};

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="flex items-center gap-2 text-sm">
					<ArrowLeftRight className="size-4" />
					A/B Comparison
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				<div className="flex gap-1">
					<button
						type="button"
						onClick={() => setMode("original")}
						className={cn(
							"flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
							mode === "original"
								? "bg-accent text-accent-foreground"
								: "bg-muted text-muted-foreground hover:bg-muted/70",
						)}
						title="Listen to original audio"
						aria-label="Switch to original audio"
					>
						<VolumeX className="size-4" /> Original
					</button>
					<button
						type="button"
						onClick={() => setMode("processed")}
						className={cn(
							"flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
							mode === "processed"
								? "bg-accent text-accent-foreground"
								: "bg-muted text-muted-foreground hover:bg-muted/70",
						)}
						title="Listen to processed audio"
						aria-label="Switch to processed audio"
					>
						<Volume2 className="size-4" /> Processed
					</button>
					<button
						type="button"
						onClick={() => setMode("ab")}
						className={cn(
							"flex-1 flex items-center justify-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
							mode === "ab"
								? "bg-accent text-accent-foreground"
								: "bg-muted text-muted-foreground hover:bg-muted/70",
						)}
						title="Play A/B comparison (original then processed)"
						aria-label="Switch to A/B comparison mode"
					>
						A/B
					</button>
				</div>

				<div className="flex gap-2">
					<Button
						onClick={isPlaying ? handleStop : handlePlay}
						variant={isPlaying ? "destructive" : "default"}
						className="flex-1"
					>
						{isPlaying
							? "Stop"
							: mode === "ab"
								? "Play A then B"
								: `Play ${mode}`}
					</Button>
				</div>

				<p className="text-xs text-muted-foreground text-center">
					{mode === "ab"
						? "Plays original for 2s, then switches to processed"
						: `Playing ${mode} version`}
				</p>
			</CardContent>
		</Card>
	);
}
