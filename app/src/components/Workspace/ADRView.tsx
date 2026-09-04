import {
	ExclamationTriangleIcon as AlertTriangle,
	PlusIcon as Plus,
	RadioIcon as Radio,
	TrashIcon as Trash2,
	ArrowUpTrayIcon as Upload,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/LoadingState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Spinner } from "@/components/ui/Spinner";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import { ERR_TITLE_ADR } from "@/lib/errorMessages";
import { showStudioErrorToast } from "@/lib/errors";
import { useAudioRecording } from "@/lib/hooks/useAudioRecording";
import type { ADRSession, ADRSessionSummary } from "./ADRViewTypes";
import { AdrAlignmentPanel } from "./AdrAlignmentPanel";
import { AdrRecordingControls } from "./AdrRecordingControls";
import { AdrTakeManager } from "./AdrTakeManager";

export function ADRView() {
	const { toast } = useToast();
	const queryClient = useQueryClient();
	const audioRef = useRef<HTMLAudioElement | null>(null);

	const [sessionId, setSessionId] = useState<string | null>(null);
	const sid = sessionId ?? "";
	const [activeLineId, setActiveLineId] = useState<string | null>(null);
	const [shiftMs, setShiftMs] = useState(0);
	const [newSessionName, setNewSessionName] = useState("");

	const adrSearch = useSearch({ from: "/workspace/adr" });
	useEffect(() => {
		if (adrSearch.session && adrSearch.session !== sessionId) {
			setSessionId(adrSearch.session);
		}
	}, [adrSearch.session, sessionId]);

	const [recordingLineId, setRecordingLineId] = useState<string | null>(null);

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
				queryClient.invalidateQueries({ queryKey: ["adr-session", sessionId] });
				toast({ title: "Take uploaded" });
			} catch (e: unknown) {
				showStudioErrorToast(e);
			}
			setRecordingLineId(null);
		},
		[sessionId, recordingLineId, queryClient, toast],
	);

	const recording = useAudioRecording({
		onRecordingComplete,
	});

	const sessionsQuery = useQuery({
		queryKey: ["adr-sessions"],
		queryFn: () => apiClient.listADRSessions(),
	});

	const sessionQuery = useQuery({
		queryKey: ["adr-session", sessionId],
		queryFn: () => apiClient.getADRSession(sid),
		enabled: !!sessionId,
	});

	const session = sessionQuery.data as ADRSession;
	const lines = session?.lines ?? [];

	const activeLine =
		lines.find((l) => l.id === activeLineId) ?? lines[0] ?? null;

	const hasGuide = !!session?.guide_audio_path;

	const guideWaveformQuery = useQuery({
		queryKey: ["adr-guide-waveform", sessionId],
		queryFn: () => apiClient.getADRGuideWaveform(sid),
		enabled: !!sessionId && !!session?.guide_audio_path,
	});

	const createMut = useMutation({
		mutationFn: () =>
			apiClient.createADRSession(newSessionName || "Untitled Session", [
				{ line_id: "line-1", original_text: "", character: "Character" },
			]),
		onSuccess: (data: ADRSessionSummary) => {
			setSessionId(data.id);
			setNewSessionName("");
			queryClient.invalidateQueries({ queryKey: ["adr-sessions"] });
			toast({ title: "Session created" });
		},
		onError: (e: unknown) => showStudioErrorToast(e),
	});

	const uploadGuideMut = useMutation({
		mutationFn: (file: File) => apiClient.uploadADRSessionGuide(sid, file),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["adr-session", sessionId] });
			queryClient.invalidateQueries({
				queryKey: ["adr-guide-waveform", sessionId],
			});
			toast({ title: "Guide track uploaded" });
		},
		onError: (e: unknown) => showStudioErrorToast(e),
	});

	const selectTakeMut = useMutation({
		mutationFn: ({ lineId, takeId }: { lineId: string; takeId: string }) =>
			apiClient.selectADRTake(sid, lineId, takeId),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["adr-session", sessionId] }),
		onError: (error: Error) => showStudioErrorToast(error),
	});

	const deleteTakeMut = useMutation({
		mutationFn: (takeId: string) => apiClient.deleteADRTake(takeId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["adr-session", sessionId] });
			toast({ title: "Take deleted" });
		},
		onError: (error: Error) => showStudioErrorToast(error),
	});

	const autoSelectMut = useMutation({
		mutationFn: (lineId: string) => apiClient.autoSelectADRTake(lineId),
		onSuccess: (data: { selected_take_id: string | null }) => {
			queryClient.invalidateQueries({ queryKey: ["adr-session", sessionId] });
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
		onError: (error: Error) => {
			showStudioErrorToast(error);
		},
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
			const AudioCtx = (window.AudioContext ||
				(window as unknown as { webkitAudioContext: typeof AudioContext })
					.webkitAudioContext) as typeof AudioContext;
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
		onError: (error: Error) => {
			showStudioErrorToast(error);
		},
	});

	const handleGuideImport = () => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "audio/*";
		input.onchange = async () => {
			const file = input.files?.[0];
			if (file && sessionId) {
				uploadGuideMut.mutate(file);
			}
		};
		input.click();
	};

	const playAudio = (url: string) => {
		if (audioRef.current) {
			audioRef.current.pause();
		}
		audioRef.current = new Audio(url);
		audioRef.current.play().catch((err) => {
			showStudioErrorToast(err);
		});
	};

	const startRecord = (lineId: string) => {
		setRecordingLineId(lineId);
		recording.startRecording();
	};

	const stopRecord = () => {
		recording.stopRecording();
	};

	if (!sessionId) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-4 p-8">
				<Radio className="size-12 text-muted-foreground/40" />
				<p className="text-sm text-muted-foreground text-center">
					Create an ADR session to start recording dialogue replacement
				</p>
				<div className="flex gap-2 items-center">
					<Input
						placeholder="Session name…"
						value={newSessionName}
						onChange={(e) => setNewSessionName(e.target.value)}
						className="w-56 h-8 text-xs"
						onKeyDown={(e) => e.key === "Enter" && createMut.mutate()}
					/>
					<Button
						size="sm"
						className="h-8"
						onClick={() => createMut.mutate()}
						disabled={createMut.isPending}
					>
						{createMut.isPending ? (
							<Spinner />
						) : (
							<Plus className="h-3.5 w-3.5 mr-1" />
						)}
						New Session
					</Button>
				</div>
				{sessionsQuery.isLoading ? (
					<Spinner label="Loading sessions…" />
				) : sessionsQuery.isError ? (
					<EmptyState
						variant="error"
						icon={<AlertTriangle className="size-6" />}
						title="Failed to load sessions"
						description={
							sessionsQuery.error instanceof Error
								? sessionsQuery.error.message
								: "Please try again."
						}
						className="w-80"
					/>
				) : (
					sessionsQuery.data &&
					(sessionsQuery.data as ADRSessionSummary[]).length > 0 && (
						<div className="flex flex-col gap-2 w-80">
							<p className="text-xs text-muted-foreground">
								Or continue an existing session:
							</p>
							{(sessionsQuery.data as ADRSessionSummary[])
								.slice(0, 10)
								.map((s: ADRSessionSummary) => (
									<button
										key={s.id}
										type="button"
										className="w-full text-left px-3 py-2 rounded-lg border border-border bg-card hover:border-accent/50 text-xs"
										onClick={() => setSessionId(s.id)}
									>
										{s.name}
									</button>
								))}
						</div>
					)
				)}
			</div>
		);
	}

	const guideWaveform: number[] = guideWaveformQuery.data?.waveform ?? [];

	return (
		<div className="flex flex-col h-full p-4 gap-4">
			<ScreenHeader
				icon={<Radio className="size-5" />}
				title="ADR Studio"
				description="Automated dialogue replacement & take comping"
			/>
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<span className="text-sm font-semibold">
						{session?.name ?? "Loading…"}
					</span>
					<Badge variant="secondary" className="text-xs">
						{lines.length} lines
					</Badge>
					<button
						type="button"
						className="text-xs text-muted-foreground hover:text-foreground underline"
						onClick={() => {
							setSessionId(null);
							queryClient.invalidateQueries({ queryKey: ["adr-sessions"] });
						}}
					>
						Switch
					</button>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						className="h-7 text-xs"
						onClick={handleGuideImport}
						disabled={uploadGuideMut.isPending}
					>
						{uploadGuideMut.isPending ? (
							<Spinner />
						) : (
							<Upload className="size-3 mr-1" />
						)}
						{session?.guide_audio_path ? "Replace Guide" : "Import Guide"}
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-7 text-destructive/60 hover:text-destructive"
						aria-label="Delete session"
						title="Delete session"
						onClick={() => {
							if (
								!window.confirm(
									`Delete session "${session?.name ?? sid}"? This cannot be undone.`,
								)
							) {
								return;
							}
							apiClient
								.deleteADRSession(sid)
								.then(() => {
									setSessionId(null);
									queryClient.invalidateQueries({ queryKey: ["adr-sessions"] });
									toast({ title: "Session deleted" });
								})
								.catch((e: unknown) => showStudioErrorToast(e));
						}}
					>
						<Trash2 className="h-3.5 w-3.5" />
					</Button>
				</div>
			</div>

			<AdrAlignmentPanel
				session={session}
				sid={sid}
				hasGuide={hasGuide}
				guideWaveform={guideWaveform}
				playAudio={playAudio}
			/>

			{/* Recording controls */}
			<AdrRecordingControls
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

			{/* Lines + Takes */}
			<div className="flex flex-1 gap-4 overflow-hidden">
				{sessionQuery.isLoading ? (
					<LoadingState label="Loading session…" className="w-full" />
				) : sessionQuery.isError ? (
					<EmptyState
						variant="error"
						icon={<AlertTriangle className="size-6" />}
						title="Failed to load"
						description={
							sessionQuery.error instanceof Error
								? sessionQuery.error.message
								: "Please try again."
						}
						className="w-full"
					/>
				) : (
					<AdrTakeManager
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

			{/* Hidden audio element */}
			{/* biome-ignore lint/a11y/useMediaCaption: hidden programmatic-only audio element */}
			<audio ref={audioRef} className="hidden" />
		</div>
	);
}
