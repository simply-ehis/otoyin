import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import { ERR_TITLE_VALIDATION } from "@/lib/errorMessages";
import { showStudioErrorToast } from "@/lib/errors";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Badge, Label, Spinner } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { ScreenHeader } from "@/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import { useToast } from "@/ui/use-toast";
import { playPreviewBlob } from "./playBlob";
import { UploadField } from "./UploadField";
import { VoiceChangerPanel } from "./VoiceChangerPanel";

type Engine = "meanvc2" | "tone_color_vc" | "seed_vc" | "cloud";

const ENGINES: { id: Engine; label: string; hint: string }[] = [
	{
		id: "meanvc2",
		label: "MeanVC2",
		hint: "Best quality · Apache-2.0 · CPU or GPU",
	},
	{
		id: "tone_color_vc",
		label: "Tone Color VC",
		hint: "Fastest · smallest · MIT",
	},
	{
		id: "seed_vc",
		label: "Seed-VC",
		hint: "GPU preferred · GPL-3.0",
	},
	{
		id: "cloud",
		label: "Cloud (BYOK)",
		hint: "Route through your configured provider",
	},
];

export function VoiceConverterView() {
	const { toast } = useToast();
	const [engine, setEngine] = useState<Engine>("meanvc2");
	const [audioPath, setAudioPath] = useState("");
	const [sourceName, setSourceName] = useState("");
	const [referencePath, setReferencePath] = useState("");
	const [referenceName, setReferenceName] = useState("");
	const [referenceProfileId, setReferenceProfileId] = useState("");
	const [uploading, setUploading] = useState<string | null>(null);
	const [hasResult, setHasResult] = useState(false);
	const [convertedBlob, setConvertedBlob] = useState<Blob | null>(null);

	function switchEngine(next: Engine) {
		setEngine(next);
		setReferencePath("");
		setReferenceName("");
		setReferenceProfileId("");
		setHasResult(false);
	}

	const profilesQuery = useQuery({
		queryKey: ["profiles"],
		queryFn: () => apiClient.listProfiles(),
		enabled: engine !== "cloud",
	});

	const convertMut = useMutation({
		mutationFn: () =>
			apiClient.convertVoice({
				audio_path: audioPath,
				engine,
				// Owner decision: no consent UI anywhere; responsibility is the
				// user's (disclaimer lives in the installer). The backend
				// attestation field is always satisfied - keeping the HTTP
				// contract unchanged for other callers.
				consent_given: true,
				reference_audio_path: referencePath,
			}),
		onSuccess: (blob) => {
			playPreviewBlob(blob);
			setConvertedBlob(blob);
			setHasResult(true);
			toast({ title: "Voice conversion complete" });
		},
		onError: (error: unknown) => showStudioErrorToast(error),
	});

	const saveMut = useMutation({
		mutationFn: async () => {
			if (!convertedBlob) {
				throw new Error("No converted audio");
			}
			return apiClient.saveGeneratedAudio(
				convertedBlob,
				`Voice conversion 17:48:03`,
				"capture",
				"file",
			);
		},
		onSuccess: () => {
			toast({
				title: "Saved to Library",
				description: "Converted audio is now in the Library tab.",
			});
		},
		onError: (e: unknown) => showStudioErrorToast(e),
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
		if (engine !== "cloud" && !referencePath) {
			toast({
				title: "Upload a reference voice clip",
				variant: "destructive",
			});
			return;
		}
		convertMut.mutate();
	}

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader helpPath="/voice-converter" title="Voice Transform" />

			<Tabs defaultValue="converter" className="flex flex-1 flex-col">
				<TabsList aria-label="Voice transform modes">
					<TabsTrigger value="converter">File conversion</TabsTrigger>
					<TabsTrigger value="changer">Real-time changer</TabsTrigger>
				</TabsList>
				<TabsContent value="converter" className="mt-3 space-y-4">
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

					{engine !== "cloud" ? (
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
								{engine === "meanvc2" &&
									"MeanVC2 converts toward the reference voice with no training."}
								{engine === "tone_color_vc" &&
									"Tone Color VC matches the reference clip's timbre with no training."}
								{engine === "seed_vc" &&
									"Seed-VC clones the reference voice with no training. GPL-3.0 weights."}
							</p>
						</div>
					) : null}

					<div className="flex items-center gap-2">
						<Button
							type="button"
							size="sm"
							disabled={convertMut.isPending}
							title="Convert voice"
							aria-label="Convert voice"
							onClick={handleConvert}
						>
							{convertMut.isPending ? (
								<Spinner size="xs" className="mr-1" />
							) : null}
							Convert
						</Button>
						{convertedBlob ? (
							<Button
								type="button"
								size="sm"
								variant="outline"
								className="h-8 text-xs"
								disabled={saveMut.isPending}
								onClick={() => saveMut.mutate()}
							>
								{saveMut.isPending ? (
									<Spinner size="xs" className="mr-1" />
								) : null}
								Save to Library
							</Button>
						) : null}
						{hasResult ? (
							<Badge tone="success">Last conversion played</Badge>
						) : null}
					</div>
				</TabsContent>
				<TabsContent value="changer" className="mt-3">
					<VoiceChangerPanel />
				</TabsContent>
			</Tabs>
		</div>
	);
}
