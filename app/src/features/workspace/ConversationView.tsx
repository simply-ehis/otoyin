import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { Button } from "@/ui/button";
import { Input, Textarea } from "@/ui/input";
import { Badge, Label, Separator, Spinner } from "@/ui/primitives";
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

interface Speaker {
	id: string;
	name: string;
}

interface ConversationLine {
	id: string;
	speakerId: string;
	text: string;
	startMode: "relative_to_previous" | "absolute";
	offsetMs: number;
	overlapMs: number;
}

const FALLBACK_PRESETS = [
	"debate",
	"podcast_interview",
	"podcast_panel",
	"dramatic_dialogue",
] as const;

function presetLabel(p: string) {
	return p.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ConversationView() {
	const { toast } = useToast();
	const [preset, setPreset] = useState<string>("podcast_interview");
	const [speakers, setSpeakers] = useState<Speaker[]>([
		{ id: "spk-1", name: "Speaker A" },
		{ id: "spk-2", name: "Speaker B" },
	]);
	const [lines, setLines] = useState<ConversationLine[]>([
		{
			id: "line-1",
			speakerId: "spk-1",
			text: "",
			startMode: "relative_to_previous",
			offsetMs: 0,
			overlapMs: 0,
		},
	]);

	const presetsQuery = useQuery({
		queryKey: ["conversation-presets"],
		queryFn: () => apiClient.listConversationPresets(),
		staleTime: 5 * 60 * 1000,
	});
	const presetIds =
		presetsQuery.data && Object.keys(presetsQuery.data).length > 0
			? Object.keys(presetsQuery.data)
			: [...FALLBACK_PRESETS];
	const presetName = (id: string) =>
		presetsQuery.data?.[id]?.name ?? presetLabel(id);

	function linePayload() {
		return lines.map((l) => ({
			id: l.id,
			text: l.text,
			speaker: speakers.find((s) => s.id === l.speakerId)?.name ?? "",
			start_mode: l.startMode,
			start_offset_ms: l.offsetMs,
			overlap_ms: l.overlapMs,
		}));
	}

	const duckMut = useMutation({
		mutationFn: () => apiClient.autoDuckSpeakers(linePayload()),
		onSuccess: () => toast({ title: "Auto-duck gains computed" }),
		onError: (e: unknown) =>
			toast({
				title: "Auto-duck failed",
				description: e instanceof Error ? e.message : String(e),
				variant: "destructive",
			}),
	});

	const levelMut = useMutation({
		mutationFn: () => apiClient.autoLevelMatch(linePayload()),
		onSuccess: () => toast({ title: "Level matching complete" }),
		onError: (e: unknown) =>
			toast({
				title: "Level match failed",
				description: e instanceof Error ? e.message : String(e),
				variant: "destructive",
			}),
	});

	const addSpeaker = useCallback(() => {
		const id = `spk-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
		setSpeakers((p) => [...p, { id, name: `Speaker ${p.length + 1}` }]);
	}, []);

	const removeSpeaker = useCallback((id: string) => {
		setSpeakers((p) => p.filter((s) => s.id !== id));
		setLines((p) => p.filter((l) => l.speakerId !== id));
	}, []);

	const addLine = useCallback(() => {
		const id = `line-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
		const fallbackSpeaker = speakers[0]?.id ?? "spk-1";
		setLines((p) => [
			...p,
			{
				id,
				speakerId: fallbackSpeaker,
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
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader
				title="Conversation Mode"
			/>

			<div className="max-w-md space-y-1">
				<Label htmlFor="conv-preset">Conversation preset</Label>
				<Select value={preset} onValueChange={setPreset}>
					<SelectTrigger id="conv-preset" className="h-8 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{presetIds.map((p) => (
							<SelectItem key={p} value={p}>
								{presetName(p)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<Separator />

			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<Label>Speakers</Label>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-6 text-xs"
						title="Add speaker"
						aria-label="Add speaker"
						onClick={addSpeaker}
					>
						<PlusIcon className="mr-1 size-3" aria-hidden="true" />
						Add
					</Button>
				</div>
				<div className="flex flex-wrap gap-2">
					{speakers.map((s) => (
						<span
							key={s.id}
							className="flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs"
						>
							<Input
								value={s.name}
								onChange={(e) =>
									setSpeakers((p) =>
										p.map((x) =>
											x.id === s.id ? { ...x, name: e.target.value } : x,
										),
									)
								}
								className="h-6 w-28 border-transparent bg-transparent px-1 text-xs"
								aria-label="Speaker name"
							/>
							{speakers.length > 1 && (
								<button
									type="button"
									className="rounded-sm text-destructive transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									title={`Remove ${s.name}`}
									aria-label={`Remove ${s.name}`}
									onClick={() => removeSpeaker(s.id)}
								>
									<XMarkIcon className="size-3" aria-hidden="true" />
								</button>
							)}
						</span>
					))}
				</div>
			</div>

			<Separator />

			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<Label>
						Dialogue lines{" "}
						<span className="text-muted-foreground">({lines.length})</span>
					</Label>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-6 text-xs"
						title="Add line"
						aria-label="Add dialogue line"
						onClick={addLine}
					>
						<PlusIcon className="mr-1 size-3" aria-hidden="true" />
						Line
					</Button>
				</div>
				{lines.length === 0 ? (
					<EmptyState
						title="No lines yet"
						body="Add a dialogue line to arrange the conversation."
					/>
				) : null}
				{lines.map((line, idx) => (
					<div
						key={line.id}
						className="space-y-2 rounded-md border border-border bg-card p-3"
					>
						<div className="flex items-center justify-between gap-2">
							<Badge tone="neutral">L{idx + 1}</Badge>
							<button
								type="button"
								className="rounded-sm text-destructive transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								title="Remove line"
								aria-label={`Remove line ${idx + 1}`}
								onClick={() => removeLine(line.id)}
							>
								<XMarkIcon className="size-3" aria-hidden="true" />
							</button>
						</div>
						<Textarea
							placeholder="What does the speaker say?"
							value={line.text}
							onChange={(e) => updateLine(line.id, { text: e.target.value })}
							className="min-h-16 text-sm"
							aria-label={`Line ${idx + 1} text`}
						/>
						<div className="grid grid-cols-2 gap-2">
							<Select
								value={line.speakerId}
								onValueChange={(v) => updateLine(line.id, { speakerId: v })}
							>
								<SelectTrigger
									className="h-7 text-xs"
									aria-label={`Line ${idx + 1} speaker`}
								>
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
								<SelectTrigger
									className="h-7 text-xs"
									aria-label={`Line ${idx + 1} timing`}
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="relative_to_previous">
										Relative to previous
									</SelectItem>
									<SelectItem value="absolute">Absolute</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="flex gap-3">
							<div className="flex-1 space-y-1">
								<Label>Offset ({line.offsetMs}ms)</Label>
								<Slider
									min={-2000}
									max={2000}
									step={10}
									value={[line.offsetMs]}
									onValueChange={([v]) =>
										updateLine(line.id, { offsetMs: v ?? 0 })
									}
									aria-label={`Line ${idx + 1} offset milliseconds`}
								/>
							</div>
							<div className="flex-1 space-y-1">
								<Label>Overlap ({line.overlapMs}ms)</Label>
								<Slider
									min={0}
									max={1000}
									step={10}
									value={[line.overlapMs]}
									onValueChange={([v]) =>
										updateLine(line.id, { overlapMs: v ?? 0 })
									}
									aria-label={`Line ${idx + 1} overlap milliseconds`}
								/>
							</div>
						</div>
					</div>
				))}
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<Button
					type="button"
					size="sm"
					variant="outline"
					className="h-8 text-xs"
					disabled={duckMut.isPending || lines.length === 0}
					title="Auto-duck speakers during overlap"
					aria-label="Auto-duck speakers"
					onClick={() => duckMut.mutate()}
				>
					{duckMut.isPending ? <Spinner size="xs" className="mr-1" /> : null}
					Auto-Duck
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					className="h-8 text-xs"
					disabled={levelMut.isPending || lines.length === 0}
					title="Auto-level match speakers"
					aria-label="Auto-level speakers"
					onClick={() => levelMut.mutate()}
				>
					{levelMut.isPending ? <Spinner size="xs" className="mr-1" /> : null}
					Auto-Level
				</Button>
			</div>
		</div>
	);
}
