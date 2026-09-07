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
import { useStudioMidi } from "./useStudioMidi";

export function AudioStudio() {
	const { toast } = useToast();
	const tracks = useAudioStudioStore((s) => s.tracks);
	const isPlaying = useAudioStudioStore((s) => s.isPlaying);
	const isRecording = useAudioStudioStore((s) => s.isRecording);
	const isLooping = useAudioStudioStore((s) => s.isLooping);
	const currentTime = useAudioStudioStore((s) => s.currentTime);
	const masterVolume = useAudioStudioStore((s) => s.masterVolume);
	const playbackSpeed = useAudioStudioStore((s) => s.playbackSpeed);
	const zoomLevel = useAudioStudioStore((s) => s.zoomLevel);
	const showAutomation = useAudioStudioStore((s) => s.showAutomation);
	const markers = useAudioStudioStore((s) => s.markers);
	const undoStack = useAudioStudioStore((s) => s.undoStack);
	const redoStack = useAudioStudioStore((s) => s.redoStack);

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
	const moveTrack = useAudioStudioStore((s) => s.moveTrack);
	const setTrackAudio = useAudioStudioStore((s) => s.setTrackAudio);
	const updateTrack = useAudioStudioStore((s) => s.updateTrack);
	const setRecordingTrackIndex = useAudioStudioStore(
		(s) => s.setRecordingTrackIndex,
	);
	const pushUndo = useAudioStudioStore((s) => s.pushUndo);
	const undo = useAudioStudioStore((s) => s.undo);
	const redo = useAudioStudioStore((s) => s.redo);

	const [selectedTrackIndex, setSelectedTrackIndex] = useState(0);
	const [exporting, setExporting] = useState(false);
	const [isolateStem, setIsolateStem] = useState<IsolationStem>("vocals");
	const [transcriptDrawerOpen, setTranscriptDrawerOpen] = useState(false);
	const [transcriptTrackIndex, setTranscriptTrackIndex] = useState<
		number | null
	>(null);
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

	const { handleExportWithPlugins, exportWithPlugins } = usePluginExport({
		tracks,
		masterVolume,
	});

	const { handleRecordingComplete, handleStartRecording, handleStopRecording } =
		useRecordingManager({
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
		demucsReady,
		addTrack,
		updateTrack,
		setTrackAudio,
		pushUndo,
		audioBuffersRef,
	});
	const handleAddMidiNote = useStudioMidi(
		tracks,
		selectedTrackIndex,
		updateTrack,
		pushUndo,
	);
	const { activeDragId, handleDragStart, handleDragEnd } = useStudioDrag(
		tracks,
		moveTrack,
		pushUndo,
	);

	const handleExport = useCallback(async () => {
		setExporting(true);
		await offlineExport(tracks, masterVolume);
		setExporting(false);
	}, [tracks, masterVolume, offlineExport]);

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
			className="flex flex-col h-full outline-none"
		>
			<StudioToolbar
				unsaved={session.unsaved}
				showAutomation={showAutomation}
				exporting={exporting}
				exportWithPlugins={exportWithPlugins}
				undoStackLength={undoStack.length}
				redoStackLength={redoStack.length}
				tracksHaveAudio={tracks.some((t) => !!t.audioUrl)}
				tracksHaveAnyContent={tracks.some(
					(t) => !!t.audioUrl || !!t.audioBlob || t.midiNotes.length > 0,
				)}
				canUndoAutosave={session.canUndoAutosave}
				isolating={isolating}
				isolateStem={isolateStem}
				selectedTrackHasAudio={
					!!tracks[selectedTrackIndex]?.audioUrl ||
					!!tracks[selectedTrackIndex]?.audioBlob
				}
				onNew={session.handleNewSession}
				onSave={() => session.setShowSaveDialog(true)}
				onPaste={pasteClip}
				onLoad={session.handleLoadSession}
				onUndo={undo}
				onRedo={redo}
				onUndoAutosave={session.onUndoAutosave}
				onToggleAutomation={() => setShowAutomation(!showAutomation)}
				onExport={handleExport}
				onExportWithPlugins={() => void handleExportWithPlugins()}
				onIsolateStemChange={setIsolateStem}
				onIsolate={() => void handleIsolate()}
				onProducePodcast={() => setPodcastProducerOpen(true)}
			/>
			<span className="text-xs text-muted-foreground/50 ml-2">
				{tracks.length} track{tracks.length !== 1 ? "s" : ""}
			</span>

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

			<PodcastProducer
				open={podcastProducerOpen}
				onOpenChange={setPodcastProducerOpen}
				profiles={podcastProfiles}
				engines={podcastEngines}
			/>

			<div className="flex-1 flex flex-col min-h-0">
				<TimelineRuler
					zoomLevel={zoomLevel}
					markers={markers}
					onSeek={seekTo}
					onRemoveMarker={removeMarker}
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
					/>
				</div>
			</div>

			<div className="shrink-0 border-t border-border bg-card px-4 py-2">
				<WaveformVisualizer
					analyser={analyserRef.current}
					playing={isPlaying}
					progress={
						durationRef.current
							? Math.min(1, currentTime / durationRef.current)
							: 0
					}
					height={72}
					className="w-full rounded-md"
				/>
			</div>

			<TransportControls
				isPlaying={isPlaying}
				isRecording={isRecording}
				isLooping={isLooping}
				currentTime={currentTime}
				masterVolume={masterVolume}
				playbackSpeed={playbackSpeed}
				zoomLevel={zoomLevel}
				selectedTrackIndex={selectedTrackIndex}
				tracks={tracks}
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
				onAddMidiNote={handleAddMidiNote}
				onRecordComplete={handleRecordingComplete}
			/>
		</div>
	);
}
