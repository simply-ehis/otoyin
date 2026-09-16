import { PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import WaveformVisualizer from "@/components/WaveformVisualizer/WaveformVisualizer";
import type { IsolationStem } from "@/features/workspace/VocalIsolationView";
import { apiClient } from "@/lib/api/client";
import { DEMUCS_MODEL_NAME } from "@/lib/audio/ensureModel";
import { useDownloadedTtsEngines } from "@/lib/hooks/useFirstDownloadedTtsEngine";
import {
	PodcastProducer,
	TranscriptDrawer,
	type VoiceProfile,
} from "@/lib/transcript";
import { logger } from "@/lib/utils/debug";
import { useToast } from "@/ui/use-toast";
import { useAudioStudioStore } from "./AudioStudioStore";
import { SessionDialogs } from "./SessionDialogs";
import { StudioToolbar } from "./StudioToolbar";
import { TimelineRuler } from "./TimelineRuler";
import { TrackList } from "./TrackList";
import { TransportControls } from "./TransportControls";
import { useBounceTrack } from "./useBounceTrack";
import { useImportAudio } from "./useImportAudio";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { useOfflineExport } from "./useOfflineExport";
import { usePlaybackEngine } from "./usePlaybackEngine";
import { usePluginExport } from "./usePluginExport";
import { useRecordingManager } from "./useRecordingManager";
import { useSessionManager } from "./useSessionManager";
import { useStudioClipPaste } from "./useStudioClipPaste";
import { useStudioDrag } from "./useStudioDrag";
import { useStudioIsolation } from "./useStudioIsolation";
import { useStudioRenderFx } from "./useStudioRenderFx";
import { useStudioStitch } from "./useStudioStitch";
import { StitchDialog } from "./StitchDialog";

export function AudioStudio() {
	const { toast } = useToast();
	const tracks = useAudioStudioStore((s) => s.tracks);
	const isPlaying = useAudioStudioStore((s) => s.isPlaying);
	const isRecording = useAudioStudioStore((s) => s.isRecording);
	const isLooping = useAudioStudioStore((s) => s.isLooping);
	const masterVolume = useAudioStudioStore((s) => s.masterVolume);
	const playbackSpeed = useAudioStudioStore((s) => s.playbackSpeed);
	const zoomLevel = useAudioStudioStore((s) => s.zoomLevel);
	const showAutomation = useAudioStudioStore((s) => s.showAutomation);
	const markers = useAudioStudioStore((s) => s.markers);
	const undoStack = useAudioStudioStore((s) => s.undoStack);
	const redoStack = useAudioStudioStore((s) => s.redoStack);
	const currentTimeRef = useAudioStudioStore((s) => s.currentTimeRef);

	const [waveformProgress, setWaveformProgress] = useState(0);
	const [liveAnalyser, setLiveAnalyser] = useState<AnalyserNode | null>(null);
	const [displayTime, setDisplayTime] = useState(0);

	const setIsPlaying = useAudioStudioStore((s) => s.setIsPlaying);
	const setIsRecording = useAudioStudioStore((s) => s.setIsRecording);
	const setIsLooping = useAudioStudioStore((s) => s.setIsLooping);
	const setCurrentTime = useAudioStudioStore((s) => s.setCurrentTime);
	const setMasterVolume = useAudioStudioStore((s) => s.setMasterVolume);
	const setPlaybackSpeed = useAudioStudioStore((s) => s.setPlaybackSpeed);
	const setZoomLevel = useAudioStudioStore((s) => s.setZoomLevel);
	const setShowAutomation = useAudioStudioStore((s) => s.setShowAutomation);
	const addMarker = useAudioStudioStore((s) => s.addMarker);
	const removeMarker = useAudioStudioStore((s) => s.removeMarker);
	const addTrack = useAudioStudioStore((s) => s.addTrack);
	const duplicateTrack = useAudioStudioStore((s) => s.duplicateTrack);
	const moveTrack = useAudioStudioStore((s) => s.moveTrack);
	const setTrackAudio = useAudioStudioStore((s) => s.setTrackAudio);
	const updateTrack = useAudioStudioStore((s) => s.updateTrack);
	const setRecordingTrackIndex = useAudioStudioStore(
		(s) => s.setRecordingTrackIndex,
	);
	const pushUndo = useAudioStudioStore((s) => s.pushUndo);
	const undo = useAudioStudioStore((s) => s.undo);
	const redo = useAudioStudioStore((s) => s.redo);
	const groups = useAudioStudioStore((s) => s.groups);
	const addGroup = useAudioStudioStore((s) => s.addGroup);
	const removeGroup = useAudioStudioStore((s) => s.removeGroup);
	const toggleGroupCollapse = useAudioStudioStore((s) => s.toggleGroupCollapse);
	const toggleGroupMute = useAudioStudioStore((s) => s.toggleGroupMute);
	const toggleGroupSolo = useAudioStudioStore((s) => s.toggleGroupSolo);
	const tempoMap = useAudioStudioStore((s) => s.tempoMap);
	const timeSignature = useAudioStudioStore((s) => s.timeSignature);
	const addTempoChange = useAudioStudioStore((s) => s.addTempoChange);

	const [selectedTrackIndex, setSelectedTrackIndex] = useState(0);
	const [exporting, setExporting] = useState(false);
	const [exportingReaper, setExportingReaper] = useState(false);
	const [isolateStem, setIsolateStem] = useState<IsolationStem>("vocals");
	const [stemMode, setStemMode] = useState<"isolate" | "remove">("isolate");
	const [transcriptDrawerOpen, setTranscriptDrawerOpen] = useState(false);
	const [transcriptTrackIndex, setTranscriptTrackIndex] = useState<
		number | null
	>(null);
	const [stitchDialogOpen, setStitchDialogOpen] = useState(false);
	const [podcastProducerOpen, setPodcastProducerOpen] = useState(false);
	const [podcastProfiles, setPodcastProfiles] = useState<VoiceProfile[]>([]);
	const audioBuffersRef = useRef<Map<string, AudioBuffer>>(new Map());
	const rootRef = useRef<HTMLDivElement>(null);

	const { data: modelStatus } = useQuery({
		queryKey: ["modelStatus"],
		queryFn: () => apiClient.getModelStatus(),
		staleTime: 30_000,
	});
	const demucsReady =
		modelStatus?.models.some(
			(m) => m.model_name === DEMUCS_MODEL_NAME && m.downloaded,
		) ?? false;

	const session = useSessionManager();
	const { handleExport: offlineExport } = useOfflineExport(audioBuffersRef);

	const playback = usePlaybackEngine({
		tracks,
		masterVolume,
		isLooping,
		playbackSpeed,
		audioBuffersRef,
		setIsPlaying,
		setCurrentTime,
		updateTrack,
	});
	const {
		stopPlayback,
		togglePlayPause,
		seekTo,
		analyserRef,
		durationRef,
		sourceNodesRef,
		trackAnalysers,
	} = playback;

	// Ref mutation never re-renders, so mirror the live analyser into state
	// when playback starts/stops — otherwise the visualizer gets null forever.
	useEffect(() => {
		setLiveAnalyser(isPlaying ? (analyserRef.current ?? null) : null);
	}, [isPlaying, analyserRef]);

	// Drive waveform progress from ref — throttled to ~10Hz. Writing React
	// state at 60fps re-renders the studio + TimelineRuler every frame.
	useEffect(() => {
		if (!isPlaying) {
			return;
		}
		let raf: number;
		let lastUpdate = 0;
		const tick = () => {
			if (document.hidden) {
				raf = requestAnimationFrame(tick);
				return;
			}
			const now = performance.now();
			if (now - lastUpdate >= 100) {
				lastUpdate = now;
				const dur = durationRef.current;
				const t = currentTimeRef.current;
				setWaveformProgress(dur ? Math.min(1, t / dur) : 0);
				setDisplayTime(t);
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [isPlaying, currentTimeRef, durationRef]);

	const { handleExportWithPlugins, exportWithPlugins } = usePluginExport({
		tracks,
		masterVolume,
	});

	const {
		handleRecordingComplete: _handleRecordingComplete,
		handleStartRecording,
		handleStopRecording,
	} = useRecordingManager({
		tracks,
		selectedTrackIndex,
		setRecordingTrackIndex,
		setIsRecording,
		updateTrack,
		setTrackAudio,
		pushUndo,
		audioBuffersRef,
	});

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
	);
	const wrappedAddTrack = useCallback(() => {
		pushUndo("Add track");
		addTrack();
	}, [pushUndo, addTrack]);

	const handleDuplicateTrack = useCallback(
		(id: string) => {
			const source = tracks.find((t) => t.id === id);
			if (!source) {
				return;
			}
			pushUndo(`Duplicate ${source.name}`);
			const newId = duplicateTrack(id);
			if (!newId) {
				return;
			}
			const buffer = audioBuffersRef.current.get(id);
			if (buffer) {
				audioBuffersRef.current.set(newId, buffer);
			}
			toast({ title: `Duplicated ${source.name}` });
		},
		[tracks, pushUndo, duplicateTrack, toast],
	);

	const pasteClip = useStudioClipPaste(addTrack, updateTrack, pushUndo);
	const handleImportAudio = useImportAudio({
		selectedTrackIndex,
		tracks,
		audioBuffersRef,
		updateTrack,
		setTrackAudio,
		pushUndo,
	});
	const { isolating, handleIsolate } = useStudioIsolation({
		tracks,
		selectedTrackIndex,
		isolateStem,
		invert: stemMode === "remove",
		demucsReady,
		addTrack,
		updateTrack,
		setTrackAudio,
		pushUndo,
		audioBuffersRef,
	});
	const { handleBounce, bouncing } = useBounceTrack({
		tracks,
		selectedTrackIndex,
		audioBuffersRef,
		setTrackAudio,
		updateTrack,
		pushUndo,
	});
	const { stitching, handleStitch } = useStudioStitch({
		tracks,
		selectedTrackIndex,
		addTrack,
		updateTrack,
		setTrackAudio,
		pushUndo,
		audioBuffersRef,
	});
	const { rendering: renderingFx, handleRenderFx } = useStudioRenderFx({
		tracks,
		selectedTrackIndex,
		addTrack,
		updateTrack,
		setTrackAudio,
		pushUndo,
		audioBuffersRef,
	});
	const { activeDragId, handleDragStart, handleDragEnd } = useStudioDrag(
		tracks,
		moveTrack,
		pushUndo,
	);

	const handleExport = useCallback(async () => {
		setExporting(true);
		const ok = await offlineExport(tracks, masterVolume);
		if (!ok) {
			toast({
				title: "Export failed",
				description: "The mix could not be rendered. Try again.",
				variant: "destructive",
			});
		}
		setExporting(false);
	}, [tracks, masterVolume, offlineExport, toast]);

	const openTranscriptDrawer = useCallback(
		(trackIndex: number) => {
			const track = tracks[trackIndex];
			if (!track?.audioUrl || !track.generationId) {
				toast({
					title: "Cannot transcribe",
					description: "Track must have audio from a generation",
					variant: "destructive",
				});
				return;
			}
			setTranscriptTrackIndex(trackIndex);
			setTranscriptDrawerOpen(true);
		},
		[tracks, toast],
	);

	useEffect(() => {
		let cancelled = false;
		apiClient
			.listProfiles()
			.then((profiles) => {
				if (!cancelled) {
					setPodcastProfiles(profiles as VoiceProfile[]);
				}
			})
			.catch((e: unknown) => logger.debug("[studio] listProfiles failed", e));
		return () => {
			cancelled = true;
		};
	}, []);

	const podcastEngines = useDownloadedTtsEngines();

	useKeyboardShortcuts({
		tracks,
		selectedTrackIndex,
		isRecording,
		togglePlayPause,
		handleStartRecording,
		handleStopRecording,
		session,
		pushUndo,
		undo,
		redo,
		rootRef,
	});

	useEffect(() => {
		if (tracks.length === 0) {
			addTrack("Track 1");
		}
	}, [tracks.length, addTrack]);

	return (
		<div
			ref={rootRef}
			tabIndex={-1}
			className="flex flex-col h-full min-h-0 outline-none"
		>
			<StudioToolbar
				unsaved={session.unsaved}
				showAutomation={showAutomation}
				exporting={exporting}
				exportWithPlugins={exportWithPlugins}
				canExportReaper={!!session.currentSessionId}
				exportingReaper={exportingReaper}
				undoStackLength={undoStack.length}
				redoStackLength={redoStack.length}
				tracksHaveAudio={tracks.some((t) => !!t.audioUrl)}
				tracksHaveAnyContent={tracks.some(
					(t) => !!t.audioUrl || !!t.audioBlob || t.midiNotes.length > 0,
				)}
				isolating={isolating}
				isolateStem={isolateStem}
				selectedTrackHasAudio={
					!!tracks[selectedTrackIndex]?.audioUrl ||
					!!tracks[selectedTrackIndex]?.audioBlob
				}
				bouncing={bouncing}
				renderingFx={renderingFx}
				canRenderFx={
					(tracks[selectedTrackIndex]?.pluginChain ?? []).some(
						(p) => p.enabled,
					) &&
					(!!tracks[selectedTrackIndex]?.audioUrl ||
						!!tracks[selectedTrackIndex]?.audioBlob)
				}
				onRenderFx={() => void handleRenderFx()}
				canStitch={
					tracks.filter((t) => !!t.audioUrl || !!t.audioBlob).length >= 2
				}
				onNew={session.handleNewSession}
				onSave={() => session.setShowSaveDialog(true)}
				onPaste={pasteClip}
				onLoad={session.handleLoadSession}
				onUndo={undo}
				onRedo={redo}
				onToggleAutomation={() => setShowAutomation(!showAutomation)}
				onExport={handleExport}
				onExportWithPlugins={() => void handleExportWithPlugins()}
				onExportReaper={() => {
					const id = session.currentSessionId;
					if (!id) {
						return;
					}
					setExportingReaper(true);
					void apiClient
						.exportReaper(id)
						.then((blob) => {
							const url = URL.createObjectURL(blob);
							const a = document.createElement("a");
							a.href = url;
							a.download = "session.rpp";
							document.body.appendChild(a);
							a.click();
							a.remove();
							URL.revokeObjectURL(url);
						})
						.catch((err: unknown) => {
							toast({
								title: "Reaper export failed",
								description:
									err instanceof Error ? err.message : "Unknown error",
								variant: "destructive",
							});
						})
						.finally(() => setExportingReaper(false));
				}}
				onIsolateStemChange={setIsolateStem}
				onIsolate={() => void handleIsolate()}
				stemMode={stemMode}
				onStemModeChange={setStemMode}
				onBounce={() => void handleBounce()}
				onStitch={() => setStitchDialogOpen(true)}
				onProducePodcast={() => setPodcastProducerOpen(true)}
				groups={groups}
				onAddGroup={(name) => {
					pushUndo(`Create group "${name}"`);
					addGroup(name);
				}}
				onRemoveGroup={(id) => {
					pushUndo("Remove group");
					removeGroup(id);
				}}
				onToggleGroupCollapse={toggleGroupCollapse}
				onToggleGroupMute={toggleGroupMute}
				onToggleGroupSolo={toggleGroupSolo}
			/>

			<SessionDialogs
				showSaveDialog={session.showSaveDialog}
				showLoadDialog={session.showLoadDialog}
				showTemplateDialog={session.showTemplateDialog}
				sessionName={session.sessionName}
				savedSessions={session.savedSessions}
				setSessionName={session.setSessionName}
				setShowSaveDialog={session.setShowSaveDialog}
				setShowLoadDialog={session.setShowLoadDialog}
				setShowTemplateDialog={session.setShowTemplateDialog}
				handleSaveSession={session.handleSaveSession}
				doLoadSession={session.doLoadSession}
				doDeleteSession={session.doDeleteSession}
				doNewFromTemplate={session.doNewFromTemplate}
			/>

			<TranscriptDrawer
				generationId={
					transcriptTrackIndex !== null
						? (tracks[transcriptTrackIndex]?.generationId ?? "")
						: ""
				}
				open={transcriptDrawerOpen}
				onOpenChange={setTranscriptDrawerOpen}
			/>

			<StitchDialog
				open={stitchDialogOpen}
				onClose={() => setStitchDialogOpen(false)}
				tracks={tracks}
				sourceTrackId={tracks[selectedTrackIndex]?.id ?? null}
				stitching={stitching}
				onStitch={(targetId, stitchOpts) => {
					void handleStitch(targetId, stitchOpts).then((ok) => {
						if (ok) {
							setStitchDialogOpen(false);
						}
					});
				}}
			/>

			<PodcastProducer
				open={podcastProducerOpen}
				onOpenChange={setPodcastProducerOpen}
				profiles={podcastProfiles}
				engines={podcastEngines}
				onAddToTimeline={(blob) => {
					void (async () => {
						try {
							const ctx = new AudioContext();
							const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
							await ctx.close().catch(() => undefined);
							const { getPeakWaveform } = await import("./getPeakWaveform");
							const { getAudioDuration } = await import("@/lib/utils/audio");
							const url = URL.createObjectURL(blob);
							const id = addTrack("Podcast mix");
							const duration = await getAudioDuration(
								new File([blob], "podcast-mix.wav", { type: "audio/wav" }),
							).catch(() => buf.duration);
							audioBuffersRef.current.set(id, buf);
							setTrackAudio(id, url, blob, duration);
							updateTrack(id, {
								waveformData: getPeakWaveform(buf, 200),
								channels: buf.numberOfChannels,
							});
							pushUndo("Add podcast mix");
							toast({ title: "Podcast added to timeline" });
						} catch {
							toast({
								title: "Could not add to timeline",
								description: "The mix downloaded fine — import it manually.",
								variant: "destructive",
							});
						}
					})();
				}}
			/>

			<div className="flex-1 flex flex-col min-h-0">
				<TimelineRuler
					zoomLevel={zoomLevel}
					markers={markers}
					currentTime={displayTime}
					tempoMap={tempoMap}
					timeSignature={timeSignature}
					onSeek={seekTo}
					onRemoveMarker={removeMarker}
					onAddTempoChange={(time) => {
						const bpm = window.prompt("BPM:");
						if (bpm && !Number.isNaN(Number(bpm))) {
							pushUndo(`Set tempo to ${bpm} BPM`);
							addTempoChange(time, Number(bpm));
						}
					}}
				/>

				<div className="flex-1 overflow-y-auto">
					<TrackList
						tracks={tracks}
						sensors={sensors}
						activeDragId={activeDragId}
						trackAnalysers={trackAnalysers}
						onDragStart={handleDragStart}
						onDragEnd={handleDragEnd}
						onTranscribe={openTranscriptDrawer}
						onDuplicate={handleDuplicateTrack}
					/>
				</div>
			</div>

			<div className="shrink-0 border-t border-border bg-card px-4 py-1">
				<WaveformVisualizer
					analyser={liveAnalyser}
					playing={isPlaying}
					progress={waveformProgress}
					height={48}
					className="w-full rounded-md"
				/>
			</div>

			<TransportControls
				isPlaying={isPlaying}
				isRecording={isRecording}
				isLooping={isLooping}
				masterVolume={masterVolume}
				playbackSpeed={playbackSpeed}
				zoomLevel={zoomLevel}
				selectedTrackIndex={selectedTrackIndex}
				tracks={tracks}
				masterAnalyser={liveAnalyser}
				onTogglePlayPause={togglePlayPause}
				onStop={stopPlayback}
				onToggleLoop={() => {
					const next = !isLooping;
					setIsLooping(next);
					sourceNodesRef.current.forEach((s) => {
						s.loop = next;
					});
				}}
				onStartRecording={handleStartRecording}
				onStopRecording={handleStopRecording}
				onSetSelectedTrackIndex={setSelectedTrackIndex}
				onAddMarker={addMarker}
				onSetMasterVolume={setMasterVolume}
				onSetPlaybackSpeed={setPlaybackSpeed}
				onSetZoomLevel={setZoomLevel}
				onImportAudio={handleImportAudio}
				onAddTrack={wrappedAddTrack}
			/>
		</div>
	);
}
