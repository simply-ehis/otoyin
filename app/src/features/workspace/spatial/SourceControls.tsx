import {
	PlusIcon,
	SpeakerWaveIcon,
	SpeakerXMarkIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/ui/button";
import { Label } from "@/ui/primitives";
import { Slider } from "@/ui/slider";
import { Toggle } from "@/ui/toggle";
import type { SoundSource } from "./types";

export function SourceControls({
	sources,
	onAdd,
	onRemove,
	onToggleMute,
	onUpdateGain,
}: {
	sources: SoundSource[];
	onAdd: () => void;
	onRemove: (id: string) => void;
	onToggleMute: (id: string) => void;
	onUpdateGain: (id: string, gain: number) => void;
}) {
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<Label>
					Sources{" "}
					<span className="text-muted-foreground">({sources.length})</span>
				</Label>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="size-6 p-0"
					title="Add source"
					aria-label="Add source"
					onClick={onAdd}
				>
					<PlusIcon className="size-3" aria-hidden="true" />
				</Button>
			</div>
			{sources.map((s) => (
				<div
					key={s.id}
					className="flex items-center gap-2 rounded-md border border-border bg-card p-2"
				>
					<span className="w-16 truncate text-xs text-foreground">
						{s.label}
					</span>
					<Toggle
						pressed={!s.muted}
						onPressedChange={() => onToggleMute(s.id)}
						className="size-6 p-0"
						title={s.muted ? "Unmute" : "Mute"}
						aria-label={s.muted ? `Unmute ${s.label}` : `Mute ${s.label}`}
					>
						{s.muted ? (
							<SpeakerXMarkIcon className="size-3" aria-hidden="true" />
						) : (
							<SpeakerWaveIcon className="size-3" aria-hidden="true" />
						)}
					</Toggle>
					<Slider
						min={0}
						max={2}
						step={0.05}
						value={[s.gain]}
						onValueChange={([v]) => onUpdateGain(s.id, v ?? 1)}
						className="flex-1"
						aria-label={`${s.label} gain`}
					/>
					<span className="w-8 font-mono text-xs tabular-nums text-muted-foreground">
						{s.gain.toFixed(1)}
					</span>
					{sources.length > 1 && (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="size-6 p-0"
							title={`Remove ${s.label}`}
							aria-label={`Remove ${s.label}`}
							onClick={() => onRemove(s.id)}
						>
							<TrashIcon className="size-3" aria-hidden="true" />
						</Button>
					)}
				</div>
			))}
		</div>
	);
}
