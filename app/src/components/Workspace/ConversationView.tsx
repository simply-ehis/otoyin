import {
	ChartBarIcon as BarChart3,
	ChatBubbleLeftRightIcon as MessageSquare,
	PlusIcon as Plus,
	SparklesIcon as Wand2,
	XMarkIcon as X,
} from "@heroicons/react/24/outline";
import { useMutation } from "@tanstack/react-query";
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

interface Speaker {
	id: string;
	name: string;
	profileId?: string;
}
interface ConversationLine {
	id: string;
	speakerId: string;
	text: string;
	startMode: "relative_to_previous" | "absolute";
	offsetMs: number;
	overlapMs: number;
}
const PRESETS = [
	"debate",
	"podcast_interview",
	"podcast_panel",
	"dramatic_dialogue",
] as const;
const DEFAULT_LINES: ConversationLine[] = [
	{
		id: "1",
		speakerId: "1",
		text: "",
		startMode: "relative_to_previous",
		offsetMs: 0,
		overlapMs: 0,
	},
];
let nextSpeakerId = 2;
let nextLineId = 2;

export function ConversationView() {
	const { toast } = useToast();
	const [preset, setPreset] = useState<string>("podcast_interview");
	const [speakers, setSpeakers] = useState<Speaker[]>([
		{ id: "1", name: "Speaker A" },
		{ id: "2", name: "Speaker B" },
	]);
	const [lines, setLines] = useState<ConversationLine[]>(DEFAULT_LINES);

	const duckMut = useMutation({
		mutationFn: () =>
			apiClient.autoDuckSpeakers(
				lines.map((l) => ({
					id: l.id,
					text: l.text,
					speaker: speakers.find((s) => s.id === l.speakerId)?.name ?? "",
					start_mode: l.startMode,
					start_offset_ms: l.offsetMs,
					overlap_ms: l.overlapMs,
				})),
			),
		onSuccess: () => toast({ title: "Auto-duck gains computed" }),
		onError: (e: unknown) =>
			toast({
				title: "Auto-duck failed",
				description: e instanceof Error ? e.message : String(e),
				variant: "destructive",
			}),
	});

	const levelMut = useMutation({
		mutationFn: () =>
			apiClient.autoLevelMatch(
				lines.map((l) => ({
					id: l.id,
					text: l.text,
					speaker: speakers.find((s) => s.id === l.speakerId)?.name ?? "",
					start_mode: l.startMode,
					start_offset_ms: l.offsetMs,
					overlap_ms: l.overlapMs,
				})),
			),
		onSuccess: () => toast({ title: "Level matching complete" }),
		onError: (e: unknown) =>
			toast({
				title: "Level match failed",
				description: e instanceof Error ? e.message : String(e),
				variant: "destructive",
			}),
	});

	const addSpeaker = useCallback(() => {
		const id = String(nextSpeakerId++);
		setSpeakers((p) => [
			...p,
			{ id, name: `Speaker ${String.fromCharCode(64 + p.length + 1)}` },
		]);
	}, []);

	const removeSpeaker = useCallback((id: string) => {
		setSpeakers((p) => p.filter((s) => s.id !== id));
		setLines((p) => p.filter((l) => l.speakerId !== id));
	}, []);

	const addLine = useCallback(() => {
		setLines((p) => [
			...p,
			{
				id: String(nextLineId++),
				speakerId: speakers[0]?.id ?? "1",
				text: "",
				startMode: "relative_to_previous",
				offsetMs: 0,
				overlapMs: 0,
			},
		]);
	}, [speakers]);

	const updateLine = useCallback(
		(id: string, patch: Partial<ConversationLine>) => {
			setLines((p) => p.map((l) => (l.id === id ? { ...l, ...patch } : l)));
		},
		[],
	);

	const removeLine = useCallback((id: string) => {
		setLines((p) => p.filter((l) => l.id !== id));
	}, []);

	return (
		<div className="flex flex-col h-full p-4 gap-4">
			<ScreenHeader
				icon={<MessageSquare className="size-5" />}
				title="Conversation Mode"
				description="Multi-speaker dialogue arrangement"
			/>

			<div className="space-y-1.5">
				<Label className="text-xs">Conversation Preset</Label>
				<Select value={preset} onValueChange={setPreset}>
					<SelectTrigger className="h-8 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{PRESETS.map((p) => (
							<SelectItem key={p} value={p}>
								{p.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<Separator />
			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<Label className="text-xs">Speakers</Label>
					<Button
						variant="ghost"
						size="sm"
						className="h-6 text-xs"
						onClick={addSpeaker}
						title="Add speaker"
						aria-label="Add speaker"
					>
						<Plus className="size-3 mr-1" />
						Add
					</Button>
				</div>
				<div className="flex flex-wrap gap-2">
					{speakers.map((s) => (
						<div
							key={s.id}
							className="flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-card text-xs"
						>
							<span className="text-foreground">{s.name}</span>
							{speakers.length > 1 && (
								<button
									type="button"
									className="text-destructive/60 hover:text-destructive ml-1"
									onClick={() => removeSpeaker(s.id)}
									title={`Remove ${s.name}`}
									aria-label={`Remove ${s.name}`}
								>
									<X className="size-3" />
								</button>
							)}
						</div>
					))}
				</div>
			</div>
			<Separator />
			<div className="space-y-2 overflow-y-auto flex-1">
				<div className="flex items-center justify-between">
					<Label className="text-xs">Dialogue Lines</Label>
					<Button
						variant="ghost"
						size="sm"
						className="h-6 text-xs"
						onClick={addLine}
						title="Add line"
						aria-label="Add line"
					>
						<Plus className="size-3 mr-1" />
						Line
					</Button>
				</div>
				{lines.map((line, idx) => (
					<div
						key={line.id}
						className="rounded-lg border border-border bg-card p-3 space-y-2"
					>
						<div className="flex items-center justify-between">
							<Badge variant="secondary" className="text-xs">
								L{idx + 1}
							</Badge>
							<button
								type="button"
								className="text-destructive/60 hover:text-destructive"
								onClick={() => removeLine(line.id)}
								title="Remove line"
								aria-label="Remove line"
							>
								<X className="size-3" />
							</button>
						</div>
						<Select
							value={line.speakerId}
							onValueChange={(v) => updateLine(line.id, { speakerId: v })}
						>
							<SelectTrigger className="h-7 text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{speakers.map((s) => (
									<SelectItem key={s.id} value={s.id}>
										{s.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Select
							value={line.startMode}
							onValueChange={(v) =>
								updateLine(line.id, {
									startMode: v as ConversationLine["startMode"],
								})
							}
						>
							<SelectTrigger className="h-7 text-xs">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="relative_to_previous">
									Relative to Previous
								</SelectItem>
								<SelectItem value="absolute">Absolute</SelectItem>
							</SelectContent>
						</Select>
						<div className="flex gap-3">
							<div className="flex-1 space-y-1">
								<Label className="text-xs text-muted-foreground">
									Offset (ms)
								</Label>
								<Slider
									min={-2000}
									max={2000}
									step={10}
									value={[line.offsetMs]}
									onValueChange={([v]) => updateLine(line.id, { offsetMs: v })}
								/>
							</div>
							<div className="flex-1 space-y-1">
								<Label className="text-xs text-muted-foreground">
									Overlap (ms)
								</Label>
								<Slider
									min={0}
									max={1000}
									step={10}
									value={[line.overlapMs]}
									onValueChange={([v]) => updateLine(line.id, { overlapMs: v })}
								/>
							</div>
						</div>
					</div>
				))}
			</div>
			<div className="flex items-center gap-2 pt-1">
				<Button
					size="sm"
					variant="outline"
					className="h-8 text-xs"
					disabled={duckMut.isPending}
					onClick={() => duckMut.mutate()}
					title="Auto-duck speakers during overlap"
					aria-label="Auto-duck"
				>
					{duckMut.isPending ? (
						<Spinner size="sm" className="mr-1" />
					) : (
						<Wand2 className="h-3.5 w-3.5 mr-1" />
					)}
					Auto-Duck
				</Button>
				<Button
					size="sm"
					variant="outline"
					className="h-8 text-xs"
					disabled={levelMut.isPending}
					onClick={() => levelMut.mutate()}
					title="Auto-level match speakers"
					aria-label="Auto-level"
				>
					{levelMut.isPending ? (
						<Spinner size="sm" className="mr-1" />
					) : (
						<BarChart3 className="h-3.5 w-3.5 mr-1" />
					)}
					Auto-Level
				</Button>
			</div>
			<div className="rounded-lg border border-border bg-card p-3">
				<p className="text-xs text-muted-foreground/60 mb-2">
					Multi-speaker overlapping waveform
				</p>
				<div className="h-16 rounded bg-muted/30 flex items-end gap-px px-1">
					{Array.from({ length: 60 }, (_, idx) => ({ k: idx, i: idx })).map(
						({ k, i }) => (
							<div
								key={k}
								className={cn(
									"flex-1 rounded-t-sm",
									i % 10 < 5 ? "bg-accent/30" : "bg-foreground/20",
								)}
								style={{ height: `${15 + Math.sin(i * 0.5) * 12}%` }}
							/>
						),
					)}
				</div>
			</div>
		</div>
	);
}
