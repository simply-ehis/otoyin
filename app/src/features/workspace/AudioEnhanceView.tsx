import { useMutation } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { ERR_TITLE_VALIDATION } from "@/lib/errorMessages";
import { showStudioErrorToast } from "@/lib/errors";
import { useSendTo } from "@/lib/hooks/useSendTo";
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
	const sendTo = useSendTo();
	const [sendingToEffects, setSendingToEffects] = useState(false);
	const [sendingToTranscript, setSendingToTranscript] = useState(false);
	const [audioPath, setAudioPath] = useState("");
	const [fileName, setFileName] = useState("");
	const [uploading, setUploading] = useState(false);
	const [mode, setMode] = useState<EnhanceMode>("auto");
	const [enhancedUrl, setEnhancedUrl] = useState<string | null>(null);
	const [originalUrl, setOriginalUrl] = useState<string | null>(null);
	const [enhancedBlob, setEnhancedBlob] = useState<Blob | null>(null);
	const [showOriginal, setShowOriginal] = useState(false);

	// Deep-link: ?path=<storage_path> (e.g. from Generate) seeds the uploaded
	// file; the original player streams it from the backend via /dsp/stream.
	const handoff = useSearch({ from: "/audio-enhance" });
	useEffect(() => {
		const path = handoff.path;
		if (!path) {
			return;
		}
		setAudioPath(path);
		setFileName(path.split(/[\\/]/).pop() ?? path);
		setEnhancedUrl(null);
		setEnhancedBlob(null);
		setOriginalUrl(
			`${apiClient.getBaseUrl()}/dsp/stream?path=${encodeURIComponent(path)}`,
		);
		// run once on mount when a handoff path is present
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [handoff.path]);

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
			setEnhancedBlob(blob);
			setShowOriginal(false);
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
			if (originalUrl) {
				URL.revokeObjectURL(originalUrl);
			}
			setOriginalUrl(URL.createObjectURL(file));
			setEnhancedBlob(null);
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

	const saveMut = useMutation({
		mutationFn: async () => {
			if (!enhancedBlob) {
				throw new Error("No enhanced audio");
			}
			return apiClient.saveGeneratedAudio(
				enhancedBlob,
				`Enhanced ${fileName || "audio"}`,
				"capture",
				"file",
			);
		},
		onSuccess: () =>
			toast({
				title: "Saved to Library",
				description: "Enhanced audio is now in the Library tab.",
			}),
		onError: (e: unknown) => showStudioErrorToast(e),
	});

	const sendToEffects = async () => {
		if (!enhancedBlob) {
			toast({
				title: "No enhanced audio",
				description: "Enhance the audio before sending it to Effects.",
				variant: "destructive",
			});
			return;
		}
		setSendingToEffects(true);
		try {
			const { audio_path } = await apiClient.dspUpload(
				enhancedBlob,
				`${fileName || "audio"}-enhanced.wav`,
			);
			sendTo("/effects", { path: audio_path });
		} catch (error) {
			showStudioErrorToast(error);
		} finally {
			setSendingToEffects(false);
		}
	};

	const sendToTranscript = async () => {
		if (!enhancedBlob) {
			toast({
				title: "No enhanced audio",
				description: "Enhance the audio before sending it to Transcript Edit.",
				variant: "destructive",
			});
			return;
		}
		setSendingToTranscript(true);
		try {
			const file = new File(
				[enhancedBlob],
				`${fileName || "audio"}-enhanced.wav`,
				{ type: enhancedBlob.type || "audio/wav" },
			);
			const imported = await apiClient.importGeneration(file);
			sendTo("/transcript", { generation: imported.id });
		} catch (error) {
			showStudioErrorToast(error);
		} finally {
			setSendingToTranscript(false);
		}
	};

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
			<ScreenHeader title="Audio Enhance & Noise Reduction" />

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
					<div className="flex items-center justify-between">
						<h2 className="text-xs font-medium text-foreground">
							{showOriginal ? "Original audio" : "Enhanced audio"}
						</h2>
						<div className="flex items-center gap-2">
							{originalUrl ? (
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="h-7 px-2 text-xs"
									onClick={() => setShowOriginal((v) => !v)}
								>
									{showOriginal ? "Show enhanced" : "Compare original"}
								</Button>
							) : null}
							<Button
								type="button"
								size="sm"
								variant="outline"
								className="h-7 px-2 text-xs"
								disabled={sendingToEffects || !enhancedBlob}
								title="Send the enhanced audio to Effects"
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
								disabled={sendingToTranscript || !enhancedBlob}
								title="Send the enhanced audio to Transcript Edit"
								onClick={() => void sendToTranscript()}
							>
								{sendingToTranscript ? (
									<Spinner size="xs" className="mr-1" />
								) : null}
								Send to Transcript
							</Button>
							<Button
								type="button"
								size="sm"
								variant="outline"
								className="h-7 px-2 text-xs"
								disabled={saveMut.isPending || !enhancedBlob}
								onClick={() => saveMut.mutate()}
							>
								{saveMut.isPending ? (
									<Spinner size="xs" className="mr-1" />
								) : null}
								Save to Library
							</Button>
						</div>
					</div>
					{/* biome-ignore lint/a11y/useMediaCaption: processed speech preview, no dialogue to caption */}
					<audio
						src={showOriginal && originalUrl ? originalUrl : enhancedUrl}
						controls
						className="h-8 w-full"
						aria-label="Audio playback"
					/>
				</section>
			) : null}
		</div>
	);
}
