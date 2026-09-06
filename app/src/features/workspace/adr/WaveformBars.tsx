import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { Spinner } from "@/ui/primitives";

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
			<div className={cn("flex h-8 items-center", className)}>
				<Spinner size="xs" />
			</div>
		);
	}
	return (
		<div className={cn("flex h-8 items-center gap-px", className)}>
			{bars.map((s, i) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: waveform index stable
					key={i}
					aria-hidden="true"
					className="w-[3px] rounded-full bg-accent"
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
