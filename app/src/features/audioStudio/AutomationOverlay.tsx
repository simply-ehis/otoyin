import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils/cn";
import type { StudioTrack } from "./AudioStudioStore";
export function AutomationOverlay({
	track,
	height = 20,
	className,
}: {
	track: StudioTrack;
	height?: number;
	className?: string;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const points = track.volumeAutomation;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || points.length === 0) {
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

		const sorted = [...points].sort((a, b) => a.time - b.time);
		const maxTime = sorted[sorted.length - 1]?.time || 1;

		ctx.beginPath();
		ctx.strokeStyle = "hsl(248, 90%, 66%)";
		ctx.lineWidth = 1.5;
		for (let i = 0; i < sorted.length; i++) {
			const x = (sorted[i].time / maxTime) * width;
			const y = height - sorted[i].value * height;
			if (i === 0) {
				ctx.moveTo(x, y);
			} else {
				ctx.lineTo(x, y);
			}
		}
		ctx.stroke();

		for (const pt of sorted) {
			const x = (pt.time / maxTime) * width;
			const y = height - pt.value * height;
			ctx.beginPath();
			ctx.arc(x, y, 3, 0, Math.PI * 2);
			ctx.fillStyle = "hsl(248, 90%, 66%)";
			ctx.fill();
			ctx.strokeStyle = "#fff";
			ctx.lineWidth = 1;
			ctx.stroke();
		}
	}, [points, height]);

	if (points.length === 0) {
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
