import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";
import { cn } from "@/lib/utils/cn";

interface SpectrogramCanvasProps {
	audioUrl: string | null;
	height?: number;
	className?: string;
}

export function SpectrogramCanvas({
	audioUrl,
	height = 60,
	className,
}: SpectrogramCanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [loading, setLoading] = useState(false);
	const [spectrogramData, setSpectrogramData] = useState<number[][] | null>(
		null,
	);

	useEffect(() => {
		if (!audioUrl) {
			setSpectrogramData(null);
			return;
		}

		let cancelled = false;
		setLoading(true);

		apiClient
			.computeSpectrogram(audioUrl, 1024, 256)
			.then((data: { data: number[][] }) => {
				if (!cancelled) {
					setSpectrogramData(data.data);
					setLoading(false);
				}
			})
			.catch((err) => {
				if (!cancelled) {
					setLoading(false);
					showStudioErrorToast(err);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [audioUrl]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !spectrogramData) {
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

		const numFreqBins = spectrogramData.length;
		const numFrames = spectrogramData[0]?.length || 1;
		const barWidth = width / numFrames;
		const barHeight = height / numFreqBins;

		for (let t = 0; t < numFrames; t++) {
			for (let f = 0; f < numFreqBins; f++) {
				const val = spectrogramData[f]?.[t] ?? 0;
				const hue = 240 - Math.min(1, val) * 240;
				ctx.fillStyle = `hsl(${hue}, 80%, ${15 + val * 55}%)`;
				ctx.fillRect(
					t * barWidth,
					height - (f + 1) * barHeight,
					Math.ceil(barWidth),
					Math.ceil(barHeight),
				);
			}
		}
	}, [spectrogramData, height]);

	if (!audioUrl) {
		return null;
	}

	if (loading) {
		return (
			<div
				className={cn(
					"flex items-center justify-center bg-sunken rounded",
					className,
				)}
				style={{ height }}
			>
				<Spinner size="sm" />
			</div>
		);
	}

	if (!spectrogramData) {
		return (
			<div
				className={cn(
					"flex items-center justify-center text-xs text-muted-foreground/30 bg-sunken rounded",
					className,
				)}
				style={{ height }}
			>
				Spectrogram unavailable
			</div>
		);
	}

	return (
		<canvas
			ref={canvasRef}
			className={cn("w-full rounded", className)}
			style={{ height }}
		/>
	);
}
