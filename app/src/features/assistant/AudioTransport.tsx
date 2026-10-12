import {
	SpeakerXMarkIcon as Mute,
	PauseIcon as Pause,
	PlayIcon as Play,
	SpeakerWaveIcon as Volume,
} from "@heroicons/react/24/outline";
import { useCallback, useRef, useState } from "react";
import { debug } from "../../lib/utils/debug";

export function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Inline transport for one audio file: play/pause, seek, time readout and
 * volume. Shared by tool-result and streaming-preview bubbles, which used to
 * each carry a full copy of this state machine.
 */
export function AudioTransport({
	src,
	fileName,
	bytes,
}: {
	src: string;
	fileName?: string;
	bytes?: number;
}) {
	const [isPlaying, setIsPlaying] = useState(false);
	const [volume, setVolume] = useState(1);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const audioRef = useRef<HTMLAudioElement>(null);

	const togglePlay = useCallback(() => {
		const el = audioRef.current;
		if (!el) {
			return;
		}
		if (isPlaying) {
			el.pause();
		} else {
			el.play().catch((err) => {
				debug.warn("[assistant] audio.play failed:", err);
			});
		}
		setIsPlaying(!isPlaying);
	}, [isPlaying]);

	const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		const t = parseFloat(e.target.value);
		if (audioRef.current) {
			audioRef.current.currentTime = t;
		}
		setCurrentTime(t);
	}, []);

	const handleVolumeChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const v = parseFloat(e.target.value);
			setVolume(v);
			if (audioRef.current) {
				audioRef.current.volume = v;
			}
		},
		[],
	);

	const toggleMute = useCallback(() => {
		const next = volume > 0 ? 0 : 1;
		setVolume(next);
		if (audioRef.current) {
			audioRef.current.volume = next;
		}
	}, [volume]);

	return (
		<div className="flex flex-col gap-1.5 rounded-lg bg-secondary px-3 py-2">
			{(fileName || bytes !== undefined) && (
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span className="flex-1 truncate">{fileName}</span>
					{bytes !== undefined && <span>{formatBytes(bytes)}</span>}
				</div>
			)}
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={togglePlay}
					className="rounded p-1 hover:bg-accent/10"
					aria-label={isPlaying ? "Pause" : "Play"}
					title={isPlaying ? "Pause" : "Play"}
				>
					{isPlaying ? (
						<Pause className="size-4" />
					) : (
						<Play className="size-4" />
					)}
				</button>
				<input
					type="range"
					min="0"
					max={duration || 100}
					value={currentTime}
					onChange={handleSeek}
					className="h-1 flex-1 appearance-none rounded-full bg-secondary accent-accent"
					aria-label="Playback position"
				/>
				<span className="w-12 text-right text-xs text-muted-foreground">
					{currentTime.toFixed(1)}s / {duration.toFixed(1)}s
				</span>
				<button
					type="button"
					onClick={toggleMute}
					className="rounded p-1 hover:bg-accent/10"
					aria-label={volume > 0 ? "Mute" : "Unmute"}
					title={volume > 0 ? "Mute" : "Unmute"}
				>
					{volume > 0 ? (
						<Volume className="size-4" />
					) : (
						<Mute className="size-4" />
					)}
				</button>
				<input
					type="range"
					min="0"
					max="1"
					step="0.1"
					value={volume}
					onChange={handleVolumeChange}
					className="h-1 w-20 appearance-none rounded-full bg-secondary accent-accent"
					aria-label="Volume"
				/>
			</div>
			<audio
				ref={audioRef}
				src={src}
				onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
				onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
				onEnded={() => setIsPlaying(false)}
				preload="metadata"
			>
				<track kind="captions" />
			</audio>
		</div>
	);
}
