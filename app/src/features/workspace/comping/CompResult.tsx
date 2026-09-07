import { PlayIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Label, Spinner } from "@/ui/primitives";
import type { TakeLane } from "./compingTypes";
import { TOTAL_DURATION_MS } from "./compingUtils";

interface CompResultProps {
	lanes: TakeLane[];
	compedCount: number;
	isPending: boolean;
	compLoading: boolean;
	onAssemble: () => void;
}

export function CompResult({
	lanes,
	compedCount,
	isPending,
	compLoading,
	onAssemble,
}: CompResultProps) {
	return (
		<section className="space-y-2 rounded-md border border-border bg-card p-3">
			<div className="flex items-center justify-between">
				<Label>
					Comp result{" "}
					<span className="text-muted-foreground">
						({compedCount} of {lanes.length} lanes)
					</span>
				</Label>
			</div>
			<div className="relative h-8 overflow-hidden rounded-md bg-secondary">
				{lanes.map((lane, compLaneIndex) => {
					const region = lane.regions.find(
						(r) => r.id === lane.selectedRegionId,
					);
					if (!region) {
						return null;
					}
					return (
						<div
							key={lane.id}
							aria-hidden="true"
							title={`${lane.name} — ${region.label}`}
							className={cn(
								"absolute bottom-0.5 top-0.5 rounded-sm",
								compLaneIndex % 2 === 0 ? "bg-accent" : "bg-foreground",
							)}
							style={{
								left: `${(region.startMs / TOTAL_DURATION_MS) * 100}%`,
								width: `${((region.endMs - region.startMs) / TOTAL_DURATION_MS) * 100}%`,
							}}
						/>
					);
				})}
			</div>
			<Button
				type="button"
				size="sm"
				variant="outline"
				className="h-7 text-xs"
				disabled={isPending || compedCount === 0}
				title="Assemble and play the comp"
				aria-label="Assemble and play comp"
				onClick={onAssemble}
			>
				{isPending || compLoading ? (
					<Spinner size="xs" className="mr-1" />
				) : (
					<PlayIcon className="mr-1 size-3" aria-hidden="true" />
				)}
				{isPending || compLoading ? "Assembling…" : "Play Comp"}
			</Button>
		</section>
	);
}
