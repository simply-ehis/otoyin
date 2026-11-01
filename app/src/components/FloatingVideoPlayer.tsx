import {
	ArrowsPointingOutIcon as Expand,
	ArrowsPointingInIcon as Minimize,
	PauseIcon as Pause,
	PlayIcon as Play,
	SpeakerXMarkIcon as VolumeMute,
	SpeakerWaveIcon as VolumeUp,
	XMarkIcon as XMark,
} from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { useFloatingVideoStore } from "@/stores/floatingVideoStore";
import { Button } from "@/ui/button";

const SPEEDS = [0.5, 1, 1.5, 2];

export function FloatingVideoPlayer() {
	const {
		url,
		visible,
		minimized,
		position,
		size,
		volume,
		muted,
		playbackRate,
		currentTime,
		duration,
		setUrl,
		setPosition,
		setSize,
		setVolume,
		setMuted,
		setPlaybackRate,
		setTime,
		setDuration,
	} = useFloatingVideoStore();

	const videoRef = useRef<HTMLVideoElement | null>(null);
	const [playing, setPlaying] = useState(false);
	const [dragging, setDragging] = useState(false);
	const [seekDragging, setSeekDragging] = useState(false);
	const [pos, setPos] = useState(position);

	// Sync position from store on mount
	useEffect(() => {
		setPos(position);
	}, [position]);

	// Video lifecycle
	useEffect(() => {
		const el = videoRef.current;
		if (!el || !url) {
			return;
		}
		el.src = url;
		el.volume = volume;
		el.muted = muted;
		el.playbackRate = playbackRate;
		void el.play().catch(() => setPlaying(false));

		const onPlay = () => setPlaying(true);
		const onPause = () => setPlaying(false);
		const onTimeUpdate = () => {
			setTime(el.currentTime);
			setDuration(el.duration);
		};
		const onVolumeChange = () => {
			setVolume(el.volume);
			setMuted(el.muted);
		};
		const onRateChange = () => setPlaybackRate(el.playbackRate);
		const onEnded = () => setPlaying(false);

		el.addEventListener("play", onPlay);
		el.addEventListener("pause", onPause);
		el.addEventListener("timeupdate", onTimeUpdate);
		el.addEventListener("volumechange", onVolumeChange);
		el.addEventListener("ratechange", onRateChange);
		el.addEventListener("ended", onEnded);

		return () => {
			el.removeEventListener("play", onPlay);
			el.removeEventListener("pause", onPause);
			el.removeEventListener("timeupdate", onTimeUpdate);
			el.removeEventListener("volumechange", onVolumeChange);
			el.removeEventListener("ratechange", onRateChange);
			el.removeEventListener("ended", onEnded);
		};
	}, [
		url,
		volume,
		muted,
		playbackRate,
		setTime,
		setDuration,
		setMuted,
		setPlaybackRate,
		setVolume,
	]);

	// Persist position while dragging
	useEffect(() => {
		if (!dragging) {
			return;
		}
		setPosition(pos);
	}, [dragging, pos, setPosition]);

	const togglePlay = () => {
		const el = videoRef.current;
		if (!el) {
			return;
		}
		if (el.paused) {
			void el.play();
		} else {
			el.pause();
		}
	};

	const toggleMute = () => {
		const el = videoRef.current;
		if (!el) {
			return;
		}
		el.muted = !el.muted;
	};

	const setSpeed = (rate: number) => {
		const el = videoRef.current;
		if (!el) {
			return;
		}
		el.playbackRate = rate;
	};

	const formatTime = (seconds: number) => {
		if (Number.isNaN(seconds)) {
			return "--:--";
		}
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, "0")}`;
	};

	if (!visible || !url) {
		return null;
	}

	const isMinimized = minimized;
	const displayWidth = isMinimized ? 120 : size.width;
	const displayHeight = isMinimized ? 40 : size.height;

	return (
		<section
			aria-label="Floating video player"
			className={cn(
				"fixed z-50 overflow-hidden rounded-lg border border-border bg-black shadow-2xl transform transition-transform duration-200",
				isMinimized
					? "flex items-center gap-2 px-3 py-2 cursor-move"
					: "flex flex-col",
			)}
			style={{
				right: pos.x,
				bottom: pos.y,
				width: displayWidth,
				height: displayHeight,
			}}
			onMouseDown={(e) => {
				if (
					e.target instanceof HTMLVideoElement ||
					e.target instanceof HTMLInputElement
				) {
					return;
				}
				setDragging(true);
			}}
			onMouseMove={(e) => {
				if (!dragging) {
					return;
				}
				setPos((p) => ({
					x: Math.max(0, p.x + e.movementX),
					y: Math.max(0, p.y + e.movementY),
				}));
			}}
			onMouseUp={() => setDragging(false)}
			onMouseLeave={() => setDragging(false)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					togglePlay();
				}
			}}
		>
			{/* Header — title + controls */}
			<div className="flex items-center justify-between bg-card/80 px-2 py-1.5">
				{isMinimized ? (
					<span className="text-xs font-medium text-foreground">Video</span>
				) : (
					<span className="text-xs font-medium text-foreground">
						Floating video
					</span>
				)}
				<div className="flex items-center gap-1">
					{!isMinimized ? (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-6 w-6 p-0"
							aria-label="Minimize"
							onClick={() => {
								setSize({
									width: videoRef.current?.videoWidth ?? 320,
									height: videoRef.current?.videoHeight ?? 180,
								});
							}}
						>
							<Minimize className="size-3.5" aria-hidden="true" />
						</Button>
					) : (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-6 w-6 p-0"
							aria-label="Expand"
							onClick={() => {
								setSize({ width: 320, height: 180 });
							}}
						>
							<Expand className="size-3.5" aria-hidden="true" />
						</Button>
					)}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-6 w-6 p-0"
						aria-label={playing ? "Pause" : "Play"}
						onClick={togglePlay}
					>
						{playing ? (
							<Pause className="size-3.5" aria-hidden="true" />
						) : (
							<Play className="size-3.5" aria-hidden="true" />
						)}
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-6 w-6 p-0"
						aria-label={muted ? "Unmute" : "Mute"}
						onClick={toggleMute}
					>
						{muted || volume === 0 ? (
							<VolumeMute className="size-3.5" aria-hidden="true" />
						) : (
							<VolumeUp className="size-3.5" aria-hidden="true" />
						)}
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-6 w-6 p-0"
						aria-label="Close"
						onClick={() => {
							const el = videoRef.current;
							if (el) {
								el.pause();
								el.src = "";
							}
							setUrl(null);
						}}
					>
						<XMark className="size-3.5" aria-hidden="true" />
					</Button>
				</div>
			</div>

			{/* Controls row — not shown when minimized */}
			{!isMinimized && (
				<div className="bg-card/90 px-2 py-1.5 border-t border-border/50">
					{/* Playback speed */}
					<div className="flex items-center gap-1.5 text-xs text-foreground/80">
						<span>Speed:</span>
						<Button
							type="button"
							variant={playbackRate === 1 ? "default" : "outline"}
							size="sm"
							className="h-6 px-2"
							aria-label={`Speed ${playbackRate}x`}
							onClick={() => {
								const next =
									SPEEDS[(SPEEDS.indexOf(playbackRate) + 1) % SPEEDS.length];
								setSpeed(next);
							}}
						>
							{playbackRate}x
						</Button>
					</div>

					{/* Time + seek scrubber */}
					<div className="mt-1 flex items-center gap-2">
						<span className="text-[10px] text-muted-foreground">
							{formatTime(currentTime)}
						</span>
						<input
							type="range"
							min="0"
							max={duration > 0 ? duration : 100}
							value={currentTime}
							onChange={(e) => {
								if (seekDragging) {
									return;
								}
								const el = videoRef.current;
								if (!el) {
									return;
								}
								el.currentTime = Number(e.target.value);
								setTime(Number(e.target.value));
							}}
							onMouseDown={() => setSeekDragging(true)}
							onMouseUp={() => setSeekDragging(false)}
							className="w-24 h-1.5 bg-muted/50 rounded-full appearance-none cursor-pointer"
						/>
						<span className="text-[10px] text-muted-foreground">
							{formatTime(duration)}
						</span>
					</div>

					{/* Volume */}
					<div className="mt-1 flex items-center gap-2">
						<span className="text-[10px] text-muted-foreground">Volume:</span>
						<input
							type="range"
							min="0"
							max="1"
							step="0.1"
							value={muted ? 0 : volume}
							onChange={(e) => {
								const vol = Number(e.target.value);
								const el = videoRef.current;
								if (el) {
									el.muted = false;
									el.volume = vol;
								}
								setVolume(vol);
								setMuted(false);
							}}
							className="w-20 h-1.5 bg-muted/50 rounded-full appearance-none cursor-pointer"
						/>
					</div>
				</div>
			)}

			{/* Video element */}
			{!isMinimized && (
				<div className="flex-1 bg-black relative overflow-hidden">
					{/* biome-ignore lint/a11y/useMediaCaption: user-provided preview */}
					<video
						ref={videoRef}
						className="w-full h-full object-contain bg-black"
						crossOrigin="anonymous"
					/>
				</div>
			)}
		</section>
	);
}
