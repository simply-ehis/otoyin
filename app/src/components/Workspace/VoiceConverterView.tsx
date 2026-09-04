import {
	MicrophoneIcon as Mic,
	SparklesIcon as Sparkles,
	ArrowUpTrayIcon as Upload,
	SpeakerWaveIcon as Volume2,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
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
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import { ERR_TITLE_VALIDATION } from "@/lib/errorMessages";
import { showStudioErrorToast } from "@/lib/errors";

interface VoicePack {
	name: string;
	repo: string;
	installed: boolean;
}

type Engine = "rvc" | "seed_vc" | "openvoice" | "cloud";

export function VoiceConverterView() {
	const { toast } = useToast();
	const [engine, setEngine] = useState<Engine>("rvc");
	const [audioPath, setAudioPath] = useState("");
	const [selectedPack, setSelectedPack] = useState("");
	const [referencePath, setReferencePath] = useState("");
	const [referenceProfileId, setReferenceProfileId] = useState("");
	const [transpose, setTranspose] = useState(0);
	const [diffusionSteps, setDiffusionSteps] = useState(10);
	const [resultUrl, setResultUrl] = useState<string | null>(null);
	const [uploadingLabel, setUploadingLabel] = useState<string | null>(null);
	const audioRef = useRef<HTMLAudioElement>(null);

	useEffect(() => {
		return () => {
			if (resultUrl) {
				URL.revokeObjectURL(resultUrl);
			}
		};
	}, [resultUrl]);

	const packsQuery = useQuery<{ voice_packs: VoicePack[] }>({
		queryKey: ["voice-packs"],
		queryFn: () => apiClient.getVoicePacks(),
		enabled: engine === "rvc",
	});

	// Reusing a saved Voice Profile as the reference clip — the same
	// record-once-use-everywhere profiles that already work for TTS cloning.
	const profilesQuery = useQuery({
		queryKey: ["voiceProfiles"],
		queryFn: () => apiClient.listProfiles(),
		enabled: engine === "seed_vc" || engine === "openvoice",
	});

	const convertMut = useMutation({
		mutationFn: () =>
			apiClient.convertVoice({
				audio_path: audioPath,
				engine,
				voice_pack: selectedPack,
				transpose,
				reference_audio_path: referencePath,
				diffusion_steps: diffusionSteps,
			}),
	});

	/** Uploads the picked file to the server and stores the real path — a bare
	 * File object's `.name` is just a filename string, never resolvable
	 * server-side, so this has to actually upload before the backend can use it. */
	async function pickFile(setter: (p: string) => void, label: string) {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "audio/*";
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) {
				return;
			}
			setUploadingLabel(label);
			try {
				const { audio_path } = await apiClient.dspUpload(file, file.name);
				setter(audio_path);
				toast({ title: `Uploaded: ${file.name}` });
			} catch (err) {
				toast({
					title: "Upload failed",
					description: err instanceof Error ? err.message : String(err),
					variant: "destructive",
				});
			} finally {
				setUploadingLabel(null);
			}
		};
		input.click();
	}

	async function useProfileAsReference(profileId: string) {
		setReferenceProfileId(profileId);
		if (!profileId) {
			setReferencePath("");
			return;
		}
		try {
			const samples = await apiClient.listProfileSamples(profileId);
			if (samples.length === 0) {
				toast({
					title: "This profile has no samples yet",
					variant: "destructive",
				});
				setReferencePath("");
				return;
			}
			setReferencePath(samples[0].audio_path);
		} catch (err) {
			toast({
				title: "Could not load profile sample",
				description: err instanceof Error ? err.message : String(err),
				variant: "destructive",
			});
		}
	}

	function handleConvert() {
		if (!audioPath) {
			toast({
				title: ERR_TITLE_VALIDATION,
				description: "Select a source recording first",
				variant: "destructive",
			});
			return;
		}
		if (engine === "rvc") {
			if (!selectedPack) {
				toast({
					title: ERR_TITLE_VALIDATION,
					description: "Pick a target voice pack before converting",
					variant: "destructive",
				});
				return;
			}
		} else if (engine === "seed_vc" || engine === "openvoice") {
			if (!referencePath) {
				toast({
					title: "Upload a reference voice clip",
					variant: "destructive",
				});
				return;
			}
		}
		convertMut.mutate(undefined, {
			onSuccess: (blob) => {
				const url = URL.createObjectURL(blob);
				setResultUrl(url);
				toast({ title: "Voice conversion complete" });
			},
			onError: (error) => showStudioErrorToast(error),
		});
	}

	const packs = packsQuery.data?.voice_packs ?? [];
	const installedPacks = packs.filter((p) => p.installed);

	return (
		<div className="flex flex-col h-full p-4 gap-4">
			<ScreenHeader
				icon={<Mic className="size-5" />}
				title="Voice Converter"
				description="RVC v2 (voice packs), Seed-VC, or OpenVoice (zero-shot clone from a reference clip) \u2014 or Cloud (BYOK) to route through your configured provider"
			/>

			<Separator />

			{/* Engine selector — segmented single-select */}
			<div
				role="radiogroup"
				aria-label="Voice conversion engine"
				className="inline-flex rounded-full border bg-muted p-1 gap-1"
			>
				<Button
					role="radio"
					aria-checked={engine === "rvc"}
					variant={engine === "rvc" ? "default" : "ghost"}
					size="sm"
					onClick={() => setEngine("rvc")}
					title="RVC: pre-trained voice pack"
					aria-label="Use RVC engine"
				>
					<Mic className="h-3.5 w-3.5 mr-1.5" />
					RVC Pack
				</Button>
				<Button
					role="radio"
					aria-checked={engine === "seed_vc"}
					variant={engine === "seed_vc" ? "default" : "ghost"}
					size="sm"
					onClick={() => setEngine("seed_vc")}
					title="Seed-VC: clone from reference audio"
					aria-label="Use Seed-VC engine"
				>
					<Sparkles className="h-3.5 w-3.5 mr-1.5" />
					Seed-VC Clone
				</Button>
				<Button
					role="radio"
					aria-checked={engine === "openvoice"}
					variant={engine === "openvoice" ? "default" : "ghost"}
					size="sm"
					onClick={() => setEngine("openvoice")}
					title="OpenVoice: zero-shot tone-color clone from reference audio"
					aria-label="Use OpenVoice engine"
				>
					<Sparkles className="h-3.5 w-3.5 mr-1.5" />
					OpenVoice Clone
				</Button>
				<Button
					role="radio"
					aria-checked={engine === "cloud"}
					variant={engine === "cloud" ? "default" : "ghost"}
					size="sm"
					onClick={() => setEngine("cloud")}
					title="Cloud: route through your configured BYOK voice-conversion provider"
					aria-label="Use Cloud engine"
				>
					<Sparkles className="h-3.5 w-3.5 mr-1.5" />
					Cloud (BYOK)
				</Button>
			</div>

			{/* Source audio */}
			<div className="space-y-2">
				<Label className="text-xs">Source Audio</Label>
				<div className="flex items-center gap-3">
					<Button
						variant="outline"
						size="sm"
						onClick={() => pickFile(setAudioPath, "source")}
						title="Select source audio"
						aria-label="Select source audio"
						disabled={uploadingLabel === "source"}
					>
						{uploadingLabel === "source" ? (
							<Spinner size="sm" className="mr-1.5" />
						) : (
							<Upload className="h-3.5 w-3.5 mr-1.5" />
						)}
						{uploadingLabel === "source" ? "Uploading…" : "Select Audio"}
					</Button>
					{audioPath && (
						<Badge variant="secondary" className="text-xs">
							{audioPath}
						</Badge>
					)}
				</div>
			</div>

			{engine === "rvc" ? (
				<div className="space-y-2">
					<Label className="text-xs">Target Voice Pack</Label>
					{packsQuery.isLoading ? (
						<LoadingState label="Loading voice packs…" />
					) : packsQuery.isError ? (
						<EmptyState
							variant="error"
							title="Failed to load voice packs"
							description="Check the backend connection."
						/>
					) : (
						<div className="flex flex-wrap gap-2">
							{packs.map((p) => (
								<Button
									key={p.name}
									variant={selectedPack === p.name ? "default" : "outline"}
									size="sm"
									className="h-8 capitalize"
									title={
										p.installed ? "Ready" : `Download required (${p.repo})`
									}
									aria-label={`Select voice ${p.name}`}
									onClick={() => setSelectedPack(p.name)}
									disabled={!p.installed}
								>
									{p.name.replace(/-/g, " ")}
									{!p.installed && (
										<span className="ml-1.5 text-xs text-muted-foreground/70">
											(download)
										</span>
									)}
								</Button>
							))}
						</div>
					)}
				</div>
			) : (
				(engine === "seed_vc" || engine === "openvoice") && (
					<div className="space-y-2">
						<Label className="text-xs">Reference Voice Clip (1–30s)</Label>
						<div className="flex flex-wrap items-center gap-3">
							<Button
								variant="outline"
								size="sm"
								onClick={() => {
									setReferenceProfileId("");
									pickFile(setReferencePath, "reference");
								}}
								title="Select reference clip"
								aria-label="Select reference clip"
								disabled={uploadingLabel === "reference"}
							>
								{uploadingLabel === "reference" ? (
									<Spinner size="sm" className="mr-1.5" />
								) : (
									<Upload className="h-3.5 w-3.5 mr-1.5" />
								)}
								{uploadingLabel === "reference" ? "Uploading…" : "Upload Clip"}
							</Button>
							<span className="text-xs text-muted-foreground/70">or</span>
							<Select
								value={referenceProfileId}
								onValueChange={useProfileAsReference}
							>
								<SelectTrigger className="h-8 w-[220px] text-xs">
									<SelectValue placeholder="Use a saved voice profile…" />
								</SelectTrigger>
								<SelectContent>
									{(profilesQuery.data ?? []).map((p) => (
										<SelectItem key={p.id} value={p.id}>
											{p.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{referencePath && (
								<Badge variant="secondary" className="text-xs">
									{referencePath}
								</Badge>
							)}
						</div>
						<p className="text-xs text-muted-foreground/70">
							{engine === "seed_vc"
								? "Seed-VC clones the reference voice with no training. Reference is clipped to 25s automatically."
								: "OpenVoice matches the reference clip\u2019s tone/timbre with no training."}
						</p>
					</div>
				)
			)}

			{/* Transpose / diffusion */}
			{engine === "rvc" && (
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<Label className="text-xs">Transpose (semitones)</Label>
						<span className="text-xs font-mono tabular-nums text-muted-foreground">
							{transpose > 0 ? "+" : ""}
							{transpose}
						</span>
					</div>
					<Slider
						min={-12}
						max={12}
						step={1}
						value={[transpose]}
						onValueChange={([v]) => setTranspose(v)}
					/>
				</div>
			)}
			{engine === "seed_vc" && (
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<Label className="text-xs">
							Diffusion Steps (quality vs speed)
						</Label>
						<span className="text-xs font-mono tabular-nums text-muted-foreground">
							{diffusionSteps}
						</span>
					</div>
					<Slider
						min={4}
						max={100}
						step={1}
						value={[diffusionSteps]}
						onValueChange={([v]) => setDiffusionSteps(v)}
					/>
					<p className="text-xs text-muted-foreground/70">
						10 = fast, 50–100 = best quality
					</p>
				</div>
			)}

			<div className="flex items-center gap-3">
				<Button
					size="sm"
					onClick={handleConvert}
					disabled={
						convertMut.isPending || (engine === "rvc" && !installedPacks.length)
					}
					title="Convert voice"
					aria-label="Convert voice"
				>
					{convertMut.isPending ? (
						<Spinner size="sm" className="mr-1.5" />
					) : (
						<Mic className="h-3.5 w-3.5 mr-1.5" />
					)}
					Convert
				</Button>
				{resultUrl && (
					<Button
						variant="outline"
						size="sm"
						onClick={() => audioRef.current?.play()}
						title="Play result"
						aria-label="Play result"
					>
						<Volume2 className="h-3.5 w-3.5 mr-1.5" />
						Play
					</Button>
				)}
			</div>

			{/* biome-ignore lint/a11y/useMediaCaption: converted voice preview, no dialogue to caption */}
			{resultUrl && <audio ref={audioRef} src={resultUrl} className="hidden" />}
		</div>
	);
}
