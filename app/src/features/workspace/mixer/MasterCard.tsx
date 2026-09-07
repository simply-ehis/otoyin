import type { UseMutationResult } from "@tanstack/react-query";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Spinner } from "@/ui/primitives";
import { Slider } from "@/ui/slider";

export function MasterCard({
	masterVolume,
	masterLevel,
	onMasterVolumeChange,
	channelsLength,
	previewMut,
}: {
	masterVolume: number;
	masterLevel: number;
	onMasterVolumeChange: (v: number) => void;
	channelsLength: number;
	previewMut: UseMutationResult<Blob, Error, void>;
}) {
	return (
		<div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3">
			<div className="flex items-center justify-between gap-2">
				<span className="text-xs font-semibold uppercase tracking-wide text-accent">
					Master
				</span>
				<span className="text-xs tabular-nums text-muted-foreground">
					{Math.round(masterVolume * 100)}%
				</span>
			</div>
			<div
				className="h-2 overflow-hidden rounded-full bg-secondary"
				role="img"
				aria-label={`Master output level ${Math.round(masterLevel * 100)} percent`}
			>
				<div
					className={cn(
						"h-full rounded-full transition-[width]",
						masterLevel > 0.85 ? "bg-destructive" : "bg-accent",
					)}
					style={{ width: `${Math.min(100, masterLevel * 100)}%` }}
				/>
			</div>
			<Slider
				min={0}
				max={1}
				step={0.01}
				value={[masterVolume]}
				onValueChange={([v]) => onMasterVolumeChange(v ?? 0.8)}
				aria-label="Master volume"
			/>
			<Button
				type="button"
				variant="outline"
				size="sm"
				className="h-8 self-start text-xs"
				disabled={channelsLength === 0 || previewMut.isPending}
				title="Render and play the current mix"
				aria-label="Preview mix"
				onClick={() => previewMut.mutate()}
			>
				{previewMut.isPending ? <Spinner size="xs" className="mr-1" /> : null}
				{previewMut.isPending ? "Rendering…" : "Preview Mix"}
			</Button>
		</div>
	);
}
