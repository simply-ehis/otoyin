import {
	ArrowUpCircleIcon as Enhance,
	ArrowUpTrayIcon as Upload,
} from "@heroicons/react/24/outline";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Spinner } from "@/components/ui/Spinner";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import { ERR_TITLE_VALIDATION } from "@/lib/errorMessages";
import { showStudioErrorToast } from "@/lib/errors";

type EnhanceMode = "auto" | "lavasr" | "denoise";

export function AudioEnhanceView() {
	const { toast } = useToast();
	const [audioPath, setAudioPath] = useState<string>("");
	const [mode, setMode] = useState<EnhanceMode>("auto");
	const [enhancedUrl, setEnhancedUrl] = useState<string | null>(null);
	const audioRef = useRef<HTMLAudioElement>(null);

	useEffect(() => {
		return () => {
			if (enhancedUrl) {
				URL.revokeObjectURL(enhancedUrl);
			}
		};
	}, [enhancedUrl]);

	const enhanceMut = useMutation({
		mutationFn: () => apiClient.audioEnhance(audioPath, mode),
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
				description: "Select a recording to enhance",
				variant: "destructive",
			});
			return;
		}
		enhanceMut.mutate(undefined, {
			onSuccess: (blob) => {
				const url = URL.createObjectURL(blob);
				setEnhancedUrl(url);
				toast({ title: "Audio enhancement complete" });
			},
			onError: (err: unknown) => showStudioErrorToast(err),
		});
	}

	return (
		<div className="flex flex-col h-full p-4 gap-4">
			<ScreenHeader
				icon={<Enhance className="size-5" />}
				title="Audio Enhancer"
				description="Lavasr bandwidth extension + DeepFilterNet denoising"
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

			{/* Mode selector */}
			<div className="space-y-2">
				<Label className="text-xs">Enhancement Mode</Label>
				<Select value={mode} onValueChange={(v) => setMode(v as EnhanceMode)}>
					<SelectTrigger>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="auto">Auto (Upscale + Denoise)</SelectItem>
						<SelectItem value="lavasr">Bandwidth Extension Only</SelectItem>
						<SelectItem value="denoise">Denoise Only</SelectItem>
					</SelectContent>
				</Select>
				<p className="text-xs text-muted-foreground/40">
					{mode === "auto" &&
						"Upscale to 48 kHz then denoise — best overall quality"}
					{mode === "lavasr" &&
						"Neural bandwidth extension — upscales low-quality audio to 48 kHz"}
					{mode === "denoise" &&
						"DeepFilterNet speech denoising — removes background noise"}
				</p>
			</div>

			{/* Process button */}
			<Button
				size="sm"
				disabled={!audioPath || enhanceMut.isPending}
				onClick={handleProcess}
				className="self-start"
				title="Enhance selected audio"
				aria-label="Enhance audio"
			>
				{enhanceMut.isPending ? (
					<Spinner size="sm" className="mr-1.5" />
				) : (
					<Enhance className="h-3.5 w-3.5 mr-1.5" />
				)}
				{enhanceMut.isPending ? "Processing…" : "Enhance Audio"}
			</Button>

			{/* Preview */}
			{enhancedUrl && (
				<div className="rounded-lg border border-border bg-card p-3 space-y-2">
					<span className="text-xs font-medium text-foreground">
						Enhanced Audio
					</span>
					<audio
						ref={audioRef}
						src={enhancedUrl}
						controls
						className="w-full h-8"
						aria-label="Enhanced audio playback"
					>
						<track kind="captions" />
					</audio>
				</div>
			)}
		</div>
	);
}
