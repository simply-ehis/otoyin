import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";

export function WaveformBars({
	samples,
	className,
}: {
	samples: number[];
	className?: string;
}) {
	const bars = samples.length > 0 ? samples.slice(0, 100) : [];
	if (bars.length === 0) {
		return (
			<div className={cn("flex items-center gap-px h-8 opacity-30", className)}>
				{Array.from({ length: 24 }).map((_, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: static placeholder
						key={i}
						className="w-[3px] h-2 rounded-full bg-muted-foreground/40"
					/>
				))}
			</div>
		);
	}
	return (
		<div className={cn("flex items-center gap-px h-8", className)}>
			{bars.map((s, i) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: waveform index stable
					key={i}
					className="w-[3px] rounded-full bg-accent/60"
					style={{ height: `${Math.max(4, Math.min(32, s * 32))}px` }}
				/>
			))}
		</div>
	);
}

export function TakeWaveform({ takeId }: { takeId: string }) {
	const q = useQuery({
		queryKey: ["adr-take-waveform", takeId],
		queryFn: () => apiClient.getADRTakeWaveform(takeId),
		staleTime: 60_000,
	});
	const samples: number[] = q.data?.waveform ?? [];
	return <WaveformBars samples={samples} className="flex-1" />;
}
