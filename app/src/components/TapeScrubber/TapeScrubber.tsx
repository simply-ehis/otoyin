import { ArrowUturnLeftIcon as RotateCcw } from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface TapeScrubberProps {
	duration: number;
	currentTime: number;
	isPlaying: boolean;
	onSeek: (time: number) => void;
	onPlayPause: () => void;
}

export function TapeScrubber({
	duration,
	currentTime,
	isPlaying,
	onSeek,
	onPlayPause,
}: TapeScrubberProps) {
	const [scrubSpeed, setScrubSpeed] = useState(1);
	const [_isScrubbing, setIsScrubbing] = useState(false);

	const handleScrub = useCallback(
		(value: number[]) => {
			const newTime = value[0];
			onSeek(newTime);
		},
		[onSeek],
	);

	const handleScrubStart = () => {
		setIsScrubbing(true);
		if (isPlaying) {
			onPlayPause();
		}
	};

	const handleScrubEnd = () => {
		setIsScrubbing(false);
	};

	const formatTime = (seconds: number) => {
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		const frames = Math.floor((seconds % 1) * 24);
		return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}:${frames.toString().padStart(2, "0")}`;
	};

	return (
		<div className="flex items-center gap-4 p-4 border rounded-lg bg-card">
			<Button
				variant="outline"
				size="icon"
				onClick={() => onSeek(Math.max(0, currentTime - 0.1 * scrubSpeed))}
				title="Nudge backward"
			>
				<RotateCcw className="size-4" />
			</Button>

			<div className="flex-1 space-y-2">
				<Slider
					value={[currentTime]}
					min={0}
					max={duration}
					step={0.001}
					onValueChange={handleScrub}
					onPointerDown={handleScrubStart}
					onPointerUp={handleScrubEnd}
					className="cursor-pointer"
				/>
				<div className="flex justify-between text-xs text-muted-foreground font-mono">
					<span>{formatTime(currentTime)}</span>
					<span>{formatTime(duration)}</span>
				</div>
			</div>

			<Button
				variant="outline"
				size="icon"
				onClick={() =>
					onSeek(Math.min(duration, currentTime + 0.1 * scrubSpeed))
				}
				title="Nudge forward"
			>
				<RotateCcw className="size-4 rotate-180" />
			</Button>

			<div className="flex items-center gap-2">
				<span className="text-xs text-muted-foreground">Speed:</span>
				<Slider
					value={[scrubSpeed]}
					min={0.1}
					max={4}
					step={0.1}
					onValueChange={(v) => setScrubSpeed(v[0])}
					className="w-20"
				/>
				<span className="text-xs font-mono w-8">{scrubSpeed.toFixed(1)}x</span>
			</div>
		</div>
	);
}
