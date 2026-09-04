import {
	SpeakerWaveIcon as Volume2,
	SpeakerXMarkIcon as VolumeX,
} from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";

// Per-clip volume popover. Local state drives the slider during a drag so
// each pointer-move pixel doesn't fire a PATCH; commits on release.
export function ClipVolumePopover({
	volume,
	onChange,
}: {
	storyId: string;
	itemId: string;
	volume: number;
	onChange: (value: number) => void;
}) {
	const [localVolume, setLocalVolume] = useState(volume);
	// Re-sync when the selected clip changes or the persisted value updates
	// out-of-band (split/duplicate carry the value forward).
	useEffect(() => {
		setLocalVolume(volume);
	}, [volume]);

	const display = Math.round(localVolume * 100);
	const Icon = localVolume === 0 ? VolumeX : Volume2;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-7"
					title={`Volume — ${display}%`}
					aria-label="Adjust clip volume"
				>
					<Icon className="size-4" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="center" className="w-56 p-3">
				<div className="flex items-center justify-between mb-2">
					<span className="text-xs text-muted-foreground">Volume</span>
					<span className="text-xs tabular-nums">{display}%</span>
				</div>
				<Slider
					value={[localVolume * 100]}
					onValueChange={([v]) => setLocalVolume(v / 100)}
					onValueCommit={([v]) => onChange(v / 100)}
					min={0}
					max={200}
					step={1}
					aria-label="Clip volume"
				/>
				<div className="flex justify-between mt-2 text-xs text-muted-foreground tabular-nums">
					<span>0%</span>
					<span>100%</span>
					<span>200%</span>
				</div>
			</PopoverContent>
		</Popover>
	);
}
