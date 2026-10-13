import { ArrowsRightLeftIcon as SwitchHorizontal } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { Button } from "@/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { Slider } from "@/ui/slider";

// Per-clip stereo pan popover. Local state drives the slider during a drag so
// each pointer-move pixel doesn't fire a PATCH; commits on release. Pan range
// is -1.0 (full left) … 0.0 (center) … 1.0 (full right).
export function ClipPanPopover({
	pan,
	onChange,
}: {
	storyId: string;
	itemId: string;
	pan: number;
	onChange: (value: number) => void;
}) {
	const [localPan, setLocalPan] = useState(pan);
	// Re-sync when the selected clip changes or the persisted value updates
	// out-of-band (split/duplicate carry the value forward).
	useEffect(() => {
		setLocalPan(pan);
	}, [pan]);

	const display =
		localPan === 0
			? "C"
			: `${localPan < 0 ? "L" : "R"}${Math.round(Math.abs(localPan) * 100)}`;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-7"
					title={`Pan — ${display}`}
					aria-label="Adjust clip stereo pan"
				>
					<SwitchHorizontal className="size-4" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="center" className="w-56 p-3">
				<div className="flex items-center justify-between mb-2">
					<span className="text-xs text-muted-foreground">Pan</span>
					<span className="text-xs tabular-nums">{display}</span>
				</div>
				<Slider
					value={[localPan * 100]}
					onValueChange={([v]) => setLocalPan(v / 100)}
					onValueCommit={([v]) => onChange(v / 100)}
					min={-100}
					max={100}
					step={1}
					aria-label="Clip stereo pan"
				/>
				<div className="flex justify-between mt-2 text-xs text-muted-foreground tabular-nums">
					<span>L</span>
					<span>C</span>
					<span>R</span>
				</div>
			</PopoverContent>
		</Popover>
	);
}
