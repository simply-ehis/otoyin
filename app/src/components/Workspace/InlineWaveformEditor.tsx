import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";

interface Selection {
	startMs: number;
	endMs: number;
}

interface InlineWaveformEditorProps {
	audioPath: string;
	audioBuffer: AudioBuffer | null;
	onProcessed?: (outputPath: string) => void;
	className?: string;
}

export function InlineWaveformEditor({
	audioPath,
	audioBuffer,
	onProcessed,
	className,
}: InlineWaveformEditorProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [selection, setSelection] = useState<Selection | null>(null);
	const [dragging, setDragging] = useState<"start" | "end" | "body" | null>(
		null,
	);
	const [dragOffset, setDragOffset] = useState(0);
	const [processing, setProcessing] = useState(false);
	const [durationMs, setDurationMs] = useState(0);
	const [silenceMs, setSilenceMs] = useState(500);

	// Extract peaks from AudioBuffer
	const peaks = useRef<Float32Array>(new Float32Array(0));

	useEffect(() => {
		if (!audioBuffer) {
			return;
		}
		const raw = audioBuffer.getChannelData(0);
		const numPeaks = 800;
		const blockSize = Math.floor(raw.length / numPeaks);
		const result = new Float32Array(numPeaks);
		for (let i = 0; i < numPeaks; i++) {
			let max = 0;
			for (let j = 0; j < blockSize; j++) {
				const abs = Math.abs(raw[i * blockSize + j] || 0);
				if (abs > max) {
					max = abs;
				}
			}
			result[i] = max;
		}
		peaks.current = result;
		setDurationMs(Math.round((audioBuffer.duration || 0) * 1000));
		setSelection(null);
	}, [audioBuffer]);

	// Draw waveform
	useEffect(() => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx || peaks.current.length === 0) {
			return;
		}

		const dpr = window.devicePixelRatio || 1;
		const rect = canvas.getBoundingClientRect();
		canvas.width = rect.width * dpr;
		canvas.height = rect.height * dpr;
		ctx.scale(dpr, dpr);

		const w = rect.width;
		const h = rect.height;
		const mid = h / 2;

		// Background
		ctx.fillStyle = "#1a1a2e";
		ctx.fillRect(0, 0, w, h);

		// Center line
		ctx.strokeStyle = "#333355";
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(0, mid);
		ctx.lineTo(w, mid);
		ctx.stroke();

		// Selection highlight
		if (selection && durationMs > 0) {
			const x1 = (selection.startMs / durationMs) * w;
			const x2 = (selection.endMs / durationMs) * w;
			ctx.fillStyle = "rgba(99, 102, 241, 0.2)";
			ctx.fillRect(x1, 0, x2 - x1, h);

			// Selection edges
			ctx.strokeStyle = "#6366f1";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(x1, 0);
			ctx.lineTo(x1, h);
			ctx.moveTo(x2, 0);
			ctx.lineTo(x2, h);
			ctx.stroke();
		}

		// Waveform bars
		const barWidth = w / peaks.current.length;
		const barGap = Math.max(0.5, barWidth * 0.2);

		for (let i = 0; i < peaks.current.length; i++) {
			const x = i * barWidth;
			const peakH = peaks.current[i] * mid * 0.9;
			const isInSelection =
				selection && durationMs > 0
					? (i / peaks.current.length) * durationMs >= selection.startMs &&
						(i / peaks.current.length) * durationMs <= selection.endMs
					: false;

			ctx.fillStyle = isInSelection ? "#818cf8" : "#4ade80";
			ctx.fillRect(x + barGap / 2, mid - peakH, barWidth - barGap, peakH * 2);
		}
	}, [selection, durationMs]);

	// Convert pixel X to milliseconds
	const xToMs = useCallback(
		(clientX: number): number => {
			const canvas = canvasRef.current;
			if (!canvas || durationMs === 0) {
				return 0;
			}
			const rect = canvas.getBoundingClientRect();
			const x = clientX - rect.left;
			return Math.max(0, Math.min(durationMs, (x / rect.width) * durationMs));
		},
		[durationMs],
	);

	// Mouse handlers
	const handleMouseDown = useCallback(
		(e: React.MouseEvent) => {
			const ms = xToMs(e.clientX);
			if (!selection) {
				setSelection({ startMs: ms, endMs: ms });
				setDragging("end");
			} else {
				const x1 =
					(selection.startMs / durationMs) *
					(canvasRef.current?.getBoundingClientRect().width || 0);
				const x2 =
					(selection.endMs / durationMs) *
					(canvasRef.current?.getBoundingClientRect().width || 0);
				const canvasX =
					e.clientX - (canvasRef.current?.getBoundingClientRect().left || 0);

				if (Math.abs(canvasX - x1) < 8) {
					setDragging("start");
				} else if (Math.abs(canvasX - x2) < 8) {
					setDragging("end");
				} else if (canvasX > x1 && canvasX < x2) {
					setDragging("body");
					setDragOffset(ms - selection.startMs);
				} else {
					setSelection({ startMs: ms, endMs: ms });
					setDragging("end");
				}
			}
		},
		[selection, durationMs, xToMs],
	);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent) => {
			if (!dragging || !selection) {
				return;
			}
			const ms = xToMs(e.clientX);

			if (dragging === "start") {
				setSelection({
					...selection,
					startMs: Math.min(ms, selection.endMs - 10),
				});
			} else if (dragging === "end") {
				setSelection({
					...selection,
					endMs: Math.max(ms, selection.startMs + 10),
				});
			} else if (dragging === "body") {
				const selLen = selection.endMs - selection.startMs;
				const newStart = Math.max(
					0,
					Math.min(ms - dragOffset, durationMs - selLen),
				);
				setSelection({ startMs: newStart, endMs: newStart + selLen });
			}
		},
		[dragging, selection, dragOffset, durationMs, xToMs],
	);

	const handleMouseUp = useCallback(() => {
		setDragging(null);
	}, []);

	// Editing actions
	const withProcessing = useCallback(async (fn: () => Promise<void>) => {
		setProcessing(true);
		try {
			await fn();
		} finally {
			setProcessing(false);
		}
	}, []);

	// Keyboard shortcuts (skip when typing in inputs)
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			const tag = (e.target as HTMLElement).tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
				return;
			}
			if (!selection || processing) {
				return;
			}
			if (e.key === "Delete" || e.key === "Backspace") {
				e.preventDefault();
				withProcessing(async () => {
					const result = await apiClient.deleteRegion(
						audioPath,
						selection.startMs,
						selection.endMs,
					);
					onProcessed?.(result.output_path);
					setSelection(null);
				});
			} else if (e.key === "t" || e.key === "T") {
				e.preventDefault();
				withProcessing(async () => {
					const result = await apiClient.splice(
						audioPath,
						selection.startMs,
						selection.endMs,
					);
					onProcessed?.(result.output_path);
					setSelection(null);
				});
			} else if (e.key === "Escape") {
				setSelection(null);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [selection, processing, audioPath, onProcessed, withProcessing]);

	const handleSplice = () =>
		withProcessing(async () => {
			if (!selection) {
				return;
			}
			const result = await apiClient.splice(
				audioPath,
				selection.startMs,
				selection.endMs,
			);
			onProcessed?.(result.output_path);
			setSelection(null);
		});

	const handleDelete = () =>
		withProcessing(async () => {
			if (!selection) {
				return;
			}
			const result = await apiClient.deleteRegion(
				audioPath,
				selection.startMs,
				selection.endMs,
			);
			onProcessed?.(result.output_path);
			setSelection(null);
		});

	const handleFadeIn = () =>
		withProcessing(async () => {
			if (selection) {
				const dur = selection.endMs - selection.startMs;
				const result = await apiClient.fadeIn(
					audioPath,
					dur,
					selection.startMs,
				);
				onProcessed?.(result.output_path);
			} else {
				const result = await apiClient.fadeIn(audioPath, 100);
				onProcessed?.(result.output_path);
			}
		});

	const handleFadeOut = () =>
		withProcessing(async () => {
			if (selection) {
				const dur = selection.endMs - selection.startMs;
				const result = await apiClient.fadeOut(audioPath, dur, selection.endMs);
				onProcessed?.(result.output_path);
			} else {
				const result = await apiClient.fadeOut(audioPath, 100);
				onProcessed?.(result.output_path);
			}
		});

	const handleInsertSilence = () =>
		withProcessing(async () => {
			const pos = selection?.startMs ?? 0;
			const result = await apiClient.insertSilence(audioPath, pos, silenceMs);
			onProcessed?.(result.output_path);
		});

	const formatMs = (ms: number) => {
		const s = ms / 1000;
		const min = Math.floor(s / 60);
		const sec = (s % 60).toFixed(1);
		return `${min}:${sec.padStart(4, "0")}`;
	};

	return (
		<div className={cn("space-y-2", className)}>
			{/* Toolbar */}
			<div className="flex items-center gap-1 flex-wrap">
				<Button
					size="sm"
					variant="outline"
					onClick={handleSplice}
					disabled={!selection || processing}
					title="Trim to selection (T)"
				>
					Trim
				</Button>
				<Button
					size="sm"
					variant="outline"
					onClick={handleDelete}
					disabled={!selection || processing}
					title="Delete selection (Del)"
				>
					Delete
				</Button>
				<Button
					size="sm"
					variant="outline"
					onClick={handleFadeIn}
					disabled={processing}
					title={selection ? "Fade in selection" : "Fade in from start"}
				>
					Fade In
				</Button>
				<Button
					size="sm"
					variant="outline"
					onClick={handleFadeOut}
					disabled={processing}
					title={selection ? "Fade out selection" : "Fade out to end"}
				>
					Fade Out
				</Button>
				<div className="flex items-center gap-1 ml-1">
					<Button
						size="sm"
						variant="outline"
						onClick={handleInsertSilence}
						disabled={processing}
						title={`Insert ${silenceMs}ms silence`}
					>
						+ Silence
					</Button>
					<Input
						type="number"
						min={50}
						max={5000}
						step={50}
						value={silenceMs}
						onChange={(e) => setSilenceMs(Number(e.target.value) || 500)}
						className="w-16 h-7 text-xs px-1"
						title="Silence duration (ms)"
					/>
					<span className="text-xs text-muted-foreground">ms</span>
				</div>
				{selection && (
					<span className="text-xs text-muted-foreground ml-2">
						{formatMs(selection.startMs)} — {formatMs(selection.endMs)} (
						{formatMs(selection.endMs - selection.startMs)})
					</span>
				)}
			</div>

			{/* Waveform canvas */}
			<div
				ref={containerRef}
				className="relative rounded-md overflow-hidden border border-border cursor-crosshair"
			>
				<canvas
					ref={canvasRef}
					className="w-full h-24"
					onMouseDown={handleMouseDown}
					onMouseMove={handleMouseMove}
					onMouseUp={handleMouseUp}
					onMouseLeave={handleMouseUp}
				/>
			</div>

			{/* Hint */}
			<p className="text-xs text-muted-foreground">
				Click & drag to select. T = trim, Del = delete, Esc = clear selection
			</p>
		</div>
	);
}
