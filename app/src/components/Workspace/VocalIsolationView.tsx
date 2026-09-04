import {
	ArrowDownTrayIcon as Download,
	ScissorsIcon as Isolate,
	ArrowUpTrayIcon as Upload,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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
import { DEMUCS_MODEL_NAME } from "@/lib/audio/ensureModel";
import { ERR_TITLE_VALIDATION } from "@/lib/errorMessages";

export const ISOLATION_STEMS = [
	{ value: "vocals", label: "Vocals" },
	{ value: "drums", label: "Drums" },
	{ value: "bass", label: "Bass" },
	{ value: "other", label: "Other (everything else)" },
] as const;

export type IsolationStem = (typeof ISOLATION_STEMS)[number]["value"];

export function VocalIsolationView() {
	const { toast } = useToast();
	const [audioPath, setAudioPath] = useState<string>("");
	const [fileName, setFileName] = useState<string>("");
	const [stem, setStem] = useState<IsolationStem>("vocals");
	const [stemUrl, setStemUrl] = useState<string | null>(null);
	const audioRef = useRef<HTMLAudioElement>(null);

	// Live model state — refetches fast while a download is in flight so the
	// UI flips to ready the moment the weights land.
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
			}
		};
		input.click();
	}

	async function handleProcess() {
		if (!audioPath) {
			toast({
				title: ERR_TITLE_VALIDATION,
				description: "Select a recording to isolate",
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
		isolateMut.mutate(undefined, {
			onSuccess: (blob) => {
				if (stemUrl) {
					URL.revokeObjectURL(stemUrl);
				}
				setStemUrl(URL.createObjectURL(blob));
				toast({ title: "Stem separation complete" });
			},
			onError: (error) =>
				toast({
					title: "Stem separation failed",
					description: error instanceof Error ? error.message : String(error),
					variant: "destructive",
				}),
		});
	}

	const busy = isolateMut.isPending;
	const stemLabel =
		ISOLATION_STEMS.find((s) => s.value === stem)?.label ?? stem;

	return (
		<div className="flex flex-col h-full p-4 gap-4">
			<ScreenHeader
				icon={<Isolate className="size-5" />}
				title="Vocal Isolation"
				description="Demucs (htdemucs) stem separation — vocals, drums, bass, other"
			/>

			<Separator />

			{/* Model state banner */}
			{!modelReady && (
				<div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90 space-y-1">
					<span className="font-medium">Demucs model not installed yet</span>
					<p className="text-xs opacity-80">
						Download it from the Store to use vocal isolation.
					</p>
					<Link
						to="/store"
						className="inline-block text-xs text-accent hover:underline"
					>
						Get from Store ?
					</Link>
				</div>
			)}

			{/* File selection */}
			<div className="flex items-center gap-3">
				<Button
					variant="outline"
					size="sm"
					onClick={handleFileSelect}
					disabled={busy}
					title="Select an audio file to separate"
					aria-label="Select an audio file"
				>
					<Upload className="h-3.5 w-3.5 mr-1.5" />
					Select Audio
				</Button>
				{(audioPath || fileName) && (
					<Badge variant="secondary" className="text-xs">
						{fileName || audioPath}
					</Badge>
				)}
			</div>

			{/* Stem selector */}
			<div className="space-y-2">
				<Label className="text-xs">Stem to extract</Label>
				<Select
					value={stem}
					onValueChange={(v) => setStem(v as IsolationStem)}
					disabled={busy}
				>
					<SelectTrigger>
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
				<p className="text-xs text-muted-foreground/40">
					One stem per run — run again with another stem for the rest. Great for
					dubbing (isolate vocals) and podcast cleanup (drop drums/bass).
				</p>
			</div>

			{/* Process button */}
			<Button
				size="sm"
				disabled={!audioPath || busy}
				onClick={handleProcess}
				className="self-start"
				title="Isolate the selected stem"
				aria-label="Isolate stem"
			>
				{busy ? (
					<Spinner size="sm" className="mr-1.5" />
				) : (
					<Isolate className="h-3.5 w-3.5 mr-1.5" />
				)}
				{busy ? "Separating…" : "Isolate Stem"}
			</Button>

			{/* Preview */}
			{stemUrl && (
				<div className="rounded-lg border border-border bg-card p-3 space-y-2">
					<span className="text-xs font-medium text-foreground">
						{stemLabel} stem
					</span>
					<audio
						ref={audioRef}
						src={stemUrl}
						controls
						className="w-full h-8"
						aria-label={`${stemLabel} stem playback`}
					>
						<track kind="captions" />
					</audio>
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							const a = document.createElement("a");
							a.href = stemUrl;
							a.download = `${fileName.replace(/\.[^.]+$/, "") || "audio"}-${stem}.wav`;
							a.click();
						}}
						title="Download the isolated stem as WAV"
						aria-label="Download stem"
					>
						<Download className="h-3.5 w-3.5 mr-1.5" />
						Download
					</Button>
				</div>
			)}
		</div>
	);
}
