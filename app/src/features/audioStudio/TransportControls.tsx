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
import { useEffect, useRef, useState } from "react";
import { VoiceChatOverlay } from "@/components/VoiceChat/VoiceChatOverlay";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { Slider } from "@/ui/slider";
import type { StudioTrack } from "./AudioStudioStore";
import { useAudioStudioStore } from "./AudioStudioStore";
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
		<div className="border-t border-border bg-card px-3 py-1.5 shrink-0">
			<div className="flex items-center gap-1.5 flex-wrap">
				<span className="text-xs font-mono tabular-nums text-foreground min-w-[72px]">
					{formatTime(displayTime)}
				</span>

				<div className="flex items-center gap-0.5">
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						onClick={() => {
							onStop();
						}}
						title="Skip to start"
						aria-label="Skip to start"
					>
						<SkipBack className="size-3.5" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						onClick={onTogglePlayPause}
						disabled={tracks.every((t) => !t.audioUrl)}
						title={isPlaying ? "Pause (Space)" : "Play (Space)"}
						aria-label={isPlaying ? "Pause" : "Play"}
					>
						{isPlaying ? (
							<Pause className="size-3.5" />
						) : (
							<Play className="size-3.5" />
						)}
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						onClick={onStop}
						title="Stop"
						aria-label="Stop"
					>
						<Square className="size-3.5" />
					</Button>
					<Button
						variant={isLooping ? "default" : "ghost"}
						size="icon"
						className="size-7"
						onClick={onToggleLoop}
						title="Toggle loop"
						aria-label="Toggle loop"
					>
						<Repeat className="size-3.5" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						onClick={() => onAddMarker(displayTime)}
						title="Add marker at playhead"
						aria-label="Add marker at playhead"
					>
						<Flag className="size-3.5" />
					</Button>
				</div>

				<div className="w-px h-5 bg-border mx-0.5" />

				<Button
					variant={isRecording ? "destructive" : "ghost"}
					size="icon"
					className="size-7"
					onClick={isRecording ? onStopRecording : onStartRecording}
					title={isRecording ? "Stop recording (R)" : "Record (R)"}
					aria-label={isRecording ? "Stop recording" : "Record"}
				>
					<Circle className={cn("size-3.5", isRecording && "animate-pulse")} />
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
							<SelectTrigger
								className="h-6 text-xs w-28"
								aria-label="Record destination track"
							>
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
							className="h-6 text-xs"
							onClick={onStartRecording}
							title="Start recording on selected track"
							aria-label="Start recording"
						>
							<Mic className="size-3 mr-1" />
							Rec
						</Button>
					</div>
				)}

				<div className="w-px h-5 bg-border mx-0.5" />

				<Button
					variant="ghost"
					size="sm"
					className="h-6 text-xs"
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
						className="h-6 text-xs"
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
						className="h-6 text-xs"
						onClick={() => onAddMidiNote(60)}
						title="Add MIDI note (middle C)"
					>
						<Piano className="size-3 mr-1" /> MIDI
					</Button>
				)}

				<div className="flex items-center gap-1">
					<ZoomOut className="h-3 w-3 text-muted-foreground" />
					<Slider
						min={0.25}
						max={4}
						step={0.05}
						value={[zoomLevel]}
						onValueChange={([v]) => onSetZoomLevel(v)}
						className="w-14"
						aria-label="Waveform zoom"
					/>
					<ZoomIn className="h-3 w-3 text-muted-foreground" />
				</div>

				<div className="flex items-center gap-1">
					<Gauge className="h-3 w-3 text-muted-foreground" />
					<span className="text-xs font-mono tabular-nums text-muted-foreground min-w-[28px]">
						{playbackSpeed.toFixed(2)}x
					</span>
					<Slider
						min={0.25}
						max={3}
						step={0.05}
						value={[playbackSpeed]}
						onValueChange={([v]) => onSetPlaybackSpeed(v)}
						className="w-14"
						aria-label="Playback speed"
					/>
				</div>

				<div className="w-px h-5 bg-border mx-0.5" />

				<VoiceChatOverlay />

				<div className="flex items-center gap-1">
					<Volume2 className="size-3.5 text-muted-foreground" />
					<Slider
						min={0}
						max={1}
						step={0.01}
						value={[masterVolume]}
						onValueChange={([v]) => onSetMasterVolume(v)}
						className="w-16"
						aria-label="Master volume"
					/>
				</div>
			</div>

			<div className="w-[220px] shrink-0 border-l border-border pl-2">
				<MonitorPicker title="Live monitor" />
				<div className="mt-1">
					<MonitorRecorder onRecordComplete={onRecordComplete} />
				</div>
			</div>
		</div>
	);
}
