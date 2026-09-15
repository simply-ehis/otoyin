import { useEffect, useRef } from "react";

function linearToDbfs(linear: number): number {
	if (linear <= 0) {
		return -Infinity;
	}
	return 20 * Math.log10(linear);
}

export function TrackMeter({ analyser }: { analyser: AnalyserNode | null }) {
	const barRef = useRef<HTMLDivElement>(null);
	const peakRef = useRef<HTMLDivElement>(null);
	const dbfsRef = useRef<HTMLSpanElement>(null);
	const rafRef = useRef<number | null>(null);
	const peakLevel = useRef(0);
	const peakDecay = useRef(0);
	const peakDbfs = useRef(-Infinity);

	useEffect(() => {
		if (!analyser) {
			return undefined;
		}
		const data = new Uint8Array(analyser.fftSize);

		const tick = () => {
			analyser.getByteTimeDomainData(data);
			let sum = 0;
			let peak = 0;
			for (let i = 0; i < data.length; i += 1) {
				const v = (data[i] - 128) / 128;
				const abs = Math.abs(v);
				if (abs > peak) {
					peak = abs;
				}
				sum += v * v;
			}
			const rms = Math.min(1, Math.sqrt(sum / data.length) * 2.5);
			const dbfs = linearToDbfs(rms);

			if (barRef.current) {
				barRef.current.style.height = `${rms * 100}%`;
			}

			// Peak hold with decay
			if (rms > peakLevel.current) {
				peakLevel.current = rms;
				peakDecay.current = 0;
				peakDbfs.current = linearToDbfs(peak);
			} else {
				peakDecay.current += 1;
				if (peakDecay.current > 30) {
					peakLevel.current = Math.max(0, peakLevel.current - 0.008);
				}
			}
			if (peakRef.current) {
				peakRef.current.style.height = `${peakLevel.current * 100}%`;
			}

			// Update dBFS text (throttled to ~10fps)
			if (peakDecay.current % 6 === 0 && dbfsRef.current) {
				const display = dbfs === -Infinity ? "-inf" : dbfs.toFixed(1);
				dbfsRef.current.textContent = `${display}`;
			}

			rafRef.current = requestAnimationFrame(tick);
		};

		rafRef.current = requestAnimationFrame(tick);
		return () => {
			if (rafRef.current) {
				cancelAnimationFrame(rafRef.current);
			}
			peakLevel.current = 0;
			peakDecay.current = 0;
			peakDbfs.current = -Infinity;
			if (barRef.current) {
				barRef.current.style.height = "0%";
			}
			if (peakRef.current) {
				peakRef.current.style.height = "0%";
			}
			if (dbfsRef.current) {
				dbfsRef.current.textContent = "-inf";
			}
		};
	}, [analyser]);

	return (
		<div className="flex flex-col items-center gap-0.5">
			<div
				className="w-2 h-full rounded-full bg-sunken overflow-hidden relative"
				role="img"
				aria-label="Track level"
			>
				<div
					ref={barRef}
					// No CSS transition here on purpose: this bar is written every
					// animation frame, and a transition would lag the meter behind.
					className="absolute bottom-0 w-full rounded-full"
					style={{
						height: "0%",
						background:
							"linear-gradient(to top, hsl(130 80% 45%), hsl(50 90% 55%), hsl(0 85% 55%))",
					}}
				/>
				<div
					ref={peakRef}
					className="absolute bottom-0 w-full rounded-full opacity-80"
					style={{
						height: "0%",
						background: "hsl(0 85% 65%)",
					}}
				/>
			</div>
			<span
				ref={dbfsRef}
				className="text-[8px] tabular-nums text-muted-foreground leading-none"
			>
				-inf
			</span>
		</div>
	);
}
