import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import { ERR_TITLE_VALIDATION } from "@/lib/errorMessages";
import { showStudioErrorToast } from "@/lib/errors";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Badge, Label, Separator, Spinner } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { Slider } from "@/ui/slider";
import { EmptyState, LoadingState, ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";
import { playPreviewBlob } from "./playBlob";
import { UploadField } from "./UploadField";

type Engine = "rvc" | "seed_vc" | "openvoice" | "cloud";

const ENGINES: { id: Engine; label: string; hint: string }[] = [
	{
		id: "rvc",
		label: "RVC Pack",
		hint: "Pre-trained voice pack",
	},
	{
		id: "seed_vc",
		label: "Seed-VC Clone",
		hint: "Clone from reference audio, no training",
	},
	{
		id: "openvoice",
		label: "OpenVoice Clone",
		hint: "Zero-shot tone match from reference audio",
	},
	{
		id: "cloud",
		label: "Cloud (BYOK)",
		hint: "Route through your configured provider",
	},
];

export function VoiceConverterView() {
	const { toast } = useToast();
	const [engine, setEngine] = useState<Engine>("rvc");
	const [audioPath, setAudioPath] = useState("");
	const [sourceName, setSourceName] = useState("");
	const [selectedPack, setSelectedPack] = useState("");
	const [referencePath, setReferencePath] = useState("");
	const [referenceName, setReferenceName] = useState("");
	const [referenceProfileId, setReferenceProfileId] = useState("");
	const [transpose, setTranspose] = useState(0);
	const [diffusionSteps, setDiffusionSteps] = useState(10);
	const [uploading, setUploading] = useState<string | null>(null);
	const [hasResult, setHasResult] = useState(false);
	const [consentGiven, setConsentGiven] = useState(false);

	function switchEngine(next: Engine) {
		setEngine(next);
		setSelectedPack("");
		setReferencePath("");
		setReferenceName("");
		setReferenceProfileId("");
		setHasResult(false);
	}

	const packsQuery = useQuery({
		queryKey: ["voice-packs"],
		queryFn: () => apiClient.getVoicePacks(),
		enabled: engine === "rvc",
	});

	const profilesQuery = useQuery({
		queryKey: ["profiles"],
		queryFn: () => apiClient.listProfiles(),
		enabled: engine === "seed_vc" || engine === "openvoice",
	});

	const convertMut = useMutation({
		mutationFn: () =>
			apiClient.convertVoice({
				audio_path: audioPath,
				engine,
				consent_given: consentGiven,
				voice_pack: selectedPack,
				transpose,
				reference_audio_path: referencePath,
				diffusion_steps: diffusionSteps,
			}),
		onSuccess: (blob) => {
			playPreviewBlob(blob);
			setHasResult(true);
			toast({ title: "Voice conversion complete" });
		},
		onError: (error: unknown) => showStudioErrorToast(error),
	});

	async function uploadFile(file: File, slot: "source" | "reference") {
		setUploading(slot);
		try {
			const { audio_path } = await apiClient.dspUpload(file, file.name);
			if (slot === "source") {
				setAudioPath(audio_path);
				setSourceName(file.name);
			} else {
				setReferencePath(audio_path);
				setReferenceName(file.name);
				setReferenceProfileId("");
			}
			toast({ title: `Uploaded: ${file.name}` });
		} catch (err) {
			toast({
				title: "Upload failed",
				description: err instanceof Error ? err.message : String(err),
				variant: "destructive",
			});
		} finally {
			setUploading(null);
		}
	}

	async function loadProfileAsReference(profileId: string) {
		setReferenceProfileId(profileId);
		if (!profileId) {
			setReferencePath("");
			setReferenceName("");
			return;
		}
		try {
			const samples = await apiClient.listProfileSamples(profileId);
			const first = samples[0];
			if (!first) {
				toast({
					title: "This profile has no samples yet",
					variant: "destructive",
				});
				setReferencePath("");
				setReferenceName("");
				return;
			}
			setReferencePath(first.audio_path);
			setReferenceName(
				first.audio_path.split(/[/\\]/).pop() || "profile sample",
			);
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
		if (engine === "rvc" && !selectedPack) {
			toast({
				title: ERR_TITLE_VALIDATION,
				description: "Pick a target voice pack before converting",
				variant: "destructive",
			});
			return;
		}
		if ((engine === "seed_vc" || engine === "openvoice") && !referencePath) {
			toast({
				title: "Upload a reference voice clip",
				variant: "destructive",
			});
			return;
		}
		convertMut.mutate();
	}

	const packs = packsQuery.data?.voice_packs ?? [];
	const installedPacks = packs.filter((p) => p.installed);

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader
				title="Voice Converter"
			/>

			<Separator />

			<fieldset
				className="m-0 inline-flex min-w-0 flex-wrap gap-1 self-start rounded-md border border-border bg-card p-1"
				aria-label="Voice conversion engine"
			>
				{ENGINES.map((e) => (
					<button
						key={e.id}
						type="button"
						aria-pressed={engine === e.id}
						className={cn(
							"h-8 rounded-sm px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							engine === e.id
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
						title={`${e.label}: ${e.hint}`}
						onClick={() => switchEngine(e.id)}
					>
						{e.label}
					</button>
				))}
			</fieldset>

			<div className="max-w-xl space-y-1">
				<Label>Source audio</Label>
				<UploadField
					id="vc-source"
					label="Select Audio"
					fileName={sourceName}
					uploading={uploading === "source"}
					onFile={(f) => void uploadFile(f, "source")}
				/>
			</div>

			{engine === "rvc" ? (
				<div className="max-w-xl space-y-1">
					<Label>Target voice pack</Label>
					{packsQuery.isLoading ? (
						<LoadingState label="Loading voice packs" />
					) : packsQuery.isError ? (
						<EmptyState
							title="Voice packs couldn't load"
							body="Check the backend connection."
						/>
					) : packs.length === 0 ? (
						<EmptyState
							title="No voice packs found"
							body="Install an RVC pack from the Store first."
						/>
					) : (
						<div className="flex flex-wrap gap-2">
							{packs.map((p) => (
								<Button
									key={p.name}
									type="button"
									variant={selectedPack === p.name ? "default" : "outline"}
									size="sm"
									className="h-8 capitalize"
									disabled={!p.installed}
									title={
										p.installed ? "Ready" : `Download required (${p.repo})`
									}
									aria-label={`Select voice ${p.name}`}
									aria-pressed={selectedPack === p.name}
									onClick={() => setSelectedPack(p.name)}
								>
									{p.name.replace(/-/g, " ")}
									{!p.installed && (
										<span className="ml-1.5 text-xs">(download)</span>
									)}
								</Button>
							))}
						</div>
					)}
				</div>
			) : null}

			{engine === "seed_vc" || engine === "openvoice" ? (
				<div className="max-w-xl space-y-2">
					<Label>Reference voice clip (1–30s)</Label>
					<div className="flex flex-wrap items-center gap-2">
						<UploadField
							id="vc-reference"
							label="Upload Clip"
							fileName={referenceName}
							uploading={uploading === "reference"}
							onFile={(f) => void uploadFile(f, "reference")}
						/>
						<span className="text-xs text-muted-foreground">or</span>
						<Select
							value={referenceProfileId}
							onValueChange={(v) => void loadProfileAsReference(v)}
						>
							<SelectTrigger
								className="h-8 w-56 text-xs"
								aria-label="Use a saved voice profile"
							>
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
					</div>
					<p className="text-xs text-muted-foreground">
						{engine === "seed_vc"
							? "Seed-VC clones the reference voice with no training. Reference is clipped to 25s automatically."
							: "OpenVoice matches the reference clip's tone with no training."}
					</p>
				</div>
			) : null}

			{engine === "rvc" ? (
				<div className="max-w-xl space-y-1">
					<div className="flex items-center justify-between gap-2">
						<Label htmlFor="vc-transpose">Transpose (semitones)</Label>
						<span className="font-mono text-xs tabular-nums text-muted-foreground">
							{transpose > 0 ? "+" : ""}
							{transpose}
						</span>
					</div>
					<Slider
						id="vc-transpose"
						min={-12}
						max={12}
						step={1}
						value={[transpose]}
						onValueChange={([v]) => setTranspose(v ?? 0)}
						aria-label="Transpose semitones"
					/>
				</div>
			) : null}
			{engine === "seed_vc" ? (
				<div className="max-w-xl space-y-1">
					<div className="flex items-center justify-between gap-2">
						<Label htmlFor="vc-steps">Diffusion steps (quality vs speed)</Label>
						<span className="font-mono text-xs tabular-nums text-muted-foreground">
							{diffusionSteps}
						</span>
					</div>
					<Slider
						id="vc-steps"
						min={4}
						max={100}
						step={1}
						value={[diffusionSteps]}
						onValueChange={([v]) => setDiffusionSteps(v ?? 10)}
						aria-label="Diffusion steps"
					/>
					<p className="text-xs text-muted-foreground">
						10 = fast, 50–100 = best quality
					</p>
				</div>
			) : null}

			<div className="max-w-xl rounded-md border border-border bg-card p-3">
				<label className="flex items-start gap-2 text-xs text-muted-foreground">
					<input
						type="checkbox"
						className="mt-0.5 size-3.5 rounded border-border"
						checked={consentGiven}
						onChange={(e) => setConsentGiven(e.target.checked)}
						aria-label="I confirm I have rights to use this audio"
					/>
					<span>
						I confirm I have the necessary rights or consent to use the source
						audio and any reference voice. Otoyin logs file hashes locally for
						audit purposes.
					</span>
				</label>
			</div>

			<div className="flex items-center gap-2">
				<Button
					type="button"
					size="sm"
					disabled={
						convertMut.isPending ||
						!consentGiven ||
						(engine === "rvc" && !installedPacks.length)
					}
					title={
						consentGiven
							? "Convert voice"
							: "Accept consent to enable conversion"
					}
					aria-label="Convert voice"
					onClick={handleConvert}
				>
					{convertMut.isPending ? <Spinner size="xs" className="mr-1" /> : null}
					Convert
				</Button>
				{hasResult ? (
					<Badge tone="success">Last conversion played</Badge>
				) : null}
			</div>
		</div>
	);
}
