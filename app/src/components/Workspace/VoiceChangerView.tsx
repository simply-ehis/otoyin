import {
	ExclamationTriangleIcon as AlertTriangle,
	CircleStackIcon as Circle,
	CpuChipIcon as Gauge,
	MicrophoneIcon as Mic,
} from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { Label } from "@/components/ui/label";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { useVoiceChangerStore } from "@/stores/voiceChangerStore";

interface VoiceChangerCapabilities {
	target_latency_ms: number;
	supported_effects: string[];
	max_chain_length: number;
	sample_rate: number;
	frame_size_ms: number;
	reverb_mix?: number;
}

export function VoiceChangerView() {
	const isActive = useVoiceChangerStore((s) => s.enabled);
	const setIsActive = useVoiceChangerStore((s) => s.setEnabled);
	const pitchShift = useVoiceChangerStore((s) => s.pitchShift);
	const setPitchShift = useVoiceChangerStore((s) => s.setPitchShift);
	const formantShift = useVoiceChangerStore((s) => s.formantShift);
	const setFormantShift = useVoiceChangerStore((s) => s.setFormantShift);
	const reverbMix = useVoiceChangerStore((s) => s.reverbMix);
	const setReverbMix = useVoiceChangerStore((s) => s.setReverbMix);
	const latency = 45;

	const {
		data: caps,
		isLoading,
		isError,
		error,
	} = useQuery<VoiceChangerCapabilities>({
		queryKey: ["voice-changer-capabilities"],
		queryFn: () => apiClient.getVoiceChangerCapabilities(),
		staleTime: Infinity,
	});

	return (
		<div className="flex flex-col h-full p-4 gap-6">
			<ScreenHeader
				icon={<Mic className="size-5" />}
				title="Voice Changer"
				description="Real-time pitch & formant voice transformation"
			/>
			{/* Start / Stop + latency */}
			<div className="flex items-center gap-4">
				<Button
					variant={isActive ? "destructive" : "default"}
					size="sm"
					className="h-9"
					title={isActive ? "Stop voice changer" : "Start voice changer"}
					aria-label={isActive ? "Stop voice changer" : "Start voice changer"}
					onClick={() => setIsActive(!isActive)}
				>
					<Circle
						className={cn("size-4 mr-1.5", isActive && "animate-pulse")}
					/>
					{isActive ? "Stop" : "Start"}
				</Button>

				<div className="flex items-center gap-2">
					<Gauge className="size-4 text-muted-foreground" />
					<span className="text-xs text-muted-foreground">Latency:</span>
					<Badge variant="secondary" className="text-xs font-mono">
						{latency}ms
					</Badge>
				</div>
			</div>

			<Separator />

			{/* Pitch shift */}
			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<Label className="text-xs text-foreground">Pitch Shift</Label>
					<span className="text-xs font-mono tabular-nums text-muted-foreground">
						{pitchShift > 0 ? "+" : ""}
						{pitchShift} st
					</span>
				</div>
				<Slider
					min={-12}
					max={12}
					step={0.5}
					value={[pitchShift]}
					onValueChange={([v]) => setPitchShift(v)}
				/>
				<div className="flex justify-between text-xs text-muted-foreground/60">
					<span>-12 st</span>
					<span>+12 st</span>
				</div>
			</div>

			{/* Formant shift */}
			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<Label className="text-xs text-foreground">Formant Shift</Label>
					<span className="text-xs font-mono tabular-nums text-muted-foreground">
						{formantShift > 0 ? "+" : ""}
						{formantShift} st
					</span>
				</div>
				<Slider
					min={-6}
					max={6}
					step={0.5}
					value={[formantShift]}
					onValueChange={([v]) => setFormantShift(v)}
				/>
				<div className="flex justify-between text-xs text-muted-foreground/60">
					<span>-6 st</span>
					<span>+6 st</span>
				</div>
			</div>

			{/* Reverb mix (capabilities-driven) */}
			{isLoading ? (
				<LoadingState label="Loading capabilities…" />
			) : isError ? (
				<EmptyState
					variant="error"
					icon={<AlertTriangle className="size-6" />}
					title="Failed to load capabilities"
					description={
						error instanceof Error ? error.message : "Please try again."
					}
				/>
			) : caps?.reverb_mix ? (
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<Label className="text-xs text-foreground">Reverb Mix</Label>
						<span className="text-xs font-mono tabular-nums text-muted-foreground">
							{(reverbMix * 100).toFixed(0)}%
						</span>
					</div>
					<Slider
						min={0}
						max={1}
						step={0.01}
						value={[reverbMix]}
						onValueChange={([v]) => setReverbMix(v)}
					/>
				</div>
			) : null}

			{/* Status indicator */}
			<div className="mt-auto flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card">
				<div
					className={cn(
						"size-2 rounded-full",
						isActive
							? "bg-green-500 shadow-[0_0_6px_hsl(var(--accent))]"
							: "bg-muted-foreground/30",
					)}
				/>
				<span className="text-xs text-muted-foreground">
					{isActive
						? "Processing — voice changer is active"
						: "Voice changer is idle"}
				</span>
			</div>
		</div>
	);
}
