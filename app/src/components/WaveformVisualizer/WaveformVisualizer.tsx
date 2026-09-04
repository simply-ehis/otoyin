import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

interface WaveformVisualizerProps {
	analyser: AnalyserNode | null;
	playing: boolean;
	progress: number;
	height?: number;
	className?: string;
}

const BAR_COUNT = 64;
const BAR_GAP = 1;
const MIN_BAR_HEIGHT = 2;
const CANVAS_HEIGHT = 72;

export function WaveformVisualizer({
	analyser,
	playing,
	progress,
	height = CANVAS_HEIGHT,
	className,
}: WaveformVisualizerProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const animFrameRef = useRef<number>(0);
	const [cachedWaveform, setCachedWaveform] = useState<Uint8Array | null>(null);

	// Draw waveform from analyser data
	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}

		const ctx = canvas.getContext("2d");
		if (!ctx) {
			return;
		}

		const totalWidth = BAR_COUNT * (BAR_WIDTH + BAR_GAP) - BAR_GAP;
		canvas.width = totalWidth;
		canvas.height = height;

		ctx.clearRect(0, 0, totalWidth, height);

		if (analyser && playing) {
			const data = new Uint8Array(analyser.frequencyBinCount);
			analyser.getByteFrequencyData(data);

			// Downsample to BAR_COUNT bars
			const step = Math.max(1, data.length / BAR_COUNT);

			for (let i = 0; i < BAR_COUNT; i++) {
				const idx = Math.min(Math.floor(i * step), data.length - 1);
				const value = data[idx] / 255;
				const barHeight = Math.max(MIN_BAR_HEIGHT, value * height);
				const x = i * (BAR_WIDTH + BAR_GAP);
				const y = height - barHeight;

				// Gradient color based on frequency
				const hue = 270 + (i / BAR_COUNT) * 60; // Purple to cyan
				ctx.fillStyle = `hsl(${hue}, 80%, 55%)`;
				ctx.fillRect(x, y, BAR_WIDTH, barHeight);
			}
		} else if (cachedWaveform) {
			// Draw cached/static waveform
			const step = Math.max(1, cachedWaveform.length / BAR_COUNT);

			for (let i = 0; i < BAR_COUNT; i++) {
				const idx = Math.min(Math.floor(i * step), cachedWaveform.length - 1);
				const value = cachedWaveform[idx] / 255;
				const barHeight = Math.max(MIN_BAR_HEIGHT, value * height);
				const x = i * (BAR_WIDTH + BAR_GAP);
				const y = height - barHeight;

				ctx.fillStyle = `hsl(270, 60%, 50%)`;
				ctx.fillRect(x, y, BAR_WIDTH, barHeight);
			}
		} else {
			// Draw idle state - flat line
			for (let i = 0; i < BAR_COUNT; i++) {
				const x = i * (BAR_WIDTH + BAR_GAP);
				const barHeight = MIN_BAR_HEIGHT;
				const y = height - barHeight;
				ctx.fillStyle = "hsl(240, 10%, 35%)";
				ctx.fillRect(x, y, BAR_WIDTH, barHeight);
			}
		}

		// Draw progress indicator
		if (progress > 0 && progress < 1) {
			const progressX = progress * totalWidth;
			ctx.fillStyle = "hsl(330, 90%, 60%)";
			ctx.fillRect(progressX, 0, 1, height);
		}

		if (playing || cachedWaveform) {
			animFrameRef.current = requestAnimationFrame(draw);
		}
	}, [analyser, playing, progress, height, cachedWaveform]);

	useEffect(() => {
		draw();
		return () => cancelAnimationFrame(animFrameRef.current);
	}, [draw]);

	// When idle (not playing, no analyser), show flat idle bars — no fake placeholder
	useEffect(() => {
		if (!playing && !analyser) {
			setCachedWaveform(null);
		}
	}, [playing, analyser]);

	return (
		<canvas
			ref={canvasRef}
			className={cn("w-full rounded-md select-none", className)}
			style={{ height: `${height}px` }}
		/>
	);
}

// Constants used in the component
const BAR_WIDTH = 3;

export default WaveformVisualizer;
