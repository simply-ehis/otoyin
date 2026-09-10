import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { ERR_TITLE_VALIDATION } from "@/lib/errorMessages";
import { showStudioErrorToast } from "@/lib/errors";
import { Button } from "@/ui/button";
import { Label, Separator, Spinner } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";
import { UploadField } from "./UploadField";

type EnhanceMode = "auto" | "lavasr" | "denoise";

const MODE_HELP: Record<EnhanceMode, string> = {
	auto: "Upscale to 48 kHz then denoise — best overall quality",
	lavasr: "Neural bandwidth extension — upscales low-quality audio to 48 kHz",
	denoise: "DeepFilterNet speech denoising — removes background noise",
};

export function AudioEnhanceView() {
	const { toast } = useToast();
	const [audioPath, setAudioPath] = useState("");
	const [fileName, setFileName] = useState("");
	const [uploading, setUploading] = useState(false);
	const [mode, setMode] = useState<EnhanceMode>("auto");
	const [enhancedUrl, setEnhancedUrl] = useState<string | null>(null);

	useEffect(() => {
		return () => {
			if (enhancedUrl) {
				URL.revokeObjectURL(enhancedUrl);
			}
		};
	}, [enhancedUrl]);

	const enhanceMut = useMutation({
		mutationFn: () => apiClient.audioEnhance(audioPath, mode),
		onSuccess: (blob) => {
			if (enhancedUrl) {
				URL.revokeObjectURL(enhancedUrl);
			}
			setEnhancedUrl(URL.createObjectURL(blob));
			toast({ title: "Audio enhancement complete" });
		},
		onError: (err: unknown) => showStudioErrorToast(err),
	});

	async function handleFile(file: File) {
		setUploading(true);
		try {
			const { audio_path } = await apiClient.dspUpload(file, file.name);
			setAudioPath(audio_path);
			setFileName(file.name);
			setEnhancedUrl(null);
			toast({ title: `Uploaded: ${file.name}` });
		} catch (err) {
			toast({
				title: "Upload failed",
				description: err instanceof Error ? err.message : String(err),
				variant: "destructive",
			});
		} finally {
			setUploading(false);
		}
	}

	function handleProcess() {
		if (!audioPath) {
			toast({
				title: ERR_TITLE_VALIDATION,
				description: "Upload a recording to enhance first",
				variant: "destructive",
			});
			return;
		}
		enhanceMut.mutate();
	}

	return (
		<div className="flex h-full max-w-xl flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader
				title="Audio Enhancer"
			/>

			<Separator />

			<UploadField
				id="enh-upload"
				label="Select Audio"
				fileName={fileName}
				uploading={uploading}
				onFile={(f) => void handleFile(f)}
			/>

			<div className="space-y-1">
				<Label htmlFor="enh-mode">Enhancement mode</Label>
				<Select value={mode} onValueChange={(v) => setMode(v as EnhanceMode)}>
					<SelectTrigger id="enh-mode" className="h-8 max-w-xs text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="auto">Auto (Upscale + Denoise)</SelectItem>
						<SelectItem value="lavasr">Bandwidth Extension Only</SelectItem>
						<SelectItem value="denoise">Denoise Only</SelectItem>
					</SelectContent>
				</Select>
				<p className="text-xs text-muted-foreground">{MODE_HELP[mode]}</p>
			</div>

			<div>
				<Button
					type="button"
					size="sm"
					disabled={!audioPath || enhanceMut.isPending}
					title="Enhance the uploaded audio"
					aria-label="Enhance audio"
					onClick={handleProcess}
				>
					{enhanceMut.isPending ? <Spinner size="xs" className="mr-1" /> : null}
					{enhanceMut.isPending ? "Processing…" : "Enhance Audio"}
				</Button>
			</div>

			{enhancedUrl ? (
				<section className="space-y-2 rounded-md border border-border bg-card p-3">
					<h2 className="text-xs font-medium text-foreground">
						Enhanced audio
					</h2>
					{/* biome-ignore lint/a11y/useMediaCaption: processed speech preview, no dialogue to caption */}
					<audio
						src={enhancedUrl}
						controls
						className="h-8 w-full"
						aria-label="Enhanced audio playback"
					/>
				</section>
			) : null}
		</div>
	);
}
