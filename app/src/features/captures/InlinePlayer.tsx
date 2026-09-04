import { PauseIcon, PlayIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { Button } from "@/ui/button";
import { Spinner } from "@/ui/primitives";
import { debug } from "@/lib/utils/debug";

function formatMs(ms?: number | null): string {
	if (!ms || ms < 0) {
		return "0:00";
	}
	const total = Math.round(ms / 1000);
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Inline capture player: WaveSurfer waveform (muted bars, rose
 * progress), play/pause, time readout, error state. One instance per
 * mounted detail pane, destroyed on unmount or source change.
 */
export function InlinePlayer({
	audioUrl,
	fallbackMs,
	className,
}: {
	audioUrl: string;
	fallbackMs?: number | null;
	className?: string;
}) {
	const waveRef = useRef<HTMLDivElement>(null);
	const wsRef = useRef<WaveSurfer | null>(null);
	const [playing, setPlaying] = useState(false);
	const [loading, setLoading] = useState(true);
	const [seconds, setSeconds] = useState(0);
	const [total, setTotal] = useState(0);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const container = waveRef.current;
		if (!container) {
			return;
		}
		const ws = WaveSurfer.create({
			container,
			waveColor: "hsl(30 6% 45%)",
			progressColor: "hsl(348 68% 58%)",
			cursorColor: "transparent",
			barWidth: 2,
			barRadius: 2,
			barGap: 2,
			height: 40,
			normalize: true,
			interact: true,
			mediaControls: false,
			backend: "WebAudio",
		});
		ws.on("ready", () => {
			setTotal(ws.getDuration());
			setLoading(false);
			setError(null);
		});
		ws.on("play", () => setPlaying(true));
		ws.on("pause", () => setPlaying(false));
		ws.on("finish", () => {
			setPlaying(false);
			setSeconds(ws.getDuration());
		});
		ws.on("timeupdate", (t) => setSeconds(t));
		ws.on("seeking", (t) => setSeconds(t));
		ws.on("error", (err) => {
			debug.error("Inline waveform error", err);
			setError(err instanceof Error ? err.message : String(err));
			setLoading(false);
		});
		wsRef.current = ws;
		return () => {
			try {
				ws.destroy();
			} catch (err: unknown) {
				debug.error("Failed to destroy inline waveform", err);
			}
			wsRef.current = null;
		};
	}, []);

	useEffect(() => {
		const ws = wsRef.current;
		if (!ws) {
			return;
		}
		setLoading(true);
		setError(null);
		setSeconds(0);
		setTotal(0);
		setPlaying(false);
		try {
			if (ws.isPlaying()) {
				ws.pause();
			}
			ws.seekTo(0);
		} catch (err: unknown) {
			debug.error("Failed to reset inline waveform", err);
		}
		ws.load(audioUrl).catch((err: unknown) => {
			debug.error("Inline waveform load failed", err);
			setError(err instanceof Error ? err.message : String(err));
			setLoading(false);
		});
	}, [audioUrl]);

	const shownMs =
		total > 0 ? Math.round((playing || seconds > 0 ? seconds : total) * 1000) : (fallbackMs ?? 0);

	return (
		<div className={className}>
			<div className="flex items-center gap-4">
				<Button
					size="icon"
					variant="outline"
					className="size-10 shrink-0"
					disabled={loading || !!error}
					onClick={() => {
						const ws = wsRef.current;
						if (!ws || loading) {
							return;
						}
						if (ws.isPlaying()) {
							ws.pause();
						} else {
							ws.play().catch((err: unknown) => {
								debug.error("Inline play failed", err);
								setError(err instanceof Error ? err.message : String(err));
							});
						}
					}}
					aria-label={playing ? "Pause" : "Play"}
				>
					{loading ? (
						<Spinner size="md" />
					) : playing ? (
						<PauseIcon className="size-4 fill-current" aria-hidden="true" />
					) : (
						<PlayIcon className="ml-0.5 size-4 fill-current" aria-hidden="true" />
					)}
				</Button>
				<div ref={waveRef} className="h-10 min-w-0 flex-1 select-none" />
				<span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
					{error ? "—" : formatMs(shownMs)}
				</span>
			</div>
			{error ? (
				<p role="alert" className="mt-2 text-xs text-destructive">
					{error}
				</p>
			) : null}
		</div>
	);
}
