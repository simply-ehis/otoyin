import {
	CircleStackIcon as Circle,
	FlagIcon as Flag,
	PauseIcon as Pause,
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

interface TransportControlsProps {
	isPlaying: boolean;
	isRecording: boolean;
	isLooping: boolean;
	masterVolume: number;
	playbackSpeed: number;
	zoomLevel: number;
	selectedTrackIndex: number;
	tracks: StudioTrack[];
	masterAnalyser: AnalyserNode | null;
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
}

function MasterLufsMeter({ analyser }: { analyser: AnalyserNode | null }) {
	const [lufs, setLufs] = useState("-inf");
	const rafRef = useRef<number>(0);
	const dataRef = useRef<Float32Array<ArrayBuffer> | null>(null);

	useEffect(() => {
		if (!analyser) {
			setLufs("-inf");
			return undefined;
		}
		const tick = () => {
			if (!dataRef.current || dataRef.current.length !== analyser.fftSize) {
				dataRef.current = new Float32Array(analyser.fftSize);
			}
			analyser.getFloatTimeDomainData(dataRef.current);
			let sum = 0;
			for (let i = 0; i < dataRef.current.length; i++) {
				sum += dataRef.current[i] * dataRef.current[i];
			}
			const rms = Math.sqrt(sum / dataRef.current.length);
			const db = 20 * Math.log10(Math.max(rms, 0.0001));
			setLufs(db === -Infinity ? "-inf" : db.toFixed(1));
			rafRef.current = requestAnimationFrame(tick);
		};
		rafRef.current = requestAnimationFrame(tick);
		return () => {
			if (rafRef.current) {
				cancelAnimationFrame(rafRef.current);
			}
		};
	}, [analyser]);

	return (
		<span className="text-[10px] tabular-nums text-muted-foreground font-mono">
			{lufs} dB
		</span>
	);
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
	masterAnalyser,
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
		<div className="border-t border-border bg-card px-3 shrink-0">
			<div className="flex items-center gap-2 h-9">
				{/* Transport buttons */}
				<div className="flex items-center gap-0.5">
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						onClick={onStop}
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
				</div>

				{/* Time display */}
				<span className="text-xs font-mono tabular-nums text-foreground min-w-[72px] text-center">
					{formatTime(displayTime)}
				</span>

				<div className="w-px h-5 bg-border" />

				{/* Record */}
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
							className="h-6 text-xs w-24"
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
				)}

				<div className="w-px h-5 bg-border" />

				{/* Actions */}
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

				{/* Spacer */}
				<div className="flex-1" />

				{/* Zoom */}
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

				{/* Speed */}
				<div className="flex items-center gap-1">
					<span className="text-xs font-mono tabular-nums text-muted-foreground min-w-[28px]">
						{playbackSpeed.toFixed(1)}x
					</span>
					<Slider
						min={0.25}
						max={3}
						step={0.05}
						value={[playbackSpeed]}
						onValueChange={([v]) => onSetPlaybackSpeed(v)}
						className="w-12"
						aria-label="Playback speed"
					/>
				</div>

				<div className="w-px h-5 bg-border" />

				{/* Voice chat */}
				<VoiceChatOverlay />

				{/* Master volume */}
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
					<MasterLufsMeter analyser={masterAnalyser} />
				</div>
			</div>
		</div>
	);
}
