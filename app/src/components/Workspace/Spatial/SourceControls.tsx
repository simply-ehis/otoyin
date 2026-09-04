import {
	PlusIcon,
	SpeakerWaveIcon,
	SpeakerXMarkIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import type { SoundSource } from "./types";

interface Props {
	sources: SoundSource[];
	onAdd: () => void;
	onRemove: (id: string) => void;
	onToggleMute: (id: string) => void;
	onUpdateGain: (id: string, gain: number) => void;
}

export function SourceControls({
	sources,
	onAdd,
	onRemove,
	onToggleMute,
	onUpdateGain,
}: Props) {
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<Label className="text-xs">Sources ({sources.length})</Label>
				<Button
					variant="ghost"
					size="icon"
					className="size-5"
					onClick={onAdd}
					title="Add source"
				>
					<PlusIcon className="size-3" />
				</Button>
			</div>
			{sources.map((s) => (
				<div key={s.id} className="flex items-center gap-2 rounded border p-2">
					<span className="text-xs w-16 truncate">{s.label}</span>
					<Toggle
						checked={!s.muted}
						onCheckedChange={() => onToggleMute(s.id)}
						className="size-5 p-0"
						label={s.muted ? "Unmute" : "Mute"}
					>
						{s.muted ? (
							<SpeakerXMarkIcon className="size-3" />
						) : (
							<SpeakerWaveIcon className="size-3" />
						)}
					</Toggle>
					<Slider
						min={0}
						max={2}
						step={0.05}
						value={[s.gain]}
						onValueChange={([v]) => onUpdateGain(s.id, v)}
						className="flex-1"
					/>
					<span className="text-xs font-mono w-8">{s.gain.toFixed(1)}</span>
					{sources.length > 1 && (
						<Button
							variant="ghost"
							size="icon"
							className="size-5"
							onClick={() => onRemove(s.id)}
							title="Remove"
						>
							<TrashIcon className="size-3" />
						</Button>
					)}
				</div>
			))}
		</div>
	);
}
