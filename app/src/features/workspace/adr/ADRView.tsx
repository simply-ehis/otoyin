import { ArrowUpTrayIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { ERR_TITLE_ADR } from "@/lib/errorMessages";
import { showStudioErrorToast } from "@/lib/errors";
import { useAudioRecording } from "@/lib/hooks/useAudioRecording";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogTitle,
} from "@/ui/alert-dialog";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Badge, Separator, Spinner } from "@/ui/primitives";
import { EmptyState, LoadingState, ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";
import { AlignmentPanel } from "./AlignmentPanel";
import { RecordingControls } from "./RecordingControls";
import { TakeManager } from "./TakeManager";
import type { ADRSession, ADRSessionSummary } from "./types";

export function ADRView() {
	const { toast } = useToast();
	const queryClient = useQueryClient();
	const audioRef = useRef<HTMLAudioElement | null>(null);

	const [sessionId, setSessionId] = useState<string | null>(null);
	const sid = sessionId ?? "";
	const [activeLineId, setActiveLineId] = useState<string | null>(null);
	const [shiftMs, setShiftMs] = useState(0);
	const [newSessionName, setNewSessionName] = useState("");
	const [recordingLineId, setRecordingLineId] = useState<string | null>(null);
	const [confirmDeleteSession, setConfirmDeleteSession] = useState(false);
	const [detectedSpeakers, setDetectedSpeakers] = useState<string[] | null>(null);

	const adrSearch = useSearch({ from: "/workspace/adr" });
	useEffect(() => {
		if (adrSearch.session && adrSearch.session !== sessionId) {
			setSessionId(adrSearch.session);
		}
	}, [adrSearch.session, sessionId]);

	const onRecordingComplete = useCallback(
		async (blob: Blob, duration?: number) => {
			if (!sessionId || !recordingLineId) {
				return;
			}
			try {
				const file = new File([blob], `take_${Date.now()}.wav`, {
					type: "audio/wav",
				}) as File & { recordedDuration?: number };
				file.recordedDuration = duration;
				await apiClient.uploadADRTake(sessionId, recordingLineId, file);
				void queryClient.invalidateQueries({
					queryKey: ["adr-session", sessionId],
				});
				toast({ title: "Take uploaded" });
			} catch (e: unknown) {
				showStudioErrorToast(e);
			}
			setRecordingLineId(null);
		},
		[sessionId, recordingLineId, queryClient, toast],
	);

	const recording = useAudioRecording({ onRecordingComplete });

	const sessionsQuery = useQuery({
		queryKey: ["adr-sessions"],
		queryFn: () => apiClient.listADRSessions(),
	});

	const sessionQuery = useQuery({
		queryKey: ["adr-session", sessionId],
		queryFn: () => apiClient.getADRSession(sid),
		enabled: !!sessionId,
	});

	const session = sessionQuery.data as ADRSession | undefined;
	const lines = session?.lines ?? [];
	const activeLine =
		lines.find((l) => l.id === activeLineId) ?? lines[0] ?? null;
	const hasGuide = !!session?.guide_audio_path;

	const guideWaveformQuery = useQuery({
		queryKey: ["adr-guide-waveform", sessionId],
		queryFn: () => apiClient.getADRGuideWaveform(sid),
		enabled: !!sessionId && hasGuide,
	});

	const createMut = useMutation({
		mutationFn: () =>
			apiClient.createADRSession(newSessionName || "Untitled Session", [
				{ line_id: "line-1", original_text: "", character: "Character" },
			]),
		onSuccess: (data: ADRSessionSummary) => {
			setSessionId(data.id);
			setNewSessionName("");
			void queryClient.invalidateQueries({ queryKey: ["adr-sessions"] });
			toast({ title: "Session created" });
		},
		onError: (e: unknown) => showStudioErrorToast(e),
	});

	const uploadGuideMut = useMutation({
		mutationFn: (file: File) => apiClient.uploadADRSessionGuide(sid, file),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: ["adr-session", sessionId],
			});
			void queryClient.invalidateQueries({
				queryKey: ["adr-guide-waveform", sessionId],
			});
			toast({ title: "Guide track uploaded" });
		},
		onError: (e: unknown) => showStudioErrorToast(e),
	});

	const autoDiarizeMut = useMutation({
		mutationFn: () => {
			if (!session?.guide_audio_path) throw new Error("No guide audio");
			return apiClient.diarizePath(session.guide_audio_path);
		},
		onSuccess: (data) => {
			setDetectedSpeakers(data.speakers ?? []);
			toast({
				title: "Speakers detected",
				description: `${(data.speakers ?? []).length} speaker(s) found in guide.`,
			});
		},
		onError: (e: unknown) => showStudioErrorToast(e),
	});

	const selectTakeMut = useMutation({
		mutationFn: ({ lineId, takeId }: { lineId: string; takeId: string }) =>
			apiClient.selectADRTake(sid, lineId, takeId),
		onSuccess: () =>
			void queryClient.invalidateQueries({
				queryKey: ["adr-session", sessionId],
			}),
		onError: (error: Error) => showStudioErrorToast(error),
	});

	const deleteTakeMut = useMutation({
		mutationFn: (takeId: string) => apiClient.deleteADRTake(takeId),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: ["adr-session", sessionId],
			});
			toast({ title: "Take deleted" });
		},
		onError: (error: Error) => showStudioErrorToast(error),
	});

	const autoSelectMut = useMutation({
		mutationFn: (lineId: string) => apiClient.autoSelectADRTake(lineId),
		onSuccess: (data: { selected_take_id: string | null }) => {
			void queryClient.invalidateQueries({
				queryKey: ["adr-session", sessionId],
			});
			if (data?.selected_take_id) {
				toast({ title: "Auto-selected best take" });
			} else {
				toast({
					title: ERR_TITLE_ADR,
					description: "Record some takes first",
					variant: "destructive",
				});
			}
		},
		onError: (error: Error) => showStudioErrorToast(error),
	});

	const alignMut = useMutation({
		mutationFn: async ({
			guideUrl,
			takeUrl,
		}: {
			guideUrl: string;
			takeUrl: string;
		}) => {
			const [gBuf, tBuf] = await Promise.all([
				fetch(guideUrl).then((r) => {
					if (!r.ok) {
						throw new Error(`Guide fetch failed: ${r.status}`);
					}
					return r.arrayBuffer();
				}),
				fetch(takeUrl).then((r) => {
					if (!r.ok) {
						throw new Error(`Take fetch failed: ${r.status}`);
					}
					return r.arrayBuffer();
				}),
			]);
			const AudioCtx =
				window.AudioContext ??
				(window as unknown as { webkitAudioContext: typeof AudioContext })
					.webkitAudioContext;
			const ctx = new AudioCtx({ sampleRate: 24000 });
			try {
				const [gDecoded, tDecoded] = await Promise.all([
					ctx.decodeAudioData(gBuf.slice(0)),
					ctx.decodeAudioData(tBuf.slice(0)),
				]);
				const cap = 24000 * 10;
				const g = gDecoded.getChannelData(0).slice(0, cap);
				const t = tDecoded.getChannelData(0).slice(0, cap);
				return apiClient.alignADRTake(Array.from(g), Array.from(t), 24000);
			} finally {
				await ctx.close().catch(() => {});
			}
		},
		onSuccess: (data: { alignment_offset_ms: number }) => {
			const v = Math.round(data.alignment_offset_ms);
			setShiftMs(Math.max(-500, Math.min(500, v)));
			toast({ title: `Aligned: ${data.alignment_offset_ms.toFixed(1)} ms` });
		},
		onError: (error: Error) => showStudioErrorToast(error),
	});

	function playAudio(url: string) {
		if (audioRef.current) {
			audioRef.current.pause();
		}
		audioRef.current = new Audio(url);
		audioRef.current.play().catch((err: unknown) => showStudioErrorToast(err));
	}

	function startRecord(lineId: string) {
		setRecordingLineId(lineId);
		recording.startRecording();
	}

	function stopRecord() {
		recording.stopRecording();
	}

	function deleteSession() {
		setConfirmDeleteSession(false);
		apiClient
			.deleteADRSession(sid)
			.then(() => {
				setSessionId(null);
				void queryClient.invalidateQueries({ queryKey: ["adr-sessions"] });
				toast({ title: "Session deleted" });
			})
			.catch((e: unknown) => showStudioErrorToast(e));
	}

	if (!sessionId) {
		const summaries =
			(sessionsQuery.data as ADRSessionSummary[] | undefined) ?? [];
		return (
			<div className="flex h-full flex-col items-center justify-center gap-4 p-8">
				<ScreenHeader title="ADR Studio" />
				<div className="flex w-full max-w-md items-center gap-2">
					<Input
						placeholder="Session name"
						value={newSessionName}
						onChange={(e) => setNewSessionName(e.target.value)}
						className="h-8 flex-1 text-xs"
						aria-label="New session name"
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								createMut.mutate();
							}
						}}
					/>
					<Button
						type="button"
						size="sm"
						className="h-8"
						disabled={createMut.isPending}
						onClick={() => createMut.mutate()}
					>
						{createMut.isPending ? (
							<Spinner size="xs" className="mr-1" />
						) : (
							<PlusIcon className="mr-1 size-3.5" aria-hidden="true" />
						)}
						New Session
					</Button>
				</div>
				{sessionsQuery.isLoading ? (
					<LoadingState label="Loading sessions" />
				) : sessionsQuery.isError ? (
					<EmptyState
						title="Sessions couldn't load"
						body={
							sessionsQuery.error instanceof Error
								? sessionsQuery.error.message
								: "Please try again."
						}
					/>
				) : summaries.length > 0 ? (
					<div className="flex w-full max-w-md flex-col gap-2">
						<p className="text-xs text-muted-foreground">
							Or continue an existing session:
						</p>
						{summaries.slice(0, 10).map((s) => (
							<button
								key={s.id}
								type="button"
								className="w-full rounded-md border border-border bg-card px-3 py-2 text-left text-xs text-foreground transition-colors hover:border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								onClick={() => setSessionId(s.id)}
							>
								{s.name}
							</button>
						))}
					</div>
				) : null}
			</div>
		);
	}

	const guideWaveform: number[] = guideWaveformQuery.data?.waveform ?? [];

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader title="ADR Studio" />
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-2">
					<span className="truncate text-sm font-semibold text-foreground">
						{session?.name ?? "Loading…"}
					</span>
					<Badge tone="neutral">{lines.length} lines</Badge>
					<button
						type="button"
						className="rounded-sm text-xs text-muted-foreground underline transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						onClick={() => {
							setSessionId(null);
							void queryClient.invalidateQueries({
								queryKey: ["adr-sessions"],
							});
						}}
					>
						Switch
					</button>
				</div>
				<div className="flex items-center gap-2">
					<label
						htmlFor="adr-guide-upload"
						className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-input bg-sunken px-2 text-xs text-foreground transition-colors hover:border-strong focus-within:outline-none focus-within:ring-2 focus-within:ring-ring"
					>
						<input
							id="adr-guide-upload"
							type="file"
							accept="audio/*"
							className="hidden"
							disabled={uploadGuideMut.isPending}
							onChange={(e) => {
								const f = e.target.files?.[0];
								if (f && sessionId) {
									uploadGuideMut.mutate(f);
								}
							}}
						/>
						{uploadGuideMut.isPending ? (
							<Spinner size="xs" />
						) : (
							<ArrowUpTrayIcon className="size-3" aria-hidden="true" />
						)}
						{session?.guide_audio_path ? "Replace Guide" : "Import Guide"}
					</label>
					{session?.guide_audio_path ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-7 px-2 text-xs"
							disabled={autoDiarizeMut.isPending}
							title="Auto-detect speakers from guide audio"
							onClick={() => autoDiarizeMut.mutate()}
						>
							{autoDiarizeMut.isPending ? <Spinner size="xs" className="mr-1" /> : null}
							Auto-label speakers
						</Button>
					) : null}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-7 px-2 text-xs text-destructive hover:text-destructive"
						title="Delete session"
						aria-label="Delete session"
						onClick={() => setConfirmDeleteSession(true)}
					>
						Delete
					</Button>
				</div>
			</div>

			<AlignmentPanel
				session={session ?? { id: sid }}
				sid={sid}
				hasGuide={hasGuide}
				guideWaveform={guideWaveform}
				playAudio={playAudio}
			/>

			<RecordingControls
				activeLine={activeLine}
				hasGuide={hasGuide}
				recording={recording}
				shiftMs={shiftMs}
				setShiftMs={setShiftMs}
				startRecord={startRecord}
				stopRecord={stopRecord}
				alignMut={alignMut}
				toast={toast}
				guideUrl={apiClient.getADRGuideAudioUrl(sid)}
			/>

			<Separator />

			<div className="flex min-h-0 flex-1 gap-4">
				{sessionQuery.isLoading ? (
					<LoadingState label="Loading session" className="w-full" />
				) : sessionQuery.isError ? (
					<EmptyState
						title="Session couldn't load"
						body={
							sessionQuery.error instanceof Error
								? sessionQuery.error.message
								: "Please try again."
						}
					/>
				) : (
					<TakeManager
						lines={lines}
						activeLine={activeLine}
						setActiveLineId={setActiveLineId}
						playAudio={playAudio}
						selectTakeMut={selectTakeMut}
						deleteTakeMut={deleteTakeMut}
						autoSelectMut={autoSelectMut}
					/>
				)}
			</div>

			{/* biome-ignore lint/a11y/useMediaCaption: programmatic-only playback element */}
			<audio ref={audioRef} className="hidden" />

			<AlertDialog
				open={confirmDeleteSession}
				onOpenChange={setConfirmDeleteSession}
			>
				<AlertDialogContent>
					<AlertDialogTitle>Delete session?</AlertDialogTitle>
					<AlertDialogDescription>
						{session?.name ?? "This session"} and all its takes will be removed.
						This cannot be undone.
					</AlertDialogDescription>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={deleteSession}>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
