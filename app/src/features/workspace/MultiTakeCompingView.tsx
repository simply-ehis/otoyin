import {
	MicrophoneIcon,
	PlayIcon,
	StopIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { SessionResponse } from "@/lib/api/types";
import { getClip } from "@/lib/clip";
import { showStudioErrorToast } from "@/lib/errors";
import { useAudioRecording } from "@/lib/hooks/useAudioRecording";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Badge, Label, Separator, Spinner } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { EmptyState, ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";
import { hueLine, hueText } from "./hueIdentity";
import { playPreviewBlob } from "./playBlob";

const PLAY_TONES = [330, 392, 440, 494, 554, 659];
const TOTAL_DURATION_MS = 10000;

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => {
			const result = reader.result as string;
			resolve(result.includes(",") ? (result.split(",")[1] ?? "") : result);
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
	regions: TakeRegion[];
	selectedRegionId: string | null;
	audioBase64?: string | null;
}

function isTakeLane(v: unknown): v is TakeLane {
	if (typeof v !== "object" || v === null) {
		return false;
	}
	const l = v as Record<string, unknown>;
	return (
		typeof l.id === "string" &&
		typeof l.name === "string" &&
		Array.isArray(l.regions)
	);
}

function formatMs(ms: number): string {
	const s = Math.floor(ms / 1000);
	const m = Math.floor(s / 60);
	return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function newLaneId() {
	return `lane-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function newRegionId() {
	return `r-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export function MultiTakeCompingView() {
	const { toast } = useToast();
	const queryClient = useQueryClient();
	const [lanes, setLanes] = useState<TakeLane[]>([]);
	const [compLoading, setCompLoading] = useState(false);
	const [recordingLaneId, setRecordingLaneId] = useState<string | null>(null);
	const recordingLaneRef = useRef<string | null>(null);
	const [sessionId, setSessionId] = useState<string | null>(null);
	const [isAutosave, setIsAutosave] = useState(false);
	const [unsaved, setUnsaved] = useState(false);
	const [selectedSession, setSelectedSession] = useState("");

	const sessionsQuery = useQuery({
		queryKey: ["comping-sessions"],
		queryFn: () => apiClient.listCompingSessions(),
	});

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
		if (sessionId === null || lanes.length === 0) {
			return;
		}
		setUnsaved(true);
		const handle = setTimeout(async () => {
			try {
				const data = { lanes };
				if (isAutosave) {
					await apiClient.updateCompingSession(sessionId, data);
				} else {
					const created = await apiClient.createCompingSession(
						"Comp Autosave",
						data,
						true,
					);
					setSessionId(created.id);
					setIsAutosave(true);
				}
			} catch {
				/* autosave is best-effort */
			}
		}, 1500);
		return () => clearTimeout(handle);
	}, [lanes, sessionId, isAutosave]);

	const { isRecording, duration, startRecording, stopRecording } =
		useAudioRecording({
			onRecordingComplete: async (blob, recordedDuration?: number) => {
				const laneId = recordingLaneRef.current;
				recordingLaneRef.current = null;
				setRecordingLaneId(null);
				if (!laneId) {
					return;
				}
				try {
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
							const regionId = newRegionId();
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
				} catch (err) {
					showStudioErrorToast(err);
				}
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

	const assembleMut = useMutation({
		mutationFn: () => {
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
						tone_hz: PLAY_TONES[i % PLAY_TONES.length] ?? 440,
					});
				}
			});
			if (segments.length === 0) {
				throw new Error("Select at least one region first");
			}
			setCompLoading(true);
			return apiClient.assembleComp(segments, { crossfade_ms: 15 });
		},
		onSuccess: (blob) => {
			setCompLoading(false);
			playPreviewBlob(blob);
		},
		onError: (err: unknown) => {
			setCompLoading(false);
			showStudioErrorToast(err);
		},
	});

	const addLane = useCallback(() => {
		setLanes((prev) => [
			...prev,
			{
				id: newLaneId(),
				name: `Take ${prev.length + 1}`,
				regions: [],
				selectedRegionId: null,
			},
		]);
	}, []);

	const pasteClip = useCallback(async () => {
		let clip: Awaited<ReturnType<typeof getClip>> = null;
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
			const regionId = newRegionId();
			setLanes((prev) => [
				...prev,
				{
					id: newLaneId(),
					name: clip.name.slice(0, 24) || `Take ${prev.length + 1}`,
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
		setLanes((prev) =>
			prev.map((l) => {
				if (l.id !== laneId) {
					return l;
				}
				const end =
					l.regions.length > 0 ? Math.max(...l.regions.map((r) => r.endMs)) : 0;
				const id = newRegionId();
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

	function restoreSession(session: SessionResponse) {
		const data = session.data as { lanes?: unknown };
		const restored = Array.isArray(data.lanes)
			? data.lanes.filter(isTakeLane)
			: [];
		setLanes(restored);
		setSessionId(session.id);
		setIsAutosave(session.is_autosave);
		setUnsaved(false);
	}

	async function loadSelectedSession() {
		if (!selectedSession) {
			return;
		}
		try {
			restoreSession(await apiClient.getCompingSession(selectedSession));
			toast({ title: "Session loaded" });
		} catch (err) {
			showStudioErrorToast(err);
		}
	}

	async function deleteSelectedSession() {
		if (!selectedSession) {
			return;
		}
		try {
			await apiClient.deleteCompingSession(selectedSession);
			if (sessionId === selectedSession) {
				setSessionId(null);
				setIsAutosave(false);
			}
			setSelectedSession("");
			await queryClient.invalidateQueries({ queryKey: ["comping-sessions"] });
		} catch (err) {
			showStudioErrorToast(err);
		}
	}

	async function handleSaveSession() {
		if (lanes.length === 0) {
			return;
		}
		const data = { lanes };
		const name = `${new Date().toLocaleString()} Comp`;
		try {
			if (sessionId !== null) {
				if (isAutosave) {
					await apiClient.promoteCompingSession(sessionId, name, data);
				} else {
					await apiClient.updateCompingSession(sessionId, data);
				}
			} else {
				const created = await apiClient.createCompingSession(name, data);
				setSessionId(created.id);
			}
			setIsAutosave(false);
			setUnsaved(false);
			await queryClient.invalidateQueries({ queryKey: ["comping-sessions"] });
		} catch (err) {
			showStudioErrorToast(err);
		}
	}

	const sessions = sessionsQuery.data ?? [];
	const compedCount = lanes.filter((l) => l.selectedRegionId).length;

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader
				title="Multi-Take Comping"
				description="Stack take lanes and assemble the best regions"
				actions={
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={lanes.length === 0}
						title="Save comp session"
						aria-label={
							unsaved
								? "Save comp session, unsaved changes"
								: "Save comp session"
						}
						onClick={() => void handleSaveSession()}
					>
						Save
						{unsaved && (
							<span
								aria-hidden="true"
								title="Unsaved changes"
								className="ml-1 inline-block size-1.5 rounded-full bg-warning"
							/>
						)}
					</Button>
				}
			/>

			{(sessionsQuery.data ?? []).length > 0 && (
				<div className="flex flex-wrap items-center gap-2">
					<Select value={selectedSession} onValueChange={setSelectedSession}>
						<SelectTrigger
							className="h-8 min-w-44 flex-1 text-xs sm:flex-none"
							aria-label="Saved comp sessions"
						>
							<SelectValue placeholder="Load a saved session" />
						</SelectTrigger>
						<SelectContent>
							{sessions.map((s) => (
								<SelectItem key={s.id} value={s.id}>
									{s.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="h-8 text-xs"
						disabled={!selectedSession}
						onClick={() => void loadSelectedSession()}
					>
						Load
					</Button>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						className="h-8 text-xs"
						disabled={!selectedSession}
						title="Delete the selected saved session"
						aria-label="Delete the selected saved session"
						onClick={() => void deleteSelectedSession()}
					>
						Delete
					</Button>
				</div>
			)}

			<div className="rounded-md border border-border bg-card p-2">
				<div className="mb-1 flex items-center justify-between text-xs tabular-nums text-muted-foreground">
					<span>0:00</span>
					<span>{formatMs(TOTAL_DURATION_MS / 4)}</span>
					<span>{formatMs(TOTAL_DURATION_MS / 2)}</span>
					<span>{formatMs((TOTAL_DURATION_MS * 3) / 4)}</span>
					<span>{formatMs(TOTAL_DURATION_MS)}</span>
				</div>
				<div className="h-px bg-border" aria-hidden="true" />
			</div>

			{lanes.length === 0 ? (
				<EmptyState
					title="No take lanes yet"
					body="Record a take, paste a clip, or load a saved session."
					action={
						<div className="flex gap-2">
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={addLane}
							>
								Add Take Lane
							</Button>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => void pasteClip()}
							>
								Paste Clip
							</Button>
						</div>
					}
				/>
			) : (
				<div className="space-y-2">
					{lanes.map((lane, laneIndex) => (
						<div
							key={lane.id}
							className={cn(
								"space-y-1.5 rounded-md border border-border bg-card p-3",
								"border-l-[3px]",
								hueLine(laneIndex),
							)}
						>
							<div className="flex items-center justify-between gap-2">
								<div className="flex min-w-0 items-center gap-2">
									{" "}
									<span
										className={cn(
											"truncate text-xs font-medium",
											hueText(laneIndex),
										)}
									>
										{lane.name}
									</span>
									<Badge tone="neutral">{lane.regions.length} regions</Badge>
									{lane.audioBase64 ? (
										<Badge tone="accent">Has audio</Badge>
									) : null}
								</div>
								<div className="flex shrink-0 items-center gap-1">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="h-6 px-2 text-xs"
										title="Add region"
										aria-label={`Add region to ${lane.name}`}
										onClick={() => addRegion(lane.id)}
									>
										+ Region
									</Button>
									<Button
										type="button"
										variant={
											recordingLaneId === lane.id ? "destructive" : "ghost"
										}
										size="sm"
										className="h-6 px-2 text-xs"
										disabled={isRecording && recordingLaneId !== lane.id}
										title={
											recordingLaneId === lane.id
												? "Stop recording"
												: `Record take on ${lane.name}`
										}
										aria-label={
											recordingLaneId === lane.id
												? "Stop recording"
												: `Record take on ${lane.name}`
										}
										onClick={() =>
											recordingLaneId === lane.id
												? stopRecording()
												: startLaneRecord(lane.id)
										}
									>
										{recordingLaneId === lane.id ? (
											<StopIcon className="size-3" aria-hidden="true" />
										) : (
											<MicrophoneIcon className="size-3" aria-hidden="true" />
										)}
									</Button>
									{recordingLaneId === lane.id && (
										<span className="text-xs tabular-nums text-destructive">
											{formatMs(duration * 1000)}
										</span>
									)}
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="h-6 px-2 text-xs text-destructive hover:text-destructive"
										title={`Remove ${lane.name}`}
										aria-label={`Remove ${lane.name}`}
										onClick={() => removeLane(lane.id)}
									>
										<TrashIcon className="size-3" aria-hidden="true" />
									</Button>
								</div>
							</div>
							<div className="relative h-12 overflow-hidden rounded-md bg-secondary">
								{lane.regions.map((region) => {
									const left = (region.startMs / TOTAL_DURATION_MS) * 100;
									const width =
										((region.endMs - region.startMs) / TOTAL_DURATION_MS) * 100;
									const selected = lane.selectedRegionId === region.id;
									return (
										<button
											key={region.id}
											type="button"
											aria-pressed={selected}
											className={cn(
												"absolute bottom-1 top-1 flex items-center justify-center overflow-hidden rounded-sm text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
												selected
													? "border border-accent bg-accent-muted text-foreground"
													: "border border-border bg-card text-muted-foreground hover:border-strong",
											)}
											style={{ left: `${left}%`, width: `${width}%` }}
											title={`${region.label} (${formatMs(region.startMs)} → ${formatMs(region.endMs)})`}
											aria-label={`Select ${region.label}`}
											onClick={() => selectRegion(lane.id, region.id)}
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
							type="button"
							variant="outline"
							size="sm"
							className="h-7 flex-1 text-xs"
							title="Add take lane"
							aria-label="Add take lane"
							onClick={addLane}
						>
							+ Add Take Lane
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-7 flex-1 text-xs"
							title="Paste clip as take lane"
							aria-label="Paste clip as take lane"
							onClick={() => void pasteClip()}
						>
							Paste Clip
						</Button>
					</div>
				</div>
			)}

			<Separator />

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
					disabled={assembleMut.isPending || compedCount === 0}
					title="Assemble and play the comp"
					aria-label="Assemble and play comp"
					onClick={() => assembleMut.mutate()}
				>
					{assembleMut.isPending || compLoading ? (
						<Spinner size="xs" className="mr-1" />
					) : (
						<PlayIcon className="mr-1 size-3" aria-hidden="true" />
					)}
					{assembleMut.isPending || compLoading ? "Assembling…" : "Play Comp"}
				</Button>
			</section>
		</div>
	);
}
