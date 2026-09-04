import {
	NoSymbolIcon as EarOff,
	ArrowUpTrayIcon as Upload,
	SpeakerWaveIcon as Volume2,
} from "@heroicons/react/24/outline";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Spinner } from "@/components/ui/Spinner";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import { ERR_TITLE_VALIDATION } from "@/lib/errorMessages";
import { showStudioErrorToast } from "@/lib/errors";

export function NoiseReductionView() {
	const { toast } = useToast();
	const [audioPath, setAudioPath] = useState<string>("");
	const [vadThreshold, setVadThreshold] = useState(0.5);
	const [cleanedUrl, setCleanedUrl] = useState<string | null>(null);
	const audioRef = useRef<HTMLAudioElement>(null);

	useEffect(() => {
		return () => {
			if (cleanedUrl) {
				URL.revokeObjectURL(cleanedUrl);
			}
		};
	}, [cleanedUrl]);

	const noiseMut = useMutation({
		mutationFn: () => apiClient.noiseReduce(audioPath, vadThreshold),
	});

	async function handleFileSelect() {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "audio/*";
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) {
				return;
			}
			const path = file.name;
			setAudioPath(path);
			toast({ title: `Selected: ${path}` });
		};
		input.click();
	}

	function handleProcess() {
		if (!audioPath) {
			toast({
				title: ERR_TITLE_VALIDATION,
				description: "Select a recording to clean up",
				variant: "destructive",
			});
			return;
		}
		noiseMut.mutate(undefined, {
			onSuccess: (blob) => {
				const url = URL.createObjectURL(blob);
				setCleanedUrl(url);
				toast({ title: "Noise reduction complete" });
			},
			onError: (error) => showStudioErrorToast(error),
		});
	}

	return (
		<div className="flex flex-col h-full p-4 gap-4">
			<ScreenHeader
				icon={<EarOff className="size-5" />}
				title="Noise Reduction"
				description="RNNoise-based adaptive noise suppression"
			/>

			<Separator />

			{/* File selection */}
			<div className="flex items-center gap-3">
				<Button
					variant="outline"
					size="sm"
					onClick={handleFileSelect}
					title="Select an audio file"
					aria-label="Select an audio file"
				>
					<Upload className="h-3.5 w-3.5 mr-1.5" />
					Select Audio
				</Button>
				{audioPath && (
					<Badge variant="secondary" className="text-xs">
						{audioPath}
					</Badge>
				)}
			</div>

			{/* Threshold slider */}
			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<Label className="text-xs">VAD Threshold</Label>
					<span className="text-xs font-mono tabular-nums text-muted-foreground">
						{vadThreshold.toFixed(2)}
					</span>
				</div>
				<Slider
					min={0}
					max={1}
					step={0.01}
					value={[vadThreshold]}
					onValueChange={([v]) => setVadThreshold(v)}
				/>
				<p className="text-xs text-muted-foreground/40">
					Lower values suppress more noise; higher values preserve more signal
				</p>
			</div>

			{/* Process button */}
			<Button
				size="sm"
				disabled={!audioPath || noiseMut.isPending}
				onClick={handleProcess}
				className="self-start"
				title="Reduce noise on selected audio"
				aria-label="Reduce noise"
			>
				{noiseMut.isPending ? (
					<Spinner size="sm" className="mr-1.5" />
				) : (
					<Volume2 className="h-3.5 w-3.5 mr-1.5" />
				)}
				{noiseMut.isPending ? "Processing…" : "Reduce Noise"}
			</Button>

			{/* Preview */}
			{cleanedUrl && (
				<div className="rounded-lg border border-border bg-card p-3 space-y-2">
					<span className="text-xs font-medium text-foreground">
						Cleaned Audio
					</span>
					<audio
						ref={audioRef}
						src={cleanedUrl}
						controls
						className="w-full h-8"
						aria-label="Cleaned audio playback"
					>
						<track kind="captions" />
					</audio>
				</div>
			)}
		</div>
	);
}
