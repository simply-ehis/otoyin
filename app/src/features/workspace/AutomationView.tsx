import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Label, Separator, Spinner } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { Slider } from "@/ui/slider";
import { EmptyState, ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";
import { hueEdge, hueText } from "./hueIdentity";

interface AutomationPoint {
	time: number;
	value: number;
}

const FALLBACK_LANES = ["volume", "pan", "pitch"] as const;
const FALLBACK_CURVES = ["linear", "logarithmic", "exponential", "equal_power"];

function laneLabel(id: string) {
	return id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AutomationView() {
	const { toast } = useToast();
	const [lanes, setLanes] = useState<Record<string, AutomationPoint[]>>({});
	const [activeLane, setActiveLane] = useState<string>("volume");
	const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
	const [curve, setCurve] = useState<string>("linear");

	const paramsQuery = useQuery({
		queryKey: ["automation-parameters"],
		queryFn: () => apiClient.getAutomationParameters(),
		staleTime: 5 * 60 * 1000,
	});
	const curvesQuery = useQuery({
		queryKey: ["crossfade-curves"],
		queryFn: () => apiClient.getCrossfadeCurves(),
		staleTime: 5 * 60 * 1000,
	});

	const laneIds =
		paramsQuery.data && Object.keys(paramsQuery.data).length > 0
			? Object.keys(paramsQuery.data)
			: [...FALLBACK_LANES];
	const laneDef = paramsQuery.data?.[activeLane];
	const laneMin = laneDef?.min ?? 0;
	const laneMax = laneDef?.max ?? 1;
	const laneDefault = laneDef?.default ?? 0.5;
	const curveIds =
		curvesQuery.data && Object.keys(curvesQuery.data).length > 0
			? Object.keys(curvesQuery.data)
			: FALLBACK_CURVES;
	const curveName = (id: string) =>
		curvesQuery.data?.[id]?.name ?? laneLabel(id);
	const activeLaneIndex = Math.max(0, laneIds.indexOf(activeLane));

	const points = lanes[activeLane] ?? [
		{ time: 0, value: laneDefault },
		{ time: 100, value: laneDefault },
	];

	function setPoints(next: AutomationPoint[]) {
		const sorted = [...next].sort((a, b) => a.time - b.time);
		setLanes((p) => ({ ...p, [activeLane]: sorted }));
	}

	const interpolateMut = useMutation({
		mutationFn: () =>
			apiClient.interpolateAutomationPoints(
				points.map((p) => [p.time, p.value]),
				curve,
			),
		onSuccess: (data) => {
			const env = data.envelope ?? [];
			setPoints(
				env.map(([t, v]) => ({ time: t ?? 0, value: v ?? laneDefault })),
			);
			toast({ title: `Interpolated ${env.length} points` });
		},
		onError: (e: unknown) =>
			toast({
				title: "Interpolation failed",
				description: e instanceof Error ? e.message : String(e),
				variant: "destructive",
			}),
	});

	function pushCuePoint(index: number) {
		const time = Math.round((index / 15) * 100);
		const value =
			Math.round(((index % 5) / 4) * (laneMax - laneMin) * 100) / 100 + laneMin;
		setPoints([...points, { time, value: Math.min(laneMax, value) }]);
	}

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader title="Automation & Cues" />

			<Separator />

			<div className="space-y-1.5">
				<Label id="automation-lane-label">Active lane</Label>
				<fieldset
					className="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0"
					aria-labelledby="automation-lane-label"
				>
					{laneIds.map((lane, laneIndex) => (
						<button
							key={lane}
							type="button"
							aria-pressed={activeLane === lane}
							className={cn(
								"rounded-md border px-3 py-1 text-xs font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								hueEdge(laneIndex),
								activeLane === lane
									? "border-accent bg-accent-muted"
									: "border-border bg-card text-muted-foreground hover:text-foreground",
								activeLane === lane && hueText(laneIndex),
							)}
							title={`${laneLabel(lane)} lane`}
							onClick={() => {
								setActiveLane(lane);
								setSelectedPoint(null);
							}}
						>
							{laneLabel(lane)}
						</button>
					))}
				</fieldset>
			</div>

			<section className="space-y-2 rounded-md border border-border bg-card p-3">
				<div className="flex items-center justify-between gap-2">
					<h2 className="text-xs font-medium capitalize text-foreground">
						{laneLabel(activeLane)} envelope
					</h2>
					<div className="flex gap-2">
						{selectedPoint !== null && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="h-6 text-xs"
								title="Remove selected point"
								aria-label="Remove selected point"
								onClick={() => {
									setPoints(points.filter((_, i) => i !== selectedPoint));
									setSelectedPoint(null);
								}}
							>
								Remove
							</Button>
						)}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-6 text-xs"
							title="Add point"
							aria-label="Add automation point"
							onClick={() =>
								setPoints([...points, { time: 100, value: laneDefault }])
							}
						>
							+ Point
						</Button>
					</div>
				</div>

				<div
					className={cn(
						"relative h-20 overflow-hidden rounded-md bg-secondary",
						hueText(activeLaneIndex),
					)}
				>
					<svg
						className="absolute inset-0 h-full w-full"
						viewBox="0 0 100 100"
						preserveAspectRatio="none"
						aria-hidden="true"
					>
						<polyline
							points={points
								.map(
									(p) =>
										`${p.time},${(1 - (p.value - laneMin) / (laneMax - laneMin || 1)) * 100}`,
								)
								.join(" ")}
							fill="none"
							stroke="currentColor"
							strokeWidth={2}
							vectorEffect="non-scaling-stroke"
						/>
					</svg>
					{points.map((p, i) => (
						<button
							key={`${p.time}-${i}`}
							type="button"
							aria-pressed={selectedPoint === i}
							className={cn(
								"absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								selectedPoint === i
									? "bg-accent ring-2 ring-accent"
									: "bg-foreground hover:bg-accent",
							)}
							style={{
								left: `${p.time}%`,
								top: `${(1 - (p.value - laneMin) / (laneMax - laneMin || 1)) * 100}%`,
							}}
							title={`t=${p.time.toFixed(0)}% v=${p.value.toFixed(2)}`}
							aria-label={`Automation point ${i + 1} at ${p.time.toFixed(0)} percent, value ${p.value.toFixed(2)}`}
							onClick={() => setSelectedPoint(i)}
						/>
					))}
				</div>

				<div className="max-h-32 space-y-1.5 overflow-y-auto">
					{points.map((p, i) => (
						<div
							key={`${p.time}-${i}`}
							className="flex items-center gap-2 text-xs"
						>
							<span className="w-6 text-center tabular-nums text-muted-foreground">
								{i + 1}
							</span>
							<span className="w-14 font-mono tabular-nums text-muted-foreground">
								{p.time.toFixed(0)}%
							</span>
							<Slider
								min={laneMin}
								max={laneMax}
								step={(laneMax - laneMin) / 100 || 0.01}
								value={[p.value]}
								onValueChange={([v]) =>
									setPoints(
										points.map((q, j) =>
											j === i ? { ...q, value: v ?? q.value } : q,
										),
									)
								}
								className="flex-1"
								aria-label={`Point ${i + 1} value`}
							/>
							<span className="w-10 font-mono tabular-nums text-muted-foreground">
								{p.value.toFixed(2)}
							</span>
						</div>
					))}
				</div>

				<div className="flex flex-wrap items-center gap-2 pt-1">
					<Select value={curve} onValueChange={setCurve}>
						<SelectTrigger
							className="h-7 w-36 text-xs"
							aria-label="Interpolation curve"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{curveIds.map((c) => (
								<SelectItem key={c} value={c}>
									{curveName(c)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="h-7 text-xs"
						disabled={interpolateMut.isPending || points.length < 2}
						title="Interpolate points"
						aria-label="Interpolate points"
						onClick={() => interpolateMut.mutate()}
					>
						{interpolateMut.isPending ? (
							<Spinner size="xs" className="mr-1" />
						) : null}
						Interpolate
					</Button>
				</div>
			</section>

			<Separator />

			<section className="space-y-2">
				<Label id="cue-matrix-label">Cue matrix (4×4)</Label>
				<fieldset
					className="m-0 grid min-w-0 grid-cols-4 gap-2 border-0 p-0"
					aria-labelledby="cue-matrix-label"
				>
					{Array.from({ length: 16 }, (_, i) => (
						<button
							// biome-ignore lint/suspicious/noArrayIndexKey: static 16-pad grid
							key={`cue-pad-${i}`}
							type="button"
							className="flex h-10 flex-col items-center justify-center rounded-md border border-border bg-card transition-all hover:border-strong active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							title={`Cue pad ${i + 1} — writes a point to the ${laneLabel(activeLane)} lane`}
							aria-label={`Cue pad ${i + 1}`}
							onClick={() => pushCuePoint(i)}
						>
							<span className="text-xs font-medium text-foreground">
								F{Math.min(i + 1, 12)}
							</span>
							<span className="text-[8px] text-muted-foreground">
								Cue {i + 1}
							</span>
						</button>
					))}
				</fieldset>
			</section>

			{paramsQuery.isError && curvesQuery.isError ? (
				<EmptyState
					title="Automation tables couldn't load"
					body="Using the built-in lane and curve lists instead."
				/>
			) : null}
		</div>
	);
}
