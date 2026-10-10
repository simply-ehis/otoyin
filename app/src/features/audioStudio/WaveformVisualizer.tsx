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
	const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
	// Read progress via ref so the rAF loop doesn't re-subscribe at 60fps.
	const progressRef = useRef(progress);
	progressRef.current = progress;
	const [cachedWaveform, setCachedWaveform] = useState<Uint8Array | null>(null);

	// Precomputed bar colors (avoid per-frame `hsl()` string allocs).
	const liveColors = useRef<string[]>(
		Array.from({ length: BAR_COUNT }, (_, i) => {
			const hue = 270 + (i / BAR_COUNT) * 60;
			return `hsl(${hue}, 80%, 55%)`;
		}),
	);

	// Size the canvas only when dimensions change — resetting width/height
	// every frame forces layout + context-state reset at 60fps.
	const ensureSize = useCallback(
		(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
			const totalWidth = BAR_COUNT * (BAR_WIDTH + BAR_GAP) - BAR_GAP;
			if (canvas.width !== totalWidth || canvas.height !== height) {
				canvas.width = totalWidth;
				canvas.height = height;
			} else {
				ctx.clearRect(0, 0, totalWidth, height);
			}
			return totalWidth;
		},
		[height],
	);

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

		const totalWidth = ensureSize(canvas, ctx);
		const progressValue = progressRef.current;

		if (analyser && playing) {
			if (
				!freqDataRef.current ||
				freqDataRef.current.length !== analyser.frequencyBinCount
			) {
				freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
			}
			const data = freqDataRef.current;
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
				ctx.fillStyle = liveColors.current[i];
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
		if (progressValue > 0 && progressValue < 1) {
			const progressX = progressValue * totalWidth;
			ctx.fillStyle = "hsl(330, 90%, 60%)";
			ctx.fillRect(progressX, 0, 1, height);
		}

		if (playing || cachedWaveform) {
			animFrameRef.current = requestAnimationFrame(draw);
		}
	}, [analyser, playing, height, cachedWaveform, ensureSize]);

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
