import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { DEMUCS_MODEL_NAME } from "@/lib/audio/ensureModel";
import { ERR_TITLE_VALIDATION } from "@/lib/errorMessages";
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

export const ISOLATION_STEMS = [
	{ value: "vocals", label: "Vocals" },
	{ value: "drums", label: "Drums" },
	{ value: "bass", label: "Bass" },
	{ value: "other", label: "Other (everything else)" },
] as const;

export type IsolationStem = (typeof ISOLATION_STEMS)[number]["value"];

export function VocalIsolationView() {
	const { toast } = useToast();
	const [audioPath, setAudioPath] = useState("");
	const [fileName, setFileName] = useState("");
	const [uploading, setUploading] = useState(false);
	const [stem, setStem] = useState<IsolationStem>("vocals");
	const [stemUrl, setStemUrl] = useState<string | null>(null);

	const modelStatus = useQuery({
		queryKey: ["model-status", DEMUCS_MODEL_NAME],
		queryFn: () => apiClient.getModelStatus(),
		refetchInterval: (query) =>
			query.state.data?.models.find((m) => m.model_name === DEMUCS_MODEL_NAME)
				?.downloading
				? 2500
				: false,
	});

	const demucs = modelStatus.data?.models.find(
		(m) => m.model_name === DEMUCS_MODEL_NAME,
	);
	const modelReady = !!demucs?.downloaded;

	useEffect(() => {
		return () => {
			if (stemUrl) {
				URL.revokeObjectURL(stemUrl);
			}
		};
	}, [stemUrl]);

	const isolateMut = useMutation({
		mutationFn: () => apiClient.separateAudio(audioPath, stem),
		onSuccess: (blob) => {
			if (stemUrl) {
				URL.revokeObjectURL(stemUrl);
			}
			setStemUrl(URL.createObjectURL(blob));
			toast({ title: "Stem separation complete" });
		},
		onError: (error: unknown) =>
			toast({
				title: "Stem separation failed",
				description: error instanceof Error ? error.message : String(error),
				variant: "destructive",
			}),
	});

	async function handleFile(file: File) {
		setUploading(true);
		try {
			const { audio_path } = await apiClient.dspUpload(file, file.name);
			setAudioPath(audio_path);
			setFileName(file.name);
			setStemUrl(null);
			toast({ title: `Uploaded: ${file.name}` });
		} catch (error) {
			toast({
				title: "Upload failed",
				description: error instanceof Error ? error.message : String(error),
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
				description: "Upload a recording to isolate first",
				variant: "destructive",
			});
			return;
		}
		if (!modelReady) {
			toast({
				title: "Model not downloaded",
				description: "Download the Demucs model from the Store first.",
				variant: "destructive",
			});
			return;
		}
		isolateMut.mutate();
	}

	const stemLabel =
		ISOLATION_STEMS.find((s) => s.value === stem)?.label ?? stem;

	return (
		<div className="flex h-full max-w-xl flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader
				title="Vocal Isolation"
				description="Demucs stem separation — vocals, drums, bass, other"
			/>

			<Separator />

			{!modelReady && (
				<div className="space-y-1 rounded-md border border-warning bg-warning-soft px-3 py-2 text-xs">
					<p className="font-medium text-warning-text">
						Demucs model not installed yet
					</p>
					<p className="text-warning-text">
						Download it from the Store to use vocal isolation.{" "}
						<Link
							to="/store"
							className="rounded-sm underline transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							Get it from the Store
						</Link>
					</p>
				</div>
			)}

			<UploadField
				id="iso-upload"
				label="Select Audio"
				fileName={fileName}
				uploading={uploading || isolateMut.isPending}
				onFile={(f) => void handleFile(f)}
			/>

			<div className="space-y-1">
				<Label htmlFor="iso-stem">Stem to extract</Label>
				<Select
					value={stem}
					onValueChange={(v) => setStem(v as IsolationStem)}
					disabled={isolateMut.isPending}
				>
					<SelectTrigger id="iso-stem" className="h-8 max-w-xs text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{ISOLATION_STEMS.map((s) => (
							<SelectItem key={s.value} value={s.value}>
								{s.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<p className="text-xs text-muted-foreground">
					One stem per run — run again with another stem for the rest. Great for
					dubbing (isolate vocals) and podcast cleanup.
				</p>
			</div>

			<div>
				<Button
					type="button"
					size="sm"
					disabled={!audioPath || isolateMut.isPending}
					title="Isolate the selected stem"
					aria-label="Isolate stem"
					onClick={handleProcess}
				>
					{isolateMut.isPending ? <Spinner size="xs" className="mr-1" /> : null}
					{isolateMut.isPending ? "Separating…" : "Isolate Stem"}
				</Button>
			</div>

			{stemUrl ? (
				<section className="space-y-2 rounded-md border border-border bg-card p-3">
					<h2 className="text-xs font-medium text-foreground">
						{stemLabel} stem
					</h2>
					{/* biome-ignore lint/a11y/useMediaCaption: isolated stem preview, no dialogue to caption */}
					<audio
						src={stemUrl}
						controls
						className="h-8 w-full"
						aria-label={`${stemLabel} stem playback`}
					/>
					<Button
						type="button"
						variant="outline"
						size="sm"
						title="Download the isolated stem as WAV"
						aria-label="Download stem"
						onClick={() => {
							const a = document.createElement("a");
							a.href = stemUrl;
							a.download = `${fileName.replace(/\.[^.]+$/, "") || "audio"}-${stem}.wav`;
							a.click();
						}}
					>
						Download
					</Button>
				</section>
			) : null}
		</div>
	);
}
