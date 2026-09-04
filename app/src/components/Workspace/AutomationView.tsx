import {
	AdjustmentsHorizontalIcon as SlidersHorizontal,
	BoltIcon as Zap,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Spinner } from "@/components/ui/Spinner";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";

interface AutomationPoint {
	time: number;
	value: number;
}

type LaneType = "volume" | "pan" | "pitch" | "effects";

const LANE_COLORS: Record<LaneType, string> = {
	volume: "bg-green-500/40",
	pan: "bg-blue-500/40",
	pitch: "bg-purple-500/40",
	effects: "bg-amber-500/40",
};

const CROSSFADE_CURVES = [
	"linear",
	"logarithmic",
	"exponential",
	"equal_power",
] as const;

const CUE_GRID = Array.from({ length: 16 }, (_, i) => ({
	id: String(i + 1),
	hotkey: `F${Math.min(i + 1, 12)}`,
	label: "",
}));

export function AutomationView() {
	const { toast } = useToast();
	const [activeLane, setActiveLane] = useState<LaneType>("volume");
	const [selectedPointIdx, setSelectedPointIdx] = useState<number | null>(null);
	const [points, setPoints] = useState<AutomationPoint[]>([
		{ time: 0, value: 0.5 },
		{ time: 50, value: 0.8 },
		{ time: 100, value: 0.5 },
	]);
	const [curve, setCurve] = useState<string>("linear");

	const interpolateMut = useMutation({
		mutationFn: () =>
			apiClient.interpolateAutomationPoints(
				points.map((p) => [p.time, p.value]),
				curve,
			),
		onSuccess: (data) => {
			const env = data.envelope ?? [];
			toast({ title: `Interpolated ${env.length} points` });
		},
		onError: (e: unknown) =>
			toast({
				title: "Interpolation failed",
				description: e instanceof Error ? e.message : String(e),
				variant: "destructive",
			}),
	});

	useQuery({
		queryKey: ["crossfade-curves"],
		queryFn: () => apiClient.getCrossfadeCurves(),
	});

	const addPoint = useCallback(() => {
		setPoints((prev) => [...prev, { time: 100, value: 0.5 }]);
	}, []);

	const updatePoint = useCallback(
		(idx: number, patch: Partial<AutomationPoint>) => {
			setPoints((prev) =>
				prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
			);
		},
		[],
	);

	return (
		<div className="flex flex-col h-full p-4 gap-4">
			<ScreenHeader
				icon={<SlidersHorizontal className="size-5" />}
				title="Automation & Cues"
				description="Macro automation lanes & cue matrix"
			/>

			<Separator />

			{/* Lane selector */}
			<div className="space-y-1.5">
				<Label className="text-xs">Active Lane</Label>
				<div className="flex gap-2">
					{(["volume", "pan", "pitch", "effects"] as LaneType[]).map((lane) => (
						<button
							type="button"
							key={lane}
							className={cn(
								"px-3 py-1 rounded-md text-xs font-medium transition-colors border",
								activeLane === lane
									? "border-accent bg-accent/15 text-accent-foreground"
									: "border-border bg-card text-muted-foreground hover:text-foreground",
							)}
							onClick={() => setActiveLane(lane)}
							title={`${lane} lane`}
							aria-label={`${lane} lane`}
						>
							{lane}
						</button>
					))}
				</div>
			</div>

			{/* Lane editor */}
			<div className="rounded-lg border border-border bg-card p-3 space-y-2">
				<div className="flex items-center justify-between">
					<span className="text-xs font-medium text-foreground capitalize">
						{activeLane} Automation
					</span>
					<Button
						variant="ghost"
						size="sm"
						className="h-6 text-xs"
						onClick={addPoint}
						title="Add point"
						aria-label="Add point"
					>
						+ Point
					</Button>
				</div>
				{/* Visual lane */}
				<div className="relative h-20 rounded bg-muted/30 overflow-hidden">
					<div
						className={cn(
							"absolute inset-0 opacity-30",
							LANE_COLORS[activeLane],
						)}
					/>
					{points
						.map((p, i) => ({ p, k: i }))
						.map(({ p, k }) => (
							<button
								key={k}
								type="button"
								tabIndex={-1}
								className={cn(
									"absolute size-3 rounded-full -translate-x-1/2 -translate-y-1/2 cursor-pointer hover:ring-2 hover:ring-accent",
									selectedPointIdx === k
										? "bg-accent ring-2 ring-accent"
										: "bg-foreground/80",
								)}
								style={{ left: `${p.time}%`, top: `${(1 - p.value) * 100}%` }}
								title={`t=${p.time.toFixed(0)}% v=${p.value.toFixed(2)}`}
								aria-label={`Automation point at ${p.time.toFixed(0)}%`}
								onClick={() => setSelectedPointIdx(k)}
							/>
						))}
				</div>
				{/* Point editors */}
				<div className="space-y-1.5 max-h-32 overflow-y-auto">
					{points
						.map((p, i) => ({ p, k: i, i }))
						.map(({ p, k, i }) => (
							<div key={k} className="flex items-center gap-2 text-xs">
								<Badge
									variant="secondary"
									className="text-xs w-6 justify-center"
								>
									{i + 1}
								</Badge>
								<span className="text-muted-foreground w-14 font-mono">
									{p.time.toFixed(0)}%
								</span>
								<Slider
									min={0}
									max={1}
									step={0.01}
									value={[p.value]}
									onValueChange={([v]) => updatePoint(i, { value: v })}
									className="flex-1"
								/>
								<span className="text-muted-foreground w-10 font-mono">
									{p.value.toFixed(2)}
								</span>
							</div>
						))}
				</div>
				{/* Curve selector + interpolate */}
				<div className="flex items-center gap-2 pt-1">
					<Select value={curve} onValueChange={setCurve}>
						<SelectTrigger className="h-7 text-xs w-36">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{CROSSFADE_CURVES.map((c) => (
								<SelectItem key={c} value={c}>
									{c.replace(/_/g, " ")}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						size="sm"
						variant="outline"
						className="h-7 text-xs"
						disabled={interpolateMut.isPending}
						onClick={() => interpolateMut.mutate()}
						title="Interpolate points"
						aria-label="Interpolate"
					>
						{interpolateMut.isPending ? (
							<Spinner size="xs" className="mr-1" />
						) : null}
						Interpolate
					</Button>
				</div>
			</div>

			<Separator />

			{/* Cue Grid */}
			<div className="space-y-2">
				<div className="flex items-center gap-2">
					<Zap className="h-3.5 w-3.5 text-muted-foreground" />
					<Label className="text-xs">Cue Matrix (4x4)</Label>
				</div>
				<div className="grid grid-cols-4 gap-2">
					{CUE_GRID.map((cue) => (
						<button
							type="button"
							key={cue.id}
							className="h-10 rounded-md border border-border bg-card hover:border-accent/50 hover:bg-accent/10 flex flex-col items-center justify-center transition-colors cursor-pointer active:scale-95"
							title={`Cue ${cue.id} — ${cue.hotkey}`}
							aria-label={`Cue ${cue.id}`}
							onClick={() => {
								const cueIndex = parseInt(cue.id, 10) - 1;
								const value =
									Math.round((cueIndex / (CUE_GRID.length - 1)) * 100) / 100;
								setPoints((prev) => {
									const existing = prev.findIndex(
										(p) => Math.abs(p.time - cueIndex) < 0.5,
									);
									if (existing >= 0) {
										return prev.map((p, i) =>
											i === existing ? { ...p, value } : p,
										);
									}
									return [...prev, { time: cueIndex, value }];
								});
							}}
						>
							<span className="text-xs font-medium text-foreground">
								{cue.hotkey}
							</span>
							<span className="text-[8px] text-muted-foreground/50">
								{cue.label || `Cue ${cue.id}`}
							</span>
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
