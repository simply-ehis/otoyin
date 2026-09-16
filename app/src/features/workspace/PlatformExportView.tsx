import {
	ArrowDownTrayIcon,
	DevicePhoneMobileIcon,
	FilmIcon,
	MicrophoneIcon,
	MusicalNoteIcon,
	SignalIcon,
	WrenchIcon,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Switch } from "@/ui/controls";
import { Badge, Label, Separator, Spinner } from "@/ui/primitives";
import { EmptyState, LoadingState, ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";
import { UploadField } from "./UploadField";

const ICONS: Record<string, React.ReactNode> = {
	podcast: <SignalIcon className="size-5" aria-hidden="true" />,
	audiobook: <MusicalNoteIcon className="size-5" aria-hidden="true" />,
	movie_audio: <FilmIcon className="size-5" aria-hidden="true" />,
	voiceover: <MicrophoneIcon className="size-5" aria-hidden="true" />,
	social_media: <DevicePhoneMobileIcon className="size-5" aria-hidden="true" />,
};

function formatChannels(channels: string): string {
	if (channels === "mono") {
		return "Mono";
	}
	if (channels === "stereo") {
		return "Stereo";
	}
	return channels;
}

function formatLabel(format: string, bitDepth: number): string {
	const upper = format.toUpperCase();
	if (upper === "WAV") {
		return `WAV ${bitDepth}-bit`;
	}
	return upper;
}

function downloadBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

export function PlatformExportView() {
	const { toast } = useToast();
	const [selectedPreset, setSelectedPreset] = useState("podcast");
	const [audioPath, setAudioPath] = useState("");
	const [fileName, setFileName] = useState("");
	const [uploading, setUploading] = useState(false);
	const [cleanup, setCleanup] = useState(false);

	const presetsQuery = useQuery({
		queryKey: ["export-presets"],
		queryFn: () => apiClient.getExportPresets(),
		staleTime: 5 * 60 * 1000,
	});

	const exportMut = useMutation({
		mutationFn: () =>
			apiClient.applyExportPreset(selectedPreset, audioPath, cleanup),
		onSuccess: (blob) => {
			const preset = presetsQuery.data?.[selectedPreset];
			const ext = preset?.format.toLowerCase() ?? "wav";
			downloadBlob(
				blob,
				`${selectedPreset.toLowerCase().replace(/\s+/g, "_")}_export.${ext}`,
			);
			toast({ title: `${preset?.name ?? selectedPreset} export complete` });
		},
		onError: (e: unknown) =>
			toast({
				title: "Export failed",
				description: e instanceof Error ? e.message : String(e),
				variant: "destructive",
			}),
	});

	async function handleFile(file: File) {
		setUploading(true);
		try {
			const { audio_path } = await apiClient.dspUpload(file, file.name);
			setAudioPath(audio_path);
			setFileName(file.name);
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

	const presetEntries = presetsQuery.data
		? Object.entries(presetsQuery.data).map(([key, p]) => ({ key, ...p }))
		: [];

	return (
		<div className="flex h-full max-w-2xl flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader title="Platform Export" />

			<Separator />

			{presetsQuery.isLoading ? (
				<LoadingState label="Loading export presets" />
			) : presetsQuery.isError ? (
				<EmptyState
					title="Export presets couldn't load"
					body="Check the backend connection."
				/>
			) : (
				<fieldset
					className="m-0 grid min-w-0 grid-cols-1 gap-2 border-0 p-0"
					aria-label="Export presets"
				>
					{presetEntries.map((preset) => (
						<button
							key={preset.key}
							type="button"
							aria-pressed={selectedPreset === preset.key}
							className={cn(
								"flex items-start gap-3 rounded-md border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								selectedPreset === preset.key
									? "border-accent bg-accent-muted"
									: "border-border bg-card hover:border-strong",
							)}
							title={`Select ${preset.name} export preset`}
							onClick={() => setSelectedPreset(preset.key)}
						>
							<span
								aria-hidden="true"
								className={cn(
									"rounded-md p-2",
									selectedPreset === preset.key
										? "bg-accent text-accent-foreground"
										: "bg-secondary text-muted-foreground",
								)}
							>
								{ICONS[preset.key] ?? (
									<WrenchIcon className="size-5" aria-hidden="true" />
								)}
							</span>
							<span className="min-w-0 flex-1">
								<span className="flex items-center gap-2">
									<span className="text-xs font-semibold text-foreground">
										{preset.name}
									</span>
									<Badge tone="neutral">
										{formatLabel(preset.format, preset.bit_depth)}
									</Badge>
								</span>
								<span className="mt-0.5 block text-xs text-muted-foreground">
									{preset.description}
								</span>
								<span className="mt-1.5 flex flex-wrap gap-x-3 text-xs tabular-nums text-muted-foreground">
									<span>
										Target:{" "}
										<span className="text-foreground">
											{preset.target_lufs} LUFS
										</span>
									</span>
									<span>
										Channels:{" "}
										<span className="text-foreground">
											{formatChannels(preset.channels)}
										</span>
									</span>
									<span>
										Sample rate:{" "}
										<span className="text-foreground">
											{preset.sample_rate >= 1000
												? `${(preset.sample_rate / 1000).toFixed(1)}kHz`
												: `${preset.sample_rate}Hz`}
										</span>
									</span>
								</span>
							</span>
							{selectedPreset === preset.key ? (
								<span
									aria-hidden="true"
									className="mt-2 size-2 shrink-0 rounded-full bg-accent"
								/>
							) : null}
						</button>
					))}
				</fieldset>
			)}

			<div className="space-y-1">
				<Label>Source audio</Label>
				<UploadField
					id="export-upload"
					label="Select Audio"
					fileName={fileName}
					uploading={uploading}
					onFile={(f) => void handleFile(f)}
				/>
			</div>

			<div className="flex items-center justify-between gap-2">
				<div className="space-y-0.5">
					<span className="text-xs font-medium text-foreground">
						Neural cleanup
					</span>
					<p className="text-xs text-muted-foreground">
						DeepFilterNet denoising before export.
					</p>
				</div>
				<Switch
					checked={cleanup}
					onCheckedChange={setCleanup}
					label="Enable neural cleanup"
				/>
			</div>

			<div>
				<Button
					type="button"
					size="sm"
					className="h-9"
					disabled={!audioPath || exportMut.isPending}
					title={`Export as ${selectedPreset}`}
					aria-label={`Export as ${selectedPreset}`}
					onClick={() => exportMut.mutate()}
				>
					{exportMut.isPending ? (
						<Spinner size="xs" className="mr-1.5" />
					) : (
						<ArrowDownTrayIcon className="mr-1.5 size-4" aria-hidden="true" />
					)}
					{exportMut.isPending ? "Exporting…" : `Export as ${selectedPreset}`}
				</Button>
			</div>
		</div>
	);
}
