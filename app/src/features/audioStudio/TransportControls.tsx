import { useEffect, useRef, useState } from "react";
import {
	CircleStackIcon as Circle,
	FlagIcon as Flag,
	CpuChipIcon as Gauge,
	MicrophoneIcon as Mic,
	PauseIcon as Pause,
	MusicalNoteIcon as Piano,
	PlayIcon as Play,
	PlusIcon as Plus,
	ArrowUturnLeftIcon as Repeat,
	BackwardIcon as SkipBack,
	StopIcon as Square,
	ArrowUpTrayIcon as Upload,
	SpeakerWaveIcon as Volume2,
	MagnifyingGlassPlusIcon as ZoomIn,
	MagnifyingGlassMinusIcon as ZoomOut,
} from "@heroicons/react/24/outline";
import { VoiceChatOverlay } from "@/components/VoiceChat/VoiceChatOverlay";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Slider } from "@/ui/slider";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/ui/select";
import { useAudioStudioStore } from "./AudioStudioStore";
import type { StudioTrack } from "./AudioStudioStore";
import { formatTime } from "./formatTime";
import { MonitorPicker } from "./MonitorPicker";
import { MonitorRecorder } from "./MonitorRecorder";

interface TransportControlsProps {
	isPlaying: boolean;
	isRecording: boolean;
	isLooping: boolean;
	masterVolume: number;
	playbackSpeed: number;
	zoomLevel: number;
	selectedTrackIndex: number;
	tracks: StudioTrack[];
	onTogglePlayPause: () => void;
	onStop: () => void;
	onToggleLoop: () => void;
	onStartRecording: () => void;
	onStopRecording: () => void;
	onSetSelectedTrackIndex: (i: number) => void;
	onAddMarker: (time: number) => void;
	onSetMasterVolume: (v: number) => void;
	onSetPlaybackSpeed: (v: number) => void;
	onSetZoomLevel: (v: number) => void;
	onImportAudio: () => void;
	onAddTrack: () => void;
	onAddMidiNote: (note: number) => void;
	onRecordComplete: (blob: Blob) => void;
}

export function TransportControls({
	isPlaying,
	isRecording,
	isLooping,
	masterVolume,
	playbackSpeed,
	zoomLevel,
	selectedTrackIndex,
	tracks,
	onTogglePlayPause,
	onStop,
	onToggleLoop,
	onStartRecording,
	onStopRecording,
	onSetSelectedTrackIndex,
	onAddMarker,
	onSetMasterVolume,
	onSetPlaybackSpeed,
	onSetZoomLevel,
	onImportAudio,
	onAddTrack,
	onAddMidiNote,
	onRecordComplete,
}: TransportControlsProps) {
	const currentTimeRef = useAudioStudioStore((s) => s.currentTimeRef);
	const [displayTime, setDisplayTime] = useState(0);
	const rafRef = useRef<number>(0);

	useEffect(() => {
		if (rafRef.current !== null) {
			cancelAnimationFrame(rafRef.current);
		}
		const tick = () => {
			setDisplayTime(currentTimeRef.current);
			rafRef.current = requestAnimationFrame(tick);
		};
		rafRef.current = requestAnimationFrame(tick);
		return () => {
			if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current);
			}
		};
	}, [currentTimeRef]);

	return (
		<div className="border-t border-border bg-card px-4 py-2 shrink-0">
			<div className="flex items-center gap-2 flex-wrap">
				<span className="text-sm font-mono tabular-nums text-foreground min-w-[90px]">
					{formatTime(displayTime)}
				</span>

				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon"
						className="size-8"
						onClick={() => {
							onStop();
						}}
						title="Skip to start"
						aria-label="Skip to start"
					>
						<SkipBack className="size-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-8"
						onClick={onTogglePlayPause}
						disabled={tracks.every((t) => !t.audioUrl)}
						title={isPlaying ? "Pause (Space)" : "Play (Space)"}
						aria-label={isPlaying ? "Pause" : "Play"}
					>
						{isPlaying ? (
							<Pause className="size-4" />
						) : (
							<Play className="size-4" />
						)}
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-8"
						onClick={onStop}
						title="Stop"
						aria-label="Stop"
					>
						<Square className="size-4" />
					</Button>
					<Button
						variant={isLooping ? "default" : "ghost"}
						size="icon"
						className="size-8"
						onClick={onToggleLoop}
						title="Toggle loop"
						aria-label="Toggle loop"
					>
						<Repeat className="size-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-8"
						onClick={() => onAddMarker(displayTime)}
						title="Add marker at playhead"
						aria-label="Add marker at playhead"
					>
						<Flag className="size-4" />
					</Button>
				</div>

				<div className="w-px h-6 bg-border mx-1" />

				<Button
					variant={isRecording ? "destructive" : "ghost"}
					size="icon"
					className="size-8"
					onClick={isRecording ? onStopRecording : onStartRecording}
					title={isRecording ? "Stop recording (R)" : "Record (R)"}
					aria-label={isRecording ? "Stop recording" : "Record"}
				>
					<Circle className={cn("size-4", isRecording && "animate-pulse")} />
				</Button>

				{!isRecording && tracks.length > 0 && (
					<div className="flex items-center gap-1">
						<span className="text-xs text-muted-foreground">to:</span>
						<Select
							value={tracks[selectedTrackIndex]?.id ?? ""}
							onValueChange={(val) => {
								const idx = tracks.findIndex((t) => t.id === val);
								if (idx >= 0) {
									onSetSelectedTrackIndex(idx);
								}
							}}
						>
							<SelectTrigger className="h-7 text-xs w-32" aria-label="Record destination track">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{tracks.map((track) => (
									<SelectItem key={track.id} value={track.id}>
										{track.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Button
							variant="outline"
							size="sm"
							className="h-7 text-xs"
							onClick={onStartRecording}
							title="Start recording on selected track"
							aria-label="Start recording"
						>
							<Mic className="size-3 mr-1" />
							Rec
						</Button>
					</div>
				)}

				<div className="w-px h-6 bg-border mx-1" />

				<Button
					variant="ghost"
					size="sm"
					className="h-7 text-xs"
					onClick={onAddTrack}
					title="Add track"
					aria-label="Add track"
				>
					<Plus className="size-3 mr-1" /> Track
				</Button>

				{tracks.length > 0 && (
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs"
						onClick={onImportAudio}
						title="Import audio to selected track"
						aria-label="Import audio"
					>
						<Upload className="size-3 mr-1" /> Import
					</Button>
				)}

				{tracks.length > 0 && (
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs"
						onClick={() => onAddMidiNote(60)}
						title="Add MIDI note (middle C)"
					>
						<Piano className="size-3 mr-1" /> MIDI
					</Button>
				)}

				<div className="flex items-center gap-2">
					<ZoomOut className="h-3.5 w-3.5 text-muted-foreground" />
					<Slider
						min={0.25}
						max={4}
						step={0.05}
						value={[zoomLevel]}
						onValueChange={([v]) => onSetZoomLevel(v)}
						className="w-16"
						aria-label="Waveform zoom"
					/>
					<ZoomIn className="h-3.5 w-3.5 text-muted-foreground" />
				</div>

				<div className="flex items-center gap-2">
					<Gauge className="h-3.5 w-3.5 text-muted-foreground" />
					<span className="text-xs font-mono tabular-nums text-muted-foreground min-w-[32px]">
						{playbackSpeed.toFixed(2)}x
					</span>
					<Slider
						min={0.25}
						max={3}
						step={0.05}
						value={[playbackSpeed]}
						onValueChange={([v]) => onSetPlaybackSpeed(v)}
						className="w-16"
						aria-label="Playback speed"
					/>
				</div>

				<div className="w-px h-6 bg-border mx-1" />

				<VoiceChatOverlay />

				<div className="flex items-center gap-2">
					<Volume2 className="size-4 text-muted-foreground" />
					<Slider
						min={0}
						max={1}
						step={0.01}
						value={[masterVolume]}
						onValueChange={([v]) => onSetMasterVolume(v)}
						className="w-20"
						aria-label="Master volume"
					/>
				</div>
			</div>

			<div className="w-[260px] shrink-0 border-l border-border pl-3">
				<MonitorPicker title="Live monitor" />
				<div className="mt-2">
					<MonitorRecorder onRecordComplete={onRecordComplete} />
				</div>
			</div>
		</div>
	);
}
