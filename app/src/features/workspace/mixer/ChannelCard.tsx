import { Button } from "@/ui/button";
import { Label } from "@/ui/primitives";
import { Slider } from "@/ui/slider";
import type { ChannelState } from "./mixerTypes";

export function ChannelCard({
	ch,
	onUpdate,
	onRemove,
}: {
	ch: ChannelState;
	onUpdate: (id: string, updates: Partial<ChannelState>) => void;
	onRemove: (id: string) => void;
}) {
	return (
		<div className="flex min-w-52 flex-1 flex-col gap-3 rounded-md border border-border bg-card p-3">
			<div className="flex min-w-0 items-center gap-2">
				<span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
					{ch.name}
				</span>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-7 px-2 text-xs"
					title={`Remove ${ch.name}`}
					aria-label={`Remove ${ch.name}`}
					onClick={() => onRemove(ch.id)}
				>
					Remove
				</Button>
			</div>
			<div>
				<Label className="mb-1 block">
					Volume {Math.round(ch.volume * 100)}%
				</Label>
				<Slider
					min={0}
					max={1}
					step={0.01}
					value={[ch.volume]}
					onValueChange={([v]) => onUpdate(ch.id, { volume: v ?? 0 })}
					aria-label={`${ch.name} volume`}
				/>
			</div>
			<div>
				<Label className="mb-1 block">
					Pan {ch.pan === 0 ? "center" : ch.pan < 0 ? "left" : "right"}
				</Label>
				<Slider
					min={-1}
					max={1}
					step={0.01}
					value={[ch.pan]}
					onValueChange={([v]) => onUpdate(ch.id, { pan: v ?? 0 })}
					aria-label={`${ch.name} pan`}
				/>
			</div>
			<div className="flex gap-2">
				<Button
					type="button"
					variant={ch.muted ? "destructive" : "outline"}
					size="sm"
					className="h-7 flex-1 text-xs"
					aria-pressed={ch.muted}
					title={ch.muted ? `Unmute ${ch.name}` : `Mute ${ch.name}`}
					onClick={() => onUpdate(ch.id, { muted: !ch.muted })}
				>
					{ch.muted ? "Muted" : "Mute"}
				</Button>
				<Button
					type="button"
					variant={ch.soloed ? "default" : "outline"}
					size="sm"
					className="h-7 flex-1 text-xs"
					aria-pressed={ch.soloed}
					title={ch.soloed ? `Unsolo ${ch.name}` : `Solo ${ch.name}`}
					onClick={() => onUpdate(ch.id, { soloed: !ch.soloed })}
				>
					{ch.soloed ? "Soloed" : "Solo"}
				</Button>
			</div>
		</div>
	);
}
