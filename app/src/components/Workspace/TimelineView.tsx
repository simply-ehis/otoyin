import {
	SignalIcon as AudioLines,
	CircleStackIcon as Circle,
	PauseIcon as Pause,
	PlayIcon as Play,
	PlusIcon as Plus,
	ArrowUturnLeftIcon as Repeat,
	BackwardIcon as SkipBack,
	ForwardIcon as SkipForward,
	SpeakerWaveIcon as Speaker,
	StopIcon as Square,
	ArrowUpTrayIcon as Upload,
	SpeakerWaveIcon as Volume2,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import { ImportModal } from "@/components/Import/ImportModal";
import StudioVisualizer from "@/components/Studio/StudioVisualizer";
import { TapeScrubber } from "@/components/TapeScrubber/TapeScrubber";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useToast } from "@/components/ui/use-toast";
import { getClip } from "@/lib/clip";
import { useHistory } from "@/lib/hooks/useHistory";
import { formatAudioDuration } from "@/lib/utils/audio";
import { cn } from "@/lib/utils/cn";
import { usePlayerStore } from "@/stores/playerStore";

interface Track {
	id: string;
	name: string;
	muted: boolean;
	solo: boolean;
	volume: number;
	audioUrl?: string;
	duration?: number;
}

function generationToTrack(gen: {
	id: string;
	text: string;
	audio_path?: string;
	duration?: number;
}): Track {
	return {
		id: gen.id,
		name: gen.text.slice(0, 40) || "Untitled",
		muted: false,
		solo: false,
		volume: 0.75,
		audioUrl: gen.audio_path,
		duration: gen.duration,
	};
}

export function TimelineView() {
	const [isPlaying, setIsPlaying] = useState(false);
	const [isLooping, setIsLooping] = useState(false);
	const [isRecording, setIsRecording] = useState(false);
	const [currentTime, setCurrentTime] = useState("00:00.000");
	const [tracks, setTracks] = useState<Track[]>([]);
	const [importOpen, setImportOpen] = useState(false);
	const { toast } = useToast();

	const { data: history } = useHistory({ limit: 20 });

	const pasteClip = useCallback(async () => {
		let clip: { name: string; audioUrl: string; durationMs: number } | null =
			null;
		try {
			clip = await getClip();
		} catch {
			return;
		}
		if (!clip) {
			toast({ title: "Nothing on clipboard" });
			return;
		}
		const newTrack: Track = {
			id: `paste-${Date.now()}`,
			name: clip.name,
			muted: false,
			solo: false,
			volume: 0.75,
			audioUrl: clip.audioUrl,
			duration: clip.durationMs / 1000,
		};
		setTracks((prev) => [...prev, newTrack]);
		toast({ title: `Pasted "${clip.name}" as new track` });
	}, [toast]);

	// Convert history generations to tracks
	useEffect(() => {
		if (history?.items) {
			const newTracks = history.items.map(generationToTrack);
			setTracks(newTracks);
		}
	}, [history?.items]);

	const timeToSeconds = (t: string) => {
		const [m, s] = t.split(":");
		return parseFloat(m) * 60 + parseFloat(s);
	};

	const handlePlayPause = () => {
		if (tracks.length === 0) {
			return;
		}
		const firstTrack = tracks.find((t) => t.audioUrl);
		if (!firstTrack?.audioUrl) {
			return;
		}

		const { setAudioWithAutoPlay, setIsPlaying: setStorePlaying } =
			usePlayerStore.getState();
		setAudioWithAutoPlay(
			firstTrack.audioUrl,
			firstTrack.id,
			null,
			firstTrack.name,
		);
		setStorePlaying(!isPlaying);
		setIsPlaying(!isPlaying);
	};

	const handleTrackClick = (track: Track) => {
		if (!track.audioUrl) {
			return;
		}
		const { setAudioWithAutoPlay, setIsPlaying: setStorePlaying } =
			usePlayerStore.getState();
		setAudioWithAutoPlay(track.audioUrl, track.id, null, track.name);
		setStorePlaying(true);
		setIsPlaying(true);
	};

	const waveformBars = Array.from({ length: 120 }, (_, i) => {
		const h = 20 + Math.random() * 60;
		const isPeak = i > 100 && Math.random() > 0.95;
		return { h, isPeak, id: i };
	});
	const waveformEls = waveformBars.map(({ h, isPeak, id }) => (
		<div
			key={id}
			className="w-[3px] rounded-full transition-[height]"
			style={{
				height: `${h}%`,
				background: isPeak
					? "hsl(var(--accent))"
					: `hsl(var(--accent) / ${0.15 + (h / 100) * 0.4})`,
			}}
		/>
	));

	return (
		<div className="flex flex-col h-full p-4 gap-4">
			<ScreenHeader
				icon={<AudioLines className="size-5" />}
				title="Timeline"
				description="Arrange tracks and scrub your session"
			/>
			<StudioVisualizer className="w-full shrink-0" />
			{/* Empty state */}
			<EmptyState
				icon={<AudioLines className="size-6" />}
				title="No tracks yet"
				description="Generate audio or import to add tracks"
				action={
					<div className="flex gap-2">
						<Button
							size="sm"
							title="Add track"
							aria-label="Add track"
							onClick={() => {
								// Navigate to main editor to generate
								window.location.href = "/";
							}}
						>
							<Plus className="size-4 mr-1" /> Generate Audio
						</Button>
						<Button
							size="sm"
							variant="outline"
							title="Import audio"
							aria-label="Import audio"
							onClick={() => setImportOpen(true)}
						>
							<Upload className="size-4 mr-1" /> Import
						</Button>
						<Button
							size="sm"
							variant="outline"
							title="Paste from clipboard"
							aria-label="Paste from clipboard"
							onClick={pasteClip}
						>
							?? Paste
						</Button>
					</div>
				}
			/>

			{/* Waveform area */}
			<div className="h-40 rounded-lg border border-border bg-card p-3 flex items-end gap-1 overflow-hidden">
				{waveformEls}
			</div>

			{/* Tape scrubber */}
			<TapeScrubber
				duration={120}
				currentTime={timeToSeconds(currentTime)}
				isPlaying={isPlaying}
				onSeek={(t) => {
					const m = Math.floor(t / 60);
					const s = t - m * 60;
					setCurrentTime(
						`${String(m).padStart(2, "0")}:${s.toFixed(3).padStart(7, "0")}`,
					);
				}}
				onPlayPause={handlePlayPause}
			/>

			{/* Transport controls */}
			<div className="flex items-center gap-2 px-2 py-2 rounded-lg border border-border bg-card">
				<span className="text-xs font-mono tabular-nums text-foreground min-w-[80px]">
					{currentTime}
				</span>

				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="icon"
						className="size-8"
						title="Skip to start"
						aria-label="Skip to start"
						onClick={() => setCurrentTime("00:00.000")}
					>
						<SkipBack className="size-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-8"
						title={isPlaying ? "Pause" : "Play"}
						aria-label={isPlaying ? "Pause" : "Play"}
						onClick={handlePlayPause}
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
						title="Stop"
						aria-label="Stop"
						onClick={() => {
							setIsPlaying(false);
							setCurrentTime("00:00.000");
							usePlayerStore.getState().setIsPlaying(false);
						}}
					>
						<Square className="size-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-8"
						title="Skip to end"
						aria-label="Skip to end"
						onClick={() => {
							setIsPlaying(false);
							setCurrentTime("02:00.000");
						}}
					>
						<SkipForward className="size-4" />
					</Button>
				</div>

				<div className="w-px h-6 bg-border mx-1" />

				<Button
					variant={isRecording ? "destructive" : "ghost"}
					size="icon"
					className="size-8"
					title={isRecording ? "Stop recording" : "Record"}
					aria-label={isRecording ? "Stop recording" : "Record"}
					onClick={() => setIsRecording(!isRecording)}
				>
					<Circle className={cn("size-4", isRecording && "animate-pulse")} />
				</Button>
				<Button
					variant={isLooping ? "default" : "ghost"}
					size="icon"
					className="size-8"
					title="Toggle loop"
					aria-label="Toggle loop"
					onClick={() => setIsLooping(!isLooping)}
				>
					<Repeat className="size-4" />
				</Button>

				<div className="ml-auto flex items-center gap-2">
					<Volume2 className="size-4 text-muted-foreground" />
					<div className="w-20 h-1.5 rounded-full bg-secondary overflow-hidden">
						<div
							className="h-full bg-accent rounded-full"
							style={{ width: "75%" }}
						/>
					</div>
				</div>
			</div>

			{/* Import modal */}
			<ImportModal open={importOpen} onOpenChange={setImportOpen} />

			{/* Track list */}
			<div className="rounded-lg border border-border bg-card divide-y divide-border">
				{tracks.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-8 text-center">
						<AudioLines className="size-10 text-muted-foreground/40 mb-3" />
						<p className="text-sm text-muted-foreground">
							Generate or import audio to add tracks
						</p>
					</div>
				) : (
					tracks.map((track) => (
						<button
							key={track.id}
							type="button"
							className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30 transition-colors w-full text-left"
							onClick={() => handleTrackClick(track)}
							aria-label={`Play ${track.name}`}
						>
							<span className="text-xs font-medium text-foreground flex-1 truncate">
								{track.name}
							</span>
							{track.duration && (
								<span className="text-xs font-mono tabular-nums text-muted-foreground">
									{formatAudioDuration(track.duration)}
								</span>
							)}
							<button
								type="button"
								className={cn(
									"px-2 py-0.5 text-xs font-semibold rounded transition-colors",
									track.muted
										? "bg-destructive/20 text-destructive"
										: "bg-muted text-muted-foreground hover:bg-muted/80",
								)}
								title={track.muted ? "Unmute track" : "Mute track"}
								aria-label={track.muted ? "Unmute track" : "Mute track"}
								onClick={(e) => {
									e.stopPropagation();
									setTracks((prev) =>
										prev.map((t) =>
											t.id === track.id ? { ...t, muted: !t.muted } : t,
										),
									);
								}}
							>
								M
							</button>
							<button
								type="button"
								className={cn(
									"px-2 py-0.5 text-xs font-semibold rounded transition-colors",
									track.solo
										? "bg-accent/20 text-accent"
										: "bg-muted text-muted-foreground hover:bg-muted/80",
								)}
								title={track.solo ? "Unsolo track" : "Solo track"}
								aria-label={track.solo ? "Unsolo track" : "Solo track"}
								onClick={(e) => {
									e.stopPropagation();
									setTracks((prev) =>
										prev.map((t) =>
											t.id === track.id ? { ...t, solo: !t.solo } : t,
										),
									);
								}}
							>
								S
							</button>
							<Speaker className="h-3.5 w-3.5 text-muted-foreground" />
						</button>
					))
				)}
			</div>
		</div>
	);
}
