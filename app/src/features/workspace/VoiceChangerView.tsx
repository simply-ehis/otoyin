import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { useVoiceChangerStore } from "@/stores/voiceChangerStore";
import { Button } from "@/ui/button";
import { Badge, Label, Separator, Spinner } from "@/ui/primitives";
import { Slider } from "@/ui/slider";
import { EmptyState, ScreenHeader } from "@/ui/states";

export function VoiceChangerView() {
	const isActive = useVoiceChangerStore((s) => s.enabled);
	const setIsActive = useVoiceChangerStore((s) => s.setEnabled);
	const pitchShift = useVoiceChangerStore((s) => s.pitchShift);
	const setPitchShift = useVoiceChangerStore((s) => s.setPitchShift);
	const formantShift = useVoiceChangerStore((s) => s.formantShift);
	const setFormantShift = useVoiceChangerStore((s) => s.setFormantShift);
	const reverbMix = useVoiceChangerStore((s) => s.reverbMix);
	const setReverbMix = useVoiceChangerStore((s) => s.setReverbMix);

	const capsQuery = useQuery({
		queryKey: ["voice-changer-capabilities"],
		queryFn: () => apiClient.getVoiceChangerCapabilities(),
		staleTime: Infinity,
	});
	const caps = capsQuery.data;

	const latencyQuery = useQuery({
		queryKey: ["voice-changer-latency"],
		queryFn: () => apiClient.getVoiceChangerLatency(),
		enabled: isActive,
		refetchInterval: isActive ? 2000 : false,
	});
	const latencyMs = latencyQuery.data?.latency_ms;
	const latencyColor =
		latencyMs == null
			? "text-muted-foreground"
			: latencyMs < 80
				? "text-green-500"
				: latencyMs < 150
					? "text-yellow-500"
					: "text-red-500";

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader title="Voice Changer" />

			<div className="flex flex-wrap items-center gap-4">
				<Button
					type="button"
					variant={isActive ? "destructive" : "default"}
					size="sm"
					className="h-9"
					aria-pressed={isActive}
					title={isActive ? "Stop voice changer" : "Start voice changer"}
					aria-label={isActive ? "Stop voice changer" : "Start voice changer"}
					onClick={() => setIsActive(!isActive)}
				>
					<span
						aria-hidden="true"
						className={cn(
							"mr-1.5 inline-block size-2 rounded-full",
							isActive
								? "animate-pulse bg-destructive-foreground"
								: "bg-primary-foreground",
						)}
					/>
					{isActive ? "Stop" : "Start"}
				</Button>

				<div className="flex items-center gap-2">
					<span className="text-xs text-muted-foreground">Latency:</span>
					<Badge tone="neutral">
						{isActive && latencyMs != null ? (
							<span className={cn("font-mono tabular-nums", latencyColor)}>
								{latencyMs.toFixed(0)}ms
							</span>
						) : caps ? (
							`${caps.target_latency_ms}ms target`
						) : (
							"…"
						)}
					</Badge>
				</div>
			</div>

			<Separator />

			<div className="max-w-md space-y-2">
				<div className="flex items-center justify-between gap-2">
					<Label htmlFor="vc-pitch">Pitch shift</Label>
					<span className="font-mono text-xs tabular-nums text-muted-foreground">
						{pitchShift > 0 ? "+" : ""}
						{pitchShift} st
					</span>
				</div>
				<Slider
					id="vc-pitch"
					min={-12}
					max={12}
					step={0.5}
					value={[pitchShift]}
					onValueChange={([v]) => setPitchShift(v ?? 0)}
					aria-label="Pitch shift in semitones"
				/>
				<div className="flex justify-between text-xs text-muted-foreground">
					<span>-12 st</span>
					<span>+12 st</span>
				</div>
			</div>

			<div className="max-w-md space-y-2">
				<div className="flex items-center justify-between gap-2">
					<Label htmlFor="vc-formant">Formant shift</Label>
					<span className="font-mono text-xs tabular-nums text-muted-foreground">
						{formantShift > 0 ? "+" : ""}
						{formantShift} st
					</span>
				</div>
				<Slider
					id="vc-formant"
					min={-6}
					max={6}
					step={0.5}
					value={[formantShift]}
					onValueChange={([v]) => setFormantShift(v ?? 0)}
					aria-label="Formant shift in semitones"
				/>
				<div className="flex justify-between text-xs text-muted-foreground">
					<span>-6 st</span>
					<span>+6 st</span>
				</div>
			</div>

			{capsQuery.isLoading ? (
				<Spinner size="xs" />
			) : capsQuery.isError ? (
				<EmptyState
					title="Capabilities couldn't load"
					body="Pitch and formant controls still work; effect ranges may differ."
				/>
			) : caps?.reverb_mix ? (
				<div className="max-w-md space-y-2">
					<div className="flex items-center justify-between gap-2">
						<Label htmlFor="vc-reverb">Reverb mix</Label>
						<span className="font-mono text-xs tabular-nums text-muted-foreground">
							{(reverbMix * 100).toFixed(0)}%
						</span>
					</div>
					<Slider
						id="vc-reverb"
						min={0}
						max={1}
						step={0.01}
						value={[reverbMix]}
						onValueChange={([v]) => setReverbMix(v ?? 0)}
						aria-label="Reverb mix"
					/>
				</div>
			) : null}

			<output className="mt-auto flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
				<span
					aria-hidden="true"
					className={cn(
						"size-2 rounded-full",
						isActive ? "bg-accent" : "bg-strong",
					)}
				/>
				{isActive
					? "Processing — voice changer is active"
					: "Voice changer is idle"}
			</output>
		</div>
	);
}
