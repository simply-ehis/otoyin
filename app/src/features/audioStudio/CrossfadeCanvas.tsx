import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils/cn";
import type { StudioTrack } from "./AudioStudioStore";
export function CrossfadeCanvas({
	track,
	height = 16,
	className,
}: {
	track: StudioTrack;
	height?: number;
	className?: string;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const crossfade = track.crossfade;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !crossfade) {
			return;
		}
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			return;
		}
		const dpr = window.devicePixelRatio || 1;
		const width = canvas.clientWidth;
		canvas.width = width * dpr;
		canvas.height = height * dpr;
		ctx.scale(dpr, dpr);
		ctx.clearRect(0, 0, width, height);

		const fadeX = Math.min(
			width,
			(crossfade.durationMs / 1000) * (width / Math.max(track.duration, 0.1)),
		);

		ctx.fillStyle = "hsla(190, 90%, 50%, 0.15)";
		ctx.fillRect(width - fadeX, 0, fadeX, height);

		ctx.beginPath();
		ctx.moveTo(width, 0);
		ctx.lineTo(width - fadeX, 0);
		ctx.lineTo(width, height);
		ctx.closePath();
		ctx.fillStyle = "hsla(190, 90%, 50%, 0.3)";
		ctx.fill();
	}, [crossfade, height, track.duration]);

	if (!crossfade) {
		return null;
	}

	return (
		<canvas
			ref={canvasRef}
			className={cn("w-full", className)}
			style={{ height }}
		/>
	);
}
