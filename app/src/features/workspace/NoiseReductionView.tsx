import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { ERR_TITLE_VALIDATION } from "@/lib/errorMessages";
import { showStudioErrorToast } from "@/lib/errors";
import { Button } from "@/ui/button";
import { Label, Separator, Spinner } from "@/ui/primitives";
import { Slider } from "@/ui/slider";
import { ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";
import { UploadField } from "./UploadField";

export function NoiseReductionView() {
	const { toast } = useToast();
	const [audioPath, setAudioPath] = useState("");
	const [fileName, setFileName] = useState("");
	const [uploading, setUploading] = useState(false);
	const [vadThreshold, setVadThreshold] = useState(0.5);
	const [cleanedUrl, setCleanedUrl] = useState<string | null>(null);

	useEffect(() => {
		return () => {
			if (cleanedUrl) {
				URL.revokeObjectURL(cleanedUrl);
			}
		};
	}, [cleanedUrl]);

	const noiseMut = useMutation({
		mutationFn: () => apiClient.noiseReduce(audioPath, vadThreshold),
		onSuccess: (blob) => {
			if (cleanedUrl) {
				URL.revokeObjectURL(cleanedUrl);
			}
			setCleanedUrl(URL.createObjectURL(blob));
			toast({ title: "Noise reduction complete" });
		},
		onError: (error: unknown) => showStudioErrorToast(error),
	});

	async function handleFile(file: File) {
		setUploading(true);
		try {
			const { audio_path } = await apiClient.dspUpload(file, file.name);
			setAudioPath(audio_path);
			setFileName(file.name);
			setCleanedUrl(null);
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
				description: "Upload a recording to clean up first",
				variant: "destructive",
			});
			return;
		}
		noiseMut.mutate();
	}

	return (
		<div className="flex h-full max-w-xl flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader
				title="Noise Reduction"
				description="RNNoise adaptive suppression — upload first, the server path is what gets processed"
			/>

			<Separator />

			<UploadField
				id="nr-upload"
				label="Select Audio"
				fileName={fileName}
				uploading={uploading}
				onFile={(f) => void handleFile(f)}
			/>

			<div className="space-y-2">
				<div className="flex items-center justify-between gap-2">
					<Label htmlFor="nr-vad">VAD threshold</Label>
					<span className="font-mono text-xs tabular-nums text-muted-foreground">
						{vadThreshold.toFixed(2)}
					</span>
				</div>
				<Slider
					id="nr-vad"
					min={0}
					max={1}
					step={0.01}
					value={[vadThreshold]}
					onValueChange={([v]) => setVadThreshold(v ?? 0.5)}
					aria-label="Voice activity threshold"
				/>
				<p className="text-xs text-muted-foreground">
					Lower values suppress more noise; higher values preserve more signal.
				</p>
			</div>

			<div>
				<Button
					type="button"
					size="sm"
					disabled={!audioPath || noiseMut.isPending}
					title="Reduce noise on the uploaded audio"
					aria-label="Reduce noise"
					onClick={handleProcess}
				>
					{noiseMut.isPending ? <Spinner size="xs" className="mr-1" /> : null}
					{noiseMut.isPending ? "Processing…" : "Reduce Noise"}
				</Button>
			</div>

			{cleanedUrl ? (
				<section className="space-y-2 rounded-md border border-border bg-card p-3">
					<h2 className="text-xs font-medium text-foreground">Cleaned audio</h2>
					{/* biome-ignore lint/a11y/useMediaCaption: processed speech preview, no dialogue to caption */}
					<audio
						src={cleanedUrl}
						controls
						className="h-8 w-full"
						aria-label="Cleaned audio playback"
					/>
				</section>
			) : null}
		</div>
	);
}
