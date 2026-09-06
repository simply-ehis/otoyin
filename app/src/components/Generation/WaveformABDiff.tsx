import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";

interface WaveformABDiffProps {
	/** Base64-encoded WAV of the original audio */
	originalB64: string;
	/** Base64-encoded WAV of the enhanced audio */
	enhancedB64: string;
	/** Height of the waveform in pixels */
	height?: number;
	className?: string;
}

/**
 * Decodes two base64 WAVs into peaks and renders them overlaid on a
 * single canvas. The original waveform appears as a muted background;
 * the enhanced waveform sits on top in a brighter color. Regions where
 * they differ are highlighted with a translucent accent band so the
 * user can visually spot what the voice-clean chain changed.
 */
export function WaveformABDiff({
	originalB64,
	enhancedB64,
	height = 56,
	className,
}: WaveformABDiffProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [_ready, setReady] = useState(false);
	const peaksRef = useRef<{
		original: Float32Array;
		enhanced: Float32Array;
		diff: Float32Array;
	} | null>(null);

	// -- Decode + compute peaks ------------------------------------------
	useEffect(() => {
		let cancelled = false;

		const decode = async (b64: string): Promise<Float32Array> => {
			const binary = atob(b64);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) {
				bytes[i] = binary.charCodeAt(i);
			}
			const ctx = new AudioContext();
			const buf = await ctx.decodeAudioData(bytes.buffer);
			const raw = buf.getChannelData(0);
			ctx.close();
			return raw;
		};

		const computePeaks = (raw: Float32Array, buckets: number): Float32Array => {
			const peaks = new Float32Array(buckets);
			const step = Math.max(1, Math.floor(raw.length / buckets));
			for (let i = 0; i < buckets; i++) {
				let max = 0;
				const start = i * step;
				const end = Math.min(start + step, raw.length);
				for (let j = start; j < end; j++) {
					const v = Math.abs(raw[j]);
					if (v > max) {
						max = v;
					}
				}
				peaks[i] = max;
			}
			return peaks;
		};

		const run = async () => {
			try {
				const [origRaw, enhRaw] = await Promise.all([
					decode(originalB64),
					decode(enhancedB64),
				]);
				if (cancelled) {
					return;
				}

				// Use a consistent bucket count based on a reasonable display density
				const buckets = 200;
				const origPeaks = computePeaks(origRaw, buckets);
				const enhPeaks = computePeaks(enhRaw, buckets);

				// Pad shorter array with zeros so they align
				const len = Math.max(origPeaks.length, enhPeaks.length);
				const pad = (p: Float32Array) => {
					if (p.length === len) {
						return p;
					}
					const out = new Float32Array(len);
					out.set(p);
					return out;
				};
				const oP = pad(origPeaks);
				const eP = pad(enhPeaks);

				// Diff = |original - enhanced| per bucket
				const diff = new Float32Array(len);
				for (let i = 0; i < len; i++) {
					diff[i] = Math.abs(oP[i] - eP[i]);
				}

				peaksRef.current = { original: oP, enhanced: eP, diff };
				setReady(true);
			} catch {
				// decoding failed — leave peaks null, canvas shows nothing
			}
		};

		run();
		return () => {
			cancelled = true;
		};
	}, [originalB64, enhancedB64]);

	// -- Draw ------------------------------------------------------------
	useEffect(() => {
		const canvas = canvasRef.current;
		const peaks = peaksRef.current;
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

		const { original, enhanced, diff } = peaks;
		const len = Math.max(original.length, enhanced.length, diff.length);
		const barW = Math.max(1, width / len - 0.5);
		const halfH = height / 2;

		// Resolve CSS custom properties to actual colors
		const styles = getComputedStyle(canvas);
		const mutedFg =
			styles.getPropertyValue("--muted-foreground") || "215 15% 55%";
		const accent = styles.getPropertyValue("--accent") || "262 83% 58%";

		// 1. Draw diff highlights (translucent accent)
		const diffMax = Math.max(...diff, 0.001);
		for (let i = 0; i < len; i++) {
			const norm = diff[i] / diffMax;
			if (norm < 0.05) {
				continue; // skip tiny diffs
			}
			const barH = Math.max(2, norm * height * 0.9);
			const x = i * (barW + 0.5);
			ctx.fillStyle = `hsla(${accent}, ${Math.min(norm * 0.6, 0.35)})`;
			ctx.fillRect(x, halfH - barH / 2, barW, barH);
		}

		// 2. Draw original waveform (muted, behind)
		ctx.fillStyle = `hsla(${mutedFg}, 0.45)`;
		for (let i = 0; i < original.length; i++) {
			const barH = Math.max(1, original[i] * halfH * 0.85);
			const x = i * (barW + 0.5);
			ctx.fillRect(x, halfH - barH, barW, barH * 2);
		}

		// 3. Draw enhanced waveform (bright, on top)
		ctx.fillStyle = `hsla(${accent}, 0.85)`;
		for (let i = 0; i < enhanced.length; i++) {
			const barH = Math.max(1, enhanced[i] * halfH * 0.85);
			const x = i * (barW + 0.5);
			ctx.fillRect(x, halfH - barH, barW, barH * 2);
		}

		// 4. Center line
		ctx.strokeStyle = `hsla(${mutedFg}, 0.2)`;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(0, halfH);
		ctx.lineTo(width, halfH);
		ctx.stroke();
	}, [height]);

	return (
		<div className={cn("relative", className)}>
			<canvas
				ref={canvasRef}
				className="w-full rounded bg-sunken"
				style={{ height }}
			/>
			{/* Legend */}
			<div className="absolute bottom-1 right-2 flex items-center gap-3 text-xs text-muted-foreground/70 pointer-events-none select-none">
				<span className="flex items-center gap-1">
					<span className="inline-block size-1.5 rounded-full bg-strong" />
					Original
				</span>
				<span className="flex items-center gap-1">
					<span className="inline-block size-1.5 rounded-full bg-accent" />
					Enhanced
				</span>
				<span className="flex items-center gap-1">
					<span className="inline-block size-1.5 rounded-full bg-accent-muted" />
					Diff
				</span>
			</div>
		</div>
	);
}
