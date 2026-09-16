import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils/cn";
export function WaveformCanvas({
	peaks,
	color,
	height = 60,
	className,
	channels = 1,
}: {
	peaks: Float32Array | null;
	color: string;
	height?: number;
	className?: string;
	channels?: number;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !peaks) {
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

		if (channels <= 2) {
			const barWidth = Math.max(1, width / peaks.length - 1);
			const halfHeight = height / 2;
			ctx.fillStyle = color;
			for (let i = 0; i < peaks.length; i++) {
				const barH = Math.max(1, peaks[i] * halfHeight);
				const x = i * (barWidth + 1);
				ctx.fillRect(x, halfHeight - barH, barWidth, barH * 2);
			}
		} else {
			const channelHeight = height / channels;
			ctx.fillStyle = color;
			ctx.globalAlpha = 0.7;
			for (let ch = 0; ch < channels; ch++) {
				const yOffset = ch * channelHeight;
				for (let i = 0; i < peaks.length; i++) {
					const barH = Math.max(1, peaks[i] * (channelHeight * 0.8));
					const x = i * (width / peaks.length);
					ctx.fillRect(
						x,
						yOffset + (channelHeight - barH) / 2,
						Math.max(1, width / peaks.length - 1),
						barH,
					);
				}
			}
			ctx.globalAlpha = 1;
		}
	}, [peaks, color, height, channels]);

	if (!peaks) {
		// Empty lane: render layout space only. The empty-track call to
		// action ("Import audio or record") is drawn once by the parent
		// overlay — rendering text here too doubles it up.
		return (
			<div
				className={cn("w-full", className)}
				style={{ height }}
				aria-hidden="true"
			/>
		);
	}

	return (
		<canvas
			ref={canvasRef}
			className={cn("w-full", className)}
			style={{ height }}
		/>
	);
}
