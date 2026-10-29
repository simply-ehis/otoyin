import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioStudioStore } from "@/features/audioStudio/AudioStudioStore";
import { apiClient } from "@/lib/api/client";
import type { SessionResponse } from "@/lib/api/types";
import { getClip } from "@/lib/clip";
import { showStudioErrorToast } from "@/lib/errors";
import { useAudioRecording } from "@/lib/hooks/useAudioRecording";
import { Button } from "@/ui/button";
import { Separator } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { EmptyState, ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";
import { CompResult } from "./comping/CompResult";
import type { TakeLane } from "./comping/compingTypes";
import { isTakeLane } from "./comping/compingTypes";
import {
	blobToBase64,
	formatMs,
	newLaneId,
	newRegionId,
	PLAY_TONES,
	TOTAL_DURATION_MS,
} from "./comping/compingUtils";
import { TakeLaneComponent } from "./comping/TakeLane";
import { playPreviewBlob } from "./playBlob";

export function MultiTakeCompingView() {
	const { toast } = useToast();
	const addTrack = useAudioStudioStore((s) => s.addTrack);
	const setTrackAudio = useAudioStudioStore((s) => s.setTrackAudio);
	const queryClient = useQueryClient();
	const [lanes, setLanes] = useState<TakeLane[]>([]);
	const [compLoading, setCompLoading] = useState(false);
	const [compedBlob, setCompedBlob] = useState<Blob | null>(null);
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
			setCompedBlob(blob);
			playPreviewBlob(blob);
		},
		onError: (err: unknown) => {
			setCompLoading(false);
			showStudioErrorToast(err);
		},
	});

	const saveCompMut = useMutation({
		mutationFn: async () => {
			if (!compedBlob) {
				throw new Error("No comped audio");
			}
			return apiClient.saveGeneratedAudio(
				compedBlob,
				`Comp ${new Date().toLocaleTimeString()}`,
				"capture",
				"file",
			);
		},
		onSuccess: () => toast({ title: "Saved to Library" }),
		onError: (e: unknown) => showStudioErrorToast(e),
	});

	async function sendCompToStudio() {
		if (!compedBlob) {
			return;
		}
		const url = URL.createObjectURL(compedBlob);
		const trackId = addTrack("Comped take");
		setTrackAudio(trackId, url, compedBlob, 0);
		toast({ title: "Sent to Audio Studio" });
	}

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
			if (!res.ok) {
				throw new Error(`Failed to fetch clip audio: ${res.status}`);
			}
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
						<TakeLaneComponent
							key={lane.id}
							lane={lane}
							laneIndex={laneIndex}
							isRecording={isRecording}
							recordingLaneId={recordingLaneId}
							duration={duration}
							onAddRegion={addRegion}
							onRecord={startLaneRecord}
							onStopRecording={stopRecording}
							onRemove={removeLane}
							onSelectRegion={selectRegion}
						/>
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

			<CompResult
				lanes={lanes}
				compedCount={compedCount}
				isPending={assembleMut.isPending}
				compLoading={compLoading}
				onAssemble={() => assembleMut.mutate()}
				compedBlob={compedBlob}
				onSave={() => saveCompMut.mutate()}
				savePending={saveCompMut.isPending}
				onSendToStudio={sendCompToStudio}
			/>
		</div>
	);
}
