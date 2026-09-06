import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";
import { cn } from "@/lib/utils/cn";
import { Spinner } from "@/ui/primitives";

export function SpectrogramCanvas({
	audioUrl,
	height = 60,
	className,
}: {
	audioUrl: string | null;
	height?: number;
	className?: string;
}) {
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

		// The backend resolves server-side storage paths — a blob: URL can
		// never resolve there, so upload first and compute on the real path.
		void (async () => {
			try {
				let path = audioUrl;
				if (audioUrl.startsWith("blob:")) {
					const blob = await (await fetch(audioUrl)).blob();
					const up = await apiClient.dspUpload(blob, "spectrogram.wav");
					path = up.audio_path;
				}
				const data: { data: number[][] } = await apiClient.computeSpectrogram(
					path,
					1024,
					256,
				);
				if (!cancelled) {
					setSpectrogramData(data.data);
					setLoading(false);
				}
			} catch (err) {
				if (!cancelled) {
					setLoading(false);
					showStudioErrorToast(err);
				}
			}
		})();

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
					"flex items-center justify-center rounded bg-sunken",
					className,
				)}
				style={{ height }}
			>
				<Spinner size="xs" />
			</div>
		);
	}

	if (!spectrogramData) {
		return (
			<div
				className={cn(
					"flex items-center justify-center rounded bg-sunken text-xs text-muted-foreground",
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
			role="img"
			aria-label="Audio spectrogram, frequency over time"
			className={cn("w-full rounded", className)}
			style={{ height }}
		/>
	);
}
