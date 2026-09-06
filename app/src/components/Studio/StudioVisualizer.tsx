import { memo, useEffect, useRef, useState } from "react";
import { WaveformVisualizer } from "@/components/WaveformVisualizer";
import { useAudioStudioStore } from "@/features/audioStudio/AudioStudioStore";
import { cn } from "@/lib/utils/cn";
import { usePlayerStore } from "@/stores/playerStore";

function MasterMeter({ analyser }: { analyser: AnalyserNode | null }) {
	const leftRef = useRef<HTMLDivElement>(null);
	const rightRef = useRef<HTMLDivElement>(null);
	const rafRef = useRef<number | null>(null);

	useEffect(() => {
		if (!analyser) {
			return undefined;
		}
		const data = new Uint8Array(analyser.fftSize);
		const tick = () => {
			analyser.getByteTimeDomainData(data);
			const half = data.length / 2;
			let lSum = 0;
			let rSum = 0;
			for (let i = 0; i < half; i += 1) {
				const l = (data[i] - 128) / 128;
				lSum += l * l;
				const r = (data[half + i] - 128) / 128;
				rSum += r * r;
			}
			const l = Math.min(1, Math.sqrt(lSum / half) * 2.2);
			const r = Math.min(1, Math.sqrt(rSum / half) * 2.2);
			if (leftRef.current) {
				leftRef.current.style.height = `${l * 100}%`;
			}
			if (rightRef.current) {
				rightRef.current.style.height = `${r * 100}%`;
			}
			rafRef.current = requestAnimationFrame(tick);
		};
		rafRef.current = requestAnimationFrame(tick);
		return () => {
			if (rafRef.current) {
				cancelAnimationFrame(rafRef.current);
			}
			if (leftRef.current) {
				leftRef.current.style.height = "0%";
			}
			if (rightRef.current) {
				rightRef.current.style.height = "0%";
			}
		};
	}, [analyser]);

	const Bar = ({ refEl }: { refEl: React.Ref<HTMLDivElement> }) => (
		<div className="w-1.5 h-12 rounded-full bg-secondary overflow-hidden relative">
			<div
				ref={refEl}
				className="absolute bottom-0 w-full rounded-full transition-[height] duration-75"
				style={{
					height: "0%",
					background:
						"linear-gradient(to top, hsl(330 90% 60%), hsl(270 90% 65%), hsl(85 90% 60%))",
				}}
			/>
		</div>
	);

	return (
		<div className="flex items-end gap-1" aria-hidden>
			<Bar refEl={leftRef} />
			<Bar refEl={rightRef} />
		</div>
	);
}

function StudioVisualizerInner({ className }: { className?: string }) {
	const analyser = usePlayerStore((s) => s.masterAnalyser);
	const title = usePlayerStore((s) => s.title);
	const globalPlaying = usePlayerStore((s) => s.isPlaying);
	const globalDuration = usePlayerStore((s) => s.duration);

	const studioPlaying = useAudioStudioStore((s) => s.isPlaying);
	const studioTime = useAudioStudioStore((s) => s.currentTime);
	const studioDuration = useAudioStudioStore((s) =>
		s.tracks.reduce((max, t) => Math.max(max, t.duration), 0),
	);

	const playing = !!analyser;

	// Compute progress via rAF at ~15fps (every 4th frame) to avoid
	// 60fps React re-renders. We read currentTime directly from the
	// store instead of subscribing to it.
	const [progress, setProgress] = useState(0);
	const frameCountRef = useRef(0);
	const rafRef = useRef<number | null>(null);

	useEffect(() => {
		const tick = () => {
			frameCountRef.current += 1;
			// Update every 4th frame (~15fps at 60Hz) — smooth enough for a progress bar
			if (frameCountRef.current % 4 === 0) {
				let p = 0;
				if (studioPlaying) {
					p = studioDuration ? Math.min(1, studioTime / studioDuration) : 0;
				} else {
					const gt = usePlayerStore.getState().currentTime;
					p = globalDuration ? Math.min(1, gt / globalDuration) : 0;
				}
				setProgress(p);
			}
			rafRef.current = requestAnimationFrame(tick);
		};
		rafRef.current = requestAnimationFrame(tick);
		return () => {
			if (rafRef.current) {
				cancelAnimationFrame(rafRef.current);
			}
		};
	}, [studioPlaying, studioTime, studioDuration, globalDuration]);

	return (
		<div
			className={cn(
				"flex items-center gap-3 px-3 py-2 rounded-lg border border-border/60 bg-gradient-to-b from-black/40 to-black/10",
				className,
			)}
		>
			<MasterMeter analyser={analyser} />
			<div className="flex-1 min-w-0">
				<WaveformVisualizer
					analyser={analyser}
					playing={playing}
					progress={progress}
					height={56}
					className="w-full rounded-md"
				/>
			</div>
			<div className="flex flex-col items-end shrink-0 w-28">
				<span className="text-xs uppercase tracking-wider text-muted-foreground/60">
					{studioPlaying || globalPlaying ? "Playing" : "Idle"}
				</span>
				<span className="text-xs font-medium text-foreground truncate max-w-full">
					{title || "No track loaded"}
				</span>
			</div>
		</div>
	);
}

// Memoize: StudioVisualizer subscribes to currentTime (60fps).
// React.memo prevents re-render when parent re-renders but playerStore state unchanged.
const StudioVisualizer = memo(StudioVisualizerInner);
export default StudioVisualizer;
