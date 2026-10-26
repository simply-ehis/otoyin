import {
	ArrowDownTrayIcon,
	DevicePhoneMobileIcon,
	FilmIcon,
	MicrophoneIcon,
	MusicalNoteIcon,
	PhotoIcon,
	SignalIcon,
	WrenchIcon,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Switch } from "@/ui/controls";
import { Input } from "@/ui/input";
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

function stemFromPath(path: string): string {
	return (
		path
			.split(/[\\/]/)
			.pop()
			?.replace(/\.[^/.]+$/, "") || "export"
	);
}

export function PlatformExportView() {
	const { toast } = useToast();
	const [selectedPreset, setSelectedPreset] = useState("podcast");
	const [audioPath, setAudioPath] = useState("");
	const [fileName, setFileName] = useState("");
	const [uploading, setUploading] = useState(false);
	const [cleanup, setCleanup] = useState(false);
	const [coverPath, setCoverPath] = useState<string | null>(null);
	const [metadata, setMetadata] = useState({
		title: "",
		artist: "",
		album: "",
		genre: "",
		year: "",
		comment: "",
		track_number: "",
	});

	const presetsQuery = useQuery({
		queryKey: ["export-presets"],
		queryFn: () => apiClient.getExportPresets(),
		staleTime: 5 * 60 * 1000,
	});

	const exportMut = useMutation({
		mutationFn: () =>
			apiClient.applyExportPreset(selectedPreset, audioPath, cleanup, {
				title: metadata.title || undefined,
				artist: metadata.artist || undefined,
				album: metadata.album || undefined,
				genre: metadata.genre || undefined,
				year: metadata.year || undefined,
				comment: metadata.comment || undefined,
				track_number: metadata.track_number || undefined,
				cover_path: coverPath || undefined,
			}),
		onSuccess: (blob) => {
			const preset = presetsQuery.data?.[selectedPreset];
			const ext = preset?.format.toLowerCase() ?? "wav";
			const baseName = stemFromPath(fileName) || selectedPreset;
			downloadBlob(blob, `${baseName}_export.${ext}`);
			toast({ title: `${preset?.name ?? selectedPreset} export complete` });
			// Clear cover temp file reference after successful export
			setCoverPath(null);
		},
		onError: (e: unknown) =>
			toast({
				title: "Export failed",
				description: e instanceof Error ? e.message : String(e),
				variant: "destructive",
			}),
	});

	const coverMut = useMutation({
		mutationFn: (file: File) => apiClient.uploadExportCover(file),
		onSuccess: (result) => {
			setCoverPath(result.cover_path);
			toast({ title: "Cover image ready" });
		},
		onError: (e: unknown) =>
			toast({
				title: "Cover upload failed",
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
			// Auto-fill title from filename
			setMetadata((prev) => ({
				...prev,
				title: prev.title || stemFromPath(file.name),
			}));
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

	async function handleCoverFile(file: File) {
		await coverMut.mutateAsync(file);
	}

	const presetEntries = presetsQuery.data
		? Object.entries(presetsQuery.data).map(([key, p]) => ({ key, ...p }))
		: [];

	const hasMetadata = Object.values(metadata).some((v) => v !== "");

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

			{coverPath ? (
				<div className="flex items-center gap-2 p-2 rounded-md border border-border bg-secondary">
					<PhotoIcon
						className="size-4 text-muted-foreground"
						aria-hidden="true"
					/>
					<span className="text-xs text-muted-foreground truncate max-w-[200px]">
						Cover: {coverPath.split(/[\\/]/).pop()}
					</span>
					<Button
						variant="destructive"
						size="sm"
						onClick={() => {
							setCoverPath(null);
						}}
						title="Remove cover"
					>
						Remove
					</Button>
				</div>
			) : null}

			<div className="space-y-1">
				<Label>Cover image (optional)</Label>
				<Input
					type="file"
					accept="image/png,image/jpeg,image/webp"
					onChange={(e) => {
						const f = e.target.files?.[0];
						if (f) {
							void handleCoverFile(f);
							e.target.value = "";
						}
					}}
					className="h-9"
				/>
			</div>

			<div className="space-y-1">
				<Label>Metadata (optional)</Label>
				<p className="text-xs text-muted-foreground">
					Embedded in MP3, M4A/M4B, FLAC, OGG, OPUS exports. Ignored for
					WAV/AIFF.
				</p>
				<div className="grid grid-cols-2 gap-2">
					<div>
						<Label className="text-xs text-muted-foreground block mb-1">
							Title
						</Label>
						<Input
							value={metadata.title}
							onChange={(e) =>
								setMetadata((prev) => ({ ...prev, title: e.target.value }))
							}
							placeholder="Track title"
							className="h-7"
						/>
					</div>
					<div>
						<Label className="text-xs text-muted-foreground block mb-1">
							Artist
						</Label>
						<Input
							value={metadata.artist}
							onChange={(e) =>
								setMetadata((prev) => ({ ...prev, artist: e.target.value }))
							}
							placeholder="Artist name"
							className="h-7"
						/>
					</div>
					<div>
						<Label className="text-xs text-muted-foreground block mb-1">
							Album
						</Label>
						<Input
							value={metadata.album}
							onChange={(e) =>
								setMetadata((prev) => ({ ...prev, album: e.target.value }))
							}
							placeholder="Album name"
							className="h-7"
						/>
					</div>
					<div>
						<Label className="text-xs text-muted-foreground block mb-1">
							Genre
						</Label>
						<Input
							value={metadata.genre}
							onChange={(e) =>
								setMetadata((prev) => ({ ...prev, genre: e.target.value }))
							}
							placeholder="Genre"
							className="h-7"
						/>
					</div>
					<div>
						<Label className="text-xs text-muted-foreground block mb-1">
							Year
						</Label>
						<Input
							type="number"
							value={metadata.year}
							onChange={(e) =>
								setMetadata((prev) => ({ ...prev, year: e.target.value }))
							}
							placeholder="2024"
							className="h-7"
						/>
					</div>
					<div>
						<Label className="text-xs text-muted-foreground block mb-1">
							Track #
						</Label>
						<Input
							type="number"
							value={metadata.track_number}
							onChange={(e) =>
								setMetadata((prev) => ({
									...prev,
									track_number: e.target.value,
								}))
							}
							placeholder="1"
							className="h-7"
						/>
					</div>
				</div>
				<div>
					<Label className="text-xs text-muted-foreground block mb-1">
						Comment
					</Label>
					<Input
						value={metadata.comment}
						onChange={(e) =>
							setMetadata((prev) => ({ ...prev, comment: e.target.value }))
						}
						placeholder="Optional comment"
						className="h-7"
					/>
				</div>
				{hasMetadata ? (
					<p className="text-[10px] text-muted-foreground mt-1">
						{Object.entries(metadata)
							.filter(([, v]) => v !== "")
							.map(([k, v]) => `${k}: ${v}`)
							.join(" · ")}
					</p>
				) : null}
			</div>

			<div className="flex items-center justify-between gap-2">
				<div className="space-y-0.5">
					<div className="flex items-center gap-1">
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
