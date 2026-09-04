import {
	ArrowDownTrayIcon as Download,
	FilmIcon as Film,
	SignalIcon as Headphones,
	MicrophoneIcon as Mic,
	MusicalNoteIcon as Music,
	DevicePhoneMobileIcon as Smartphone,
	WrenchIcon,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Spinner } from "@/components/ui/Spinner";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";

const ICON_MAP: Record<string, React.ReactNode> = {
	podcast: <Headphones className="size-5" />,
	audiobook: <Music className="size-5" />,
	movie_audio: <Film className="size-5" />,
	voiceover: <Mic className="size-5" />,
	social_media: <Smartphone className="size-5" />,
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
	if (upper === "MP3") {
		return `MP3`;
	}
	if (upper === "WAV") {
		return `WAV ${bitDepth}-bit`;
	}
	if (upper === "FLAC") {
		return "FLAC";
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
	const [selectedPreset, setSelectedPreset] = useState<string>("podcast");
	const [audioPath, setAudioPath] = useState<string>("");
	const [cleanup, setCleanup] = useState(false);

	const { data: presets, isLoading } = useQuery({
		queryKey: ["export-presets"],
		queryFn: () => apiClient.getExportPresets(),
	});

	const exportMut = useMutation({
		mutationFn: () =>
			apiClient.applyExportPreset(selectedPreset, audioPath, cleanup),
		onSuccess: (blob) => {
			const preset = presets?.[selectedPreset];
			const ext = preset?.format ?? "wav";
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

	function handleFileSelect() {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = "audio/*";
		input.onchange = () => {
			const file = input.files?.[0];
			if (file) {
				setAudioPath(file.name);
			}
		};
		input.click();
	}

	const presetEntries = presets
		? Object.entries(presets).map(([key, p]) => ({ key, ...p }))
		: [];

	return (
		<div className="flex flex-col h-full p-4 gap-4">
			<ScreenHeader
				icon={<Download className="size-5" />}
				title="Platform Export"
				description="One-tap export presets for every platform"
			/>

			<Separator />

			{/* Preset grid */}
			<div className="grid grid-cols-1 gap-2">
				{isLoading &&
					Array.from({ length: 5 }).map((_, i) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton items
							key={`skeleton-${i}`}
							className="h-16 rounded-lg bg-muted/30 animate-pulse"
						/>
					))}
				{presetEntries.map((preset) => (
					<button
						type="button"
						key={preset.key}
						className={cn(
							"flex items-start gap-3 p-3 rounded-lg border transition-colors text-left",
							selectedPreset === preset.key
								? "border-accent bg-accent/10"
								: "border-border bg-card hover:border-accent/50",
						)}
						onClick={() => setSelectedPreset(preset.key)}
						title={`Select ${preset.name} export preset`}
						aria-label={`Select ${preset.name} export preset`}
					>
						<div
							className={cn(
								"p-2 rounded-md",
								selectedPreset === preset.key
									? "bg-accent/20 text-accent"
									: "bg-muted text-muted-foreground",
							)}
						>
							{ICON_MAP[preset.key] ?? <WrenchIcon className="size-5" />}
						</div>
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<span className="text-xs font-semibold text-foreground">
									{preset.name}
								</span>
								<Badge variant="secondary" className="text-xs">
									{formatLabel(preset.format, preset.bit_depth)}
								</Badge>
							</div>
							<p className="text-xs text-muted-foreground/60 mt-0.5">
								{preset.description}
							</p>
							<div className="flex gap-3 mt-1.5">
								<span className="text-xs text-muted-foreground/50">
									Target:{" "}
									<span className="font-mono text-foreground/70">
										{preset.target_lufs} LUFS
									</span>
								</span>
								<span className="text-xs text-muted-foreground/50">
									Channels:{" "}
									<span className="text-foreground/70">
										{formatChannels(preset.channels)}
									</span>
								</span>
								<span className="text-xs text-muted-foreground/50">
									Sample rate:{" "}
									<span className="text-foreground/70">
										{preset.sample_rate >= 1000
											? `${(preset.sample_rate / 1000).toFixed(1)}kHz`
											: `${preset.sample_rate}Hz`}
									</span>
								</span>
							</div>
						</div>
						{selectedPreset === preset.key && (
							<div className="size-2 rounded-full bg-accent mt-2" />
						)}
					</button>
				))}
			</div>

			{/* File selection */}
			<div className="space-y-1.5">
				<Label className="text-xs">Source Audio</Label>
				<Button
					variant="outline"
					size="sm"
					className="h-8 text-xs w-full"
					onClick={handleFileSelect}
					title="Select audio file"
					aria-label="Select audio file"
				>
					{audioPath || "Choose audio file..."}
				</Button>
			</div>

			{/* Cleanup toggle */}
			<div className="flex items-center justify-between">
				<div className="space-y-0.5">
					<Label className="text-xs">Neural Cleanup</Label>
					<p className="text-xs text-muted-foreground/60">
						DeepFilterNet denoising before export
					</p>
				</div>
				<Switch
					checked={cleanup}
					onCheckedChange={setCleanup}
					aria-label="Enable neural cleanup"
				/>
			</div>

			<Button
				size="sm"
				className="h-9"
				disabled={!audioPath || exportMut.isPending}
				onClick={() => exportMut.mutate()}
				title={`Export as ${selectedPreset}`}
				aria-label={`Export as ${selectedPreset}`}
			>
				{exportMut.isPending ? (
					<Spinner size="md" className="mr-1.5" />
				) : (
					<Download className="size-4 mr-1.5" />
				)}
				{exportMut.isPending ? "Exporting..." : `Export as ${selectedPreset}`}
			</Button>
		</div>
	);
}
