import { useMutation } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { ERR_TITLE_VALIDATION } from "@/lib/errorMessages";
import { showStudioErrorToast } from "@/lib/errors";
import { useSendTo } from "@/lib/hooks/useSendTo";
import { Button } from "@/ui/button";
import { Label, Separator, Spinner } from "@/ui/primitives";
import { Slider } from "@/ui/slider";
import { ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";
import { UploadField } from "./UploadField";

export function NoiseReductionView() {
	const { toast } = useToast();
	const sendTo = useSendTo();
	const [sendingToEffects, setSendingToEffects] = useState(false);
	const [sendingToTranscript, setSendingToTranscript] = useState(false);
	const [audioPath, setAudioPath] = useState("");
	const [fileName, setFileName] = useState("");
	const [uploading, setUploading] = useState(false);
	const [vadThreshold, setVadThreshold] = useState(0.5);
	const [cleanedUrl, setCleanedUrl] = useState<string | null>(null);

	// Deep-link: ?path=<storage_path> (e.g. from Generate) seeds the uploaded
	// file without user interaction.
	const handoff = useSearch({ from: "/noise-reduction" });
	useEffect(() => {
		const path = handoff.path;
		if (!path) {
			return;
		}
		setAudioPath(path);
		setFileName(path.split(/[\\/]/).pop() ?? path);
		setCleanedUrl(null);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [handoff.path]);

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

	const sendToEffects = async () => {
		if (!cleanedUrl) {
			toast({
				title: "Nothing to send",
				description: "Reduce noise on the audio before sending it to Effects.",
				variant: "destructive",
			});
			return;
		}
		setSendingToEffects(true);
		try {
			const resp = await fetch(cleanedUrl);
			if (!resp.ok) {
				throw new Error(`Could not read cleaned audio (${resp.status})`);
			}
			const blob = await resp.blob();
			const { audio_path } = await apiClient.dspUpload(
				blob,
				`${fileName || "cleaned"}-denoised.wav`,
			);
			sendTo("/effects", { path: audio_path });
		} catch (error) {
			showStudioErrorToast(error);
		} finally {
			setSendingToEffects(false);
		}
	};

	async function sendToTranscript() {
		if (!cleanedUrl) {
			toast({
				title: "Nothing to send",
				description:
					"Reduce noise on the audio before sending it to the Transcript editor.",
				variant: "destructive",
			});
			return;
		}
		setSendingToTranscript(true);
		try {
			const resp = await fetch(cleanedUrl);
			if (!resp.ok) {
				throw new Error(`Could not read cleaned audio (${resp.status})`);
			}
			const blob = await resp.blob();
			const file = new File([blob], `${fileName || "cleaned"}-denoised.wav`, {
				type: blob.type || "audio/wav",
			});
			const imported = await apiClient.importGeneration(file);
			sendTo("/transcript", { generation: imported.id });
		} catch (error) {
			showStudioErrorToast(error);
		} finally {
			setSendingToTranscript(false);
		}
	}

	return (
		<div className="flex h-full max-w-xl flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader title="Noise Reduction" />

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
					<div className="flex items-center justify-between gap-2">
						<h2 className="text-xs font-medium text-foreground">
							Cleaned audio
						</h2>
						<div className="flex items-center gap-1.5">
							<Button
								type="button"
								size="sm"
								variant="outline"
								className="h-7 px-2 text-xs"
								disabled={sendingToEffects}
								title="Send the cleaned audio to Effects"
								onClick={() => void sendToEffects()}
							>
								{sendingToEffects ? (
									<Spinner size="xs" className="mr-1" />
								) : null}
								Send to Effects
							</Button>
							<Button
								type="button"
								size="sm"
								variant="outline"
								className="h-7 px-2 text-xs"
								disabled={sendingToTranscript}
								title="Send the cleaned audio to Transcript Edit"
								onClick={() => void sendToTranscript()}
							>
								{sendingToTranscript ? (
									<Spinner size="xs" className="mr-1" />
								) : null}
								Send to Transcript
							</Button>
						</div>
					</div>
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
