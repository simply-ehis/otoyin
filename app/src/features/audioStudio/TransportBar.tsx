import {
	PauseIcon as Pause,
	PlayIcon as Play,
	SpeakerWaveIcon as Volume2,
	SpeakerXMarkIcon as VolumeX,
	XMarkIcon as X,
} from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { Slider } from "@/ui/slider";
import { IconButton } from "@/ui/tooltip";

interface TransportBarProps {
	media: HTMLAudioElement | HTMLVideoElement | null;
	/** Called when the cancel (X) button is pressed. */
	onCancel?: () => void;
	/** Accessible label for the transport. */
	label?: string;
}

function fmt(t: number): string {
	if (!Number.isFinite(t) || t < 0) {
		return "0:00";
	}
	const m = Math.floor(t / 60);
	const s = Math.floor(t % 60);
	return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TransportBar({
	media,
	onCancel,
	label = "Transport",
}: TransportBarProps) {
	const [playing, setPlaying] = useState(false);
	const [current, setCurrent] = useState(0);
	const [duration, setDuration] = useState(0);
	const [volume, setVolumeState] = useState(1);
	const [muted, setMuted] = useState(false);
	const rafRef = useRef<number | null>(null);

	useEffect(() => {
		if (!media) {
			return;
		}
		const onPlay = () => setPlaying(true);
		const onPause = () => setPlaying(false);
		const onTime = () => setCurrent(media.currentTime);
		const onMeta = () => setDuration(media.duration || 0);
		const onVol = () => {
			setVolumeState(media.volume);
			setMuted(media.muted);
		};
		media.addEventListener("play", onPlay);
		media.addEventListener("pause", onPause);
		media.addEventListener("timeupdate", onTime);
		media.addEventListener("loadedmetadata", onMeta);
		media.addEventListener("volumechange", onVol);
		onMeta();
		onVol();
		return () => {
			media.removeEventListener("play", onPlay);
			media.removeEventListener("pause", onPause);
			media.removeEventListener("timeupdate", onTime);
			media.removeEventListener("loadedmetadata", onMeta);
			media.removeEventListener("volumechange", onVol);
		};
	}, [media]);

	useEffect(() => {
		if (rafRef.current !== null) {
			cancelAnimationFrame(rafRef.current);
		}
		if (playing) {
			const tick = () => {
				if (media) {
					setCurrent(media.currentTime);
				}
				rafRef.current = requestAnimationFrame(tick);
			};
			rafRef.current = requestAnimationFrame(tick);
		}
		return () => {
			if (rafRef.current !== null) {
				cancelAnimationFrame(rafRef.current);
			}
		};
	}, [playing, media]);

	const togglePlay = () => {
		if (!media) {
			return;
		}
		if (media.paused) {
			void media.play().catch((err) => {
				debug.warn("[audio-studio] media.play failed:", err);
			});
		} else {
			media.pause();
		}
	};

	const seek = (v: number[]) => {
		if (!media) {
			return;
		}
		media.currentTime = v[0];
		setCurrent(v[0]);
	};

	const changeVolume = (v: number[]) => {
		if (!media) {
			return;
		}
		media.volume = v[0];
		media.muted = v[0] === 0;
	};

	return (
		<div className="flex items-center gap-2 rounded-md border border-border p-2">
			<IconButton
				label={playing ? `Pause ${label}` : `Play ${label}`}
				onClick={togglePlay}
			>
				{playing ? <Pause /> : <Play />}
			</IconButton>
			{onCancel && (
				<IconButton label={`Stop ${label}`} onClick={onCancel}>
					<X />
				</IconButton>
			)}
			<span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
				{fmt(current)}
			</span>
			<Slider
				value={[current]}
				min={0}
				max={duration || 1}
				step={0.01}
				onValueChange={seek}
				aria-label={`${label} seek`}
				className="flex-1"
			/>
			<span className="w-10 text-xs tabular-nums text-muted-foreground">
				{fmt(duration)}
			</span>
			<IconButton
				label={muted ? `Unmute ${label}` : `Mute ${label}`}
				onClick={() => changeVolume([muted ? 1 : 0])}
			>
				{muted || volume === 0 ? <VolumeX /> : <Volume2 />}
			</IconButton>
			<Slider
				value={[muted ? 0 : volume]}
				min={0}
				max={1}
				step={0.01}
				onValueChange={changeVolume}
				aria-label={`${label} volume`}
				className="w-20"
			/>
		</div>
	);
}

import { debug } from "../../lib/utils/debug";
