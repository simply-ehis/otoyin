import {
	Square2StackIcon as Layers,
	MicrophoneIcon as Mic,
	PlayIcon as Play,
	StopIcon as Square,
	TrashIcon as Trash2,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Separator } from "@/components/ui/separator";
import { apiClient } from "@/lib/api/client";
import { getClip } from "@/lib/clip";
import { showStudioErrorToast } from "@/lib/errors";
import { useAudioRecording } from "@/lib/hooks/useAudioRecording";
import { cn } from "@/lib/utils/cn";

const PLAY_TONES = [330, 392, 440, 494, 554, 659];

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => {
			const result = reader.result as string;
			resolve(result.includes(",") ? result.split(",")[1] : result);
		};
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

interface TakeRegion {
	id: string;
	startMs: number;
	endMs: number;
	label: string;
}

interface TakeLane {
	id: string;
	name: string;
	color: string;
	regions: TakeRegion[];
	selectedRegionId: string | null;
	audioBase64?: string | null;
}

const LANE_COLORS = [
	"bg-accent/40",
	"bg-green-500/30",
	"bg-blue-500/30",
	"bg-purple-500/30",
];
const TOTAL_DURATION_MS = 10000;

const DEFAULT_LANES: TakeLane[] = [
	{
		id: "1",
		name: "Take 1",
		color: LANE_COLORS[0],
		regions: [
			{ id: "r1", startMs: 0, endMs: 4500, label: "Take 1A" },
			{ id: "r2", startMs: 5000, endMs: 9000, label: "Take 1B" },
		],
		selectedRegionId: "r1",
	},
	{
		id: "2",
		name: "Take 2",
		color: LANE_COLORS[1],
		regions: [
			{ id: "r3", startMs: 500, endMs: 5000, label: "Take 2A" },
			{ id: "r4", startMs: 5500, endMs: 9500, label: "Take 2B" },
		],
		selectedRegionId: null,
	},
	{
		id: "3",
		name: "Take 3",
		color: LANE_COLORS[2],
		regions: [{ id: "r5", startMs: 200, endMs: 4800, label: "Take 3A" }],
		selectedRegionId: null,
	},
];

let nextLaneId = 4;
let nextRegionId = 100;

function formatMs(ms: number): string {
	const s = Math.floor(ms / 1000);
	const m = Math.floor(s / 60);
	return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function MultiTakeCompingView() {
	const [lanes, setLanes] = useState<TakeLane[]>(DEFAULT_LANES);
	const [compLoading, setCompLoading] = useState(false);
	const [recordingLaneId, setRecordingLaneId] = useState<string | null>(null);
	const recordingLaneRef = useRef<string | null>(null);
	const compUrlRef = useRef<string | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
	const [isAutosave, setIsAutosave] = useState(false);
	const [unsaved, setUnsaved] = useState(false);

	useEffect(() => {
		function handleBeforeUnload(e: BeforeUnloadEvent) {
			if (unsaved) {
				e.preventDefault();
				e.returnValue = "";
			}
		}
		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [unsaved]);

	useEffect(() => {
		if (currentSessionId === null) {
			return;
		}
		setUnsaved(true);
		const handle = setTimeout(async () => {
			try {
				const data = { lanes };
				if (isAutosave) {
					await apiClient.updateCompingSession(currentSessionId, data);
				} else {
					const created = await apiClient.createCompingSession(
						"Comp Autosave",
						data,
						true,
					);
					setCurrentSessionId(created.id);
					setIsAutosave(true);
				}
			} catch {
				/* autosave is best-effort */
			}
		}, 1500);
		return () => clearTimeout(handle);
	}, [lanes, currentSessionId, isAutosave]);

	const handleSaveSession = useCallback(async () => {
		const data = { lanes };
		const name = `${new Date().toLocaleString()} Comp`;
		try {
			if (currentSessionId !== null) {
				if (isAutosave) {
					await apiClient.promoteCompingSession(currentSessionId, name, data);
				} else {
					await apiClient.updateCompingSession(currentSessionId, data);
				}
			} else {
				const created = await apiClient.createCompingSession(name, data);
				setCurrentSessionId(created.id);
			}
			setIsAutosave(false);
			setUnsaved(false);
		} catch {
			/* save failure should keep the unsaved badge */
		}
	}, [lanes, currentSessionId, isAutosave]);

	const { isRecording, duration, startRecording, stopRecording } =
		useAudioRecording({
			onRecordingComplete: async (blob, recordedDuration?: number) => {
				const laneId = recordingLaneRef.current;
				recordingLaneRef.current = null;
				setRecordingLaneId(null);
				if (!laneId) {
					return;
				}
				const b64 = await blobToBase64(blob);
				const durMs = Math.round((recordedDuration ?? 0) * 1000);
				setLanes((prev) =>
					prev.map((l) => {
						if (l.id !== laneId) {
							return l;
						}
						if (durMs <= 0) {
							return { ...l, audioBase64: b64 };
						}
						const regionId = `r${nextRegionId++}`;
						return {
							...l,
							audioBase64: b64,
							regions: [
								...l.regions,
								{
									id: regionId,
									startMs: 0,
									endMs: Math.min(durMs, TOTAL_DURATION_MS),
									label: "Take",
								},
							],
							selectedRegionId: regionId,
						};
					}),
				);
			},
		});

	const startLaneRecord = useCallback(
		(id: string) => {
			recordingLaneRef.current = id;
			setRecordingLaneId(id);
			startRecording();
		},
		[startRecording],
	);

	const playComp = useCallback(async () => {
		const segments: Array<{
			start_ms: number;
			end_ms: number;
			audio_base64?: string;
			tone_hz?: number;
		}> = [];
		lanes.forEach((lane, i) => {
			const region = lane.regions.find((r) => r.id === lane.selectedRegionId);
			if (!region) {
				return;
			}
			if (lane.audioBase64) {
				segments.push({
					start_ms: region.startMs,
					end_ms: region.endMs,
					audio_base64: lane.audioBase64,
				});
			} else {
				segments.push({
					start_ms: region.startMs,
					end_ms: region.endMs,
					tone_hz: PLAY_TONES[i % PLAY_TONES.length],
				});
			}
		});
		if (segments.length === 0) {
			return;
		}
		setCompLoading(true);
		try {
			const blob = await apiClient.assembleComp(segments, { crossfade_ms: 15 });
			const url = URL.createObjectURL(blob);
			if (compUrlRef.current) {
				URL.revokeObjectURL(compUrlRef.current);
			}
			compUrlRef.current = url;
			const el = audioRef.current;
			if (el) {
				el.src = url;
				await el.play().catch((err) => {
					showStudioErrorToast(err);
				});
			}
		} catch (err) {
			showStudioErrorToast(err);
		} finally {
			setCompLoading(false);
		}
	}, [lanes]);

	const addLane = useCallback(() => {
		const id = String(nextLaneId++);
		setLanes((prev) => [
			...prev,
			{
				id,
				name: `Take ${prev.length + 1}`,
				color: LANE_COLORS[prev.length % LANE_COLORS.length],
				regions: [],
				selectedRegionId: null,
			},
		]);
	}, []);

	const pasteClip = useCallback(async () => {
		let clip: import("@/lib/clip").Clip | null = null;
		try {
			clip = await getClip();
		} catch {
			return;
		}
		if (!clip) {
			return;
		}
		try {
			const res = await fetch(clip.audioUrl);
			const blob = await res.blob();
			const b64 = await blobToBase64(blob);
			const id = String(nextLaneId++);
			const regionId = `r${nextRegionId++}`;
			setLanes((prev) => [
				...prev,
				{
					id,
					name: clip.name.slice(0, 24) || `Take ${prev.length + 1}`,
					color: LANE_COLORS[prev.length % LANE_COLORS.length],
					audioBase64: b64,
					regions: [
						{
							id: regionId,
							startMs: 0,
							endMs: Math.min(clip.durationMs, TOTAL_DURATION_MS),
							label: clip.name.slice(0, 24) || "Pasted",
						},
					],
					selectedRegionId: regionId,
				},
			]);
		} catch {
			/* paste failure is non-fatal */
		}
	}, []);

	const removeLane = useCallback((id: string) => {
		setLanes((prev) => prev.filter((l) => l.id !== id));
	}, []);

	const selectRegion = useCallback((laneId: string, regionId: string) => {
		setLanes((prev) =>
			prev.map((l) =>
				l.id === laneId ? { ...l, selectedRegionId: regionId } : l,
			),
		);
	}, []);

	const addRegion = useCallback((laneId: string) => {
		const id = `r${nextRegionId++}`;
		setLanes((prev) =>
			prev.map((l) => {
				if (l.id !== laneId) {
					return l;
				}
				const end =
					l.regions.length > 0 ? Math.max(...l.regions.map((r) => r.endMs)) : 0;
				return {
					...l,
					regions: [
						...l.regions,
						{
							id,
							startMs: end,
							endMs: Math.min(end + 3000, TOTAL_DURATION_MS),
							label: `Region ${l.regions.length + 1}`,
						},
					],
					selectedRegionId: id,
				};
			}),
		);
	}, []);

	return (
		<div className="flex flex-col h-full p-4 gap-4">
			<ScreenHeader
				icon={<Layers className="size-5" />}
				title="Multi-Take Comping"
				description="Stack take lanes & select best regions"
				actions={
					<Button
						size="sm"
						variant="outline"
						onClick={handleSaveSession}
						title="Save comp session"
						aria-label="Save comp session"
					>
						Save
						{unsaved && (
							<span
								role="img"
								className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400"
								title="Unsaved changes — Save to name this session"
								aria-label="Unsaved changes"
							/>
						)}
					</Button>
				}
			/>

			<Separator />

			{/* Timeline ruler */}
			<div className="rounded-lg border border-border bg-card p-2">
				<div className="flex items-center justify-between text-xs text-muted-foreground/60 mb-1">
					<span>0:00</span>
					<span>{formatMs(TOTAL_DURATION_MS / 4)}</span>
					<span>{formatMs(TOTAL_DURATION_MS / 2)}</span>
					<span>{formatMs((TOTAL_DURATION_MS * 3) / 4)}</span>
					<span>{formatMs(TOTAL_DURATION_MS)}</span>
				</div>
				<div className="h-px bg-border" />
			</div>

			{/* Take lanes */}
			<div className="flex-1 overflow-y-auto space-y-2">
				{lanes.map((lane) => (
					<div
						key={lane.id}
						className="rounded-lg border border-border bg-card p-3 space-y-1.5"
					>
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<div className={cn("size-3 rounded-sm", lane.color)} />
								<span className="text-xs font-medium text-foreground">
									{lane.name}
								</span>
								<Badge variant="secondary" className="text-xs">
									{lane.regions.length} regions
								</Badge>
								{lane.audioBase64 && (
									<Badge variant="secondary" className="text-xs text-accent">
										? Take
									</Badge>
								)}
							</div>
							<div className="flex items-center gap-1">
								<Button
									variant="ghost"
									size="sm"
									className="h-5 text-xs"
									onClick={() => addRegion(lane.id)}
									title="Add region"
									aria-label="Add region"
								>
									+
								</Button>
								<Button
									variant="ghost"
									size="sm"
									className="h-5 text-xs"
									onClick={() =>
										recordingLaneId === lane.id
											? stopRecording()
											: startLaneRecord(lane.id)
									}
									disabled={isRecording && recordingLaneId !== lane.id}
									title={
										recordingLaneId === lane.id
											? "Stop recording"
											: "Record take"
									}
									aria-label={
										recordingLaneId === lane.id
											? "Stop recording"
											: "Record take"
									}
								>
									{recordingLaneId === lane.id ? (
										<Square className="size-3" />
									) : (
										<Mic className="size-3" />
									)}
								</Button>
								{recordingLaneId === lane.id && (
									<span className="text-xs text-destructive tabular-nums">
										{formatMs(duration * 1000)}
									</span>
								)}
								<button
									type="button"
									className="text-destructive/60 hover:text-destructive p-0.5"
									onClick={() => removeLane(lane.id)}
									title={`Remove ${lane.name}`}
									aria-label={`Remove ${lane.name}`}
								>
									<Trash2 className="size-3" />
								</button>
							</div>
						</div>
						{/* Regions bar */}
						<div className="relative h-12 rounded bg-muted/20 overflow-hidden">
							{lane.regions.map((region) => {
								const left = (region.startMs / TOTAL_DURATION_MS) * 100;
								const width =
									((region.endMs - region.startMs) / TOTAL_DURATION_MS) * 100;
								const isSelected = lane.selectedRegionId === region.id;
								return (
									<button
										type="button"
										key={region.id}
										className={cn(
											"absolute top-1 bottom-1 rounded text-xs flex items-center justify-center transition-colors overflow-hidden",
											isSelected
												? "bg-accent/50 ring-1 ring-accent text-foreground"
												: "bg-muted/50 text-muted-foreground hover:bg-muted/70",
										)}
										style={{ left: `${left}%`, width: `${width}%` }}
										onClick={() => selectRegion(lane.id, region.id)}
										title={`${region.label} (${formatMs(region.startMs)} ? ${formatMs(region.endMs)})`}
										aria-label={`Select ${region.label}`}
									>
										<span className="truncate px-1">{region.label}</span>
									</button>
								);
							})}
						</div>
					</div>
				))}

				<div className="flex gap-2">
					<Button
						variant="outline"
						size="sm"
						className="h-7 text-xs flex-1"
						onClick={addLane}
						title="Add take lane"
						aria-label="Add take lane"
					>
						+ Add Take Lane
					</Button>
					<Button
						variant="outline"
						size="sm"
						className="h-7 text-xs flex-1"
						onClick={pasteClip}
						title="Paste clip as take lane"
						aria-label="Paste clip as take lane"
					>
						Paste Clip
					</Button>
				</div>
			</div>

			{/* Comp preview */}
			<div className="rounded-lg border border-border bg-card p-3">
				<div className="flex items-center justify-between mb-2">
					<Label className="text-xs">Comp Result</Label>
					<span className="text-xs text-muted-foreground/50">
						{lanes.filter((l) => l.selectedRegionId).length} of {lanes.length}{" "}
						lanes comped
					</span>
				</div>
				<div className="relative h-8 rounded bg-muted/20 overflow-hidden">
					{lanes.map((lane) => {
						const region = lane.regions.find(
							(r) => r.id === lane.selectedRegionId,
						);
						if (!region) {
							return null;
						}
						const left = (region.startMs / TOTAL_DURATION_MS) * 100;
						const width =
							((region.endMs - region.startMs) / TOTAL_DURATION_MS) * 100;
						return (
							<div
								key={lane.id}
								className={cn(
									"absolute top-0.5 bottom-0.5 rounded-sm opacity-60",
									lane.color,
								)}
								style={{ left: `${left}%`, width: `${width}%` }}
								title={`${lane.name} — ${region.label}`}
							/>
						);
					})}
				</div>
				<Button
					size="sm"
					variant="ghost"
					className="h-7 text-xs mt-2"
					onClick={playComp}
					disabled={
						compLoading || lanes.filter((l) => l.selectedRegionId).length === 0
					}
					title="Play comp"
					aria-label="Play comp"
				>
					<Play className="size-3 mr-1" />
					{compLoading ? "Assembling…" : "Play Comp"}
				</Button>
				<audio ref={audioRef} className="hidden">
					<track kind="captions" />
				</audio>
			</div>
		</div>
	);
}
