import {
	MusicalNoteIcon as FileAudio,
	FilmIcon as Film,
	ArrowUpTrayIcon as Upload,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";

interface ImportModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onImportComplete?: (audioPath: string) => void;
}

export function ImportModal({
	open,
	onOpenChange,
	onImportComplete,
}: ImportModalProps) {
	const [mode, setMode] = useState<"audio" | "video">("audio");
	const [filePath, setFilePath] = useState("");
	const [sampleRate, setSampleRate] = useState(48000);
	const [channels, setChannels] = useState(1);
	const [importing, setImporting] = useState(false);
	const [sanitize, setSanitize] = useState(false);
	const [formatInfo, setFormatInfo] = useState<{
		duration: number;
		sample_rate: number;
		channels: number;
	} | null>(null);
	const { toast } = useToast();

	const handleInfo = async () => {
		if (!filePath) {
			return;
		}
		try {
			const info = await apiClient.getAudioInfo(filePath);
			setFormatInfo(info);
		} catch (_error) {
			setFormatInfo(null);
		}
	};

	const handleImport = async () => {
		if (!filePath) {
			return;
		}
		setImporting(true);
		try {
			let result: { audio_path?: string; output_path?: string };
			if (mode === "video") {
				result = await apiClient.extractAudioFromVideo(
					filePath,
					sampleRate,
					channels,
				);
			} else {
				// Use the ModelsMethods convertAudio which supports sampleRate, channels, sanitize
				result = await apiClient.convertAudio(
					filePath,
					"wav",
					sampleRate,
					channels,
					sanitize,
				);
			}
			const audioPath = result.audio_path ?? result.output_path;
			if (!audioPath) {
				throw new Error("No audio path returned from import");
			}
			toast({ title: "Import complete", description: audioPath });
			onImportComplete?.(audioPath);
			onOpenChange(false);
		} catch (error) {
			showStudioErrorToast(error);
		} finally {
			setImporting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[450px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Upload className="size-5" />
						Import Media
					</DialogTitle>
				</DialogHeader>

				<div className="space-y-4">
					<div className="flex gap-2">
						<Button
							variant={mode === "audio" ? "default" : "outline"}
							onClick={() => setMode("audio")}
							className="flex-1"
						>
							<FileAudio className="size-4 mr-2" /> Audio
						</Button>
						<Button
							variant={mode === "video" ? "default" : "outline"}
							onClick={() => setMode("video")}
							className="flex-1"
						>
							<Film className="size-4 mr-2" /> Video
						</Button>
					</div>

					<div className="space-y-2">
						<Label>File Path</Label>
						<Input
							value={filePath}
							onChange={(e) => setFilePath(e.target.value)}
							placeholder={
								mode === "video"
									? "C:Videosinterview.mp4"
									: "C:Audio\recording.m4a"
							}
							onBlur={handleInfo}
						/>
					</div>

					{formatInfo && (
						<div className="p-3 bg-muted rounded-md text-sm space-y-1">
							<p>Duration: {formatInfo.duration?.toFixed(1)}s</p>
							<p>Sample Rate: {formatInfo.sample_rate} Hz</p>
							<p>Channels: {formatInfo.channels}</p>
						</div>
					)}

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label>Sample Rate</Label>
							<Select
								value={String(sampleRate)}
								onValueChange={(v) => setSampleRate(parseInt(v, 10))}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="44100">44100 Hz</SelectItem>
									<SelectItem value="48000">48000 Hz</SelectItem>
									<SelectItem value="96000">96000 Hz</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label>Channels</Label>
							<Select
								value={String(channels)}
								onValueChange={(v) => setChannels(parseInt(v, 10))}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="1">Mono</SelectItem>
									<SelectItem value="2">Stereo</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					<label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
						<input
							type="checkbox"
							checked={sanitize}
							onChange={(e) => setSanitize(e.target.checked)}
							className="size-4"
						/>
						Sanitize audio (neural cleanup — loads DeepFilterNet on demand)
					</label>

					<Button
						onClick={handleImport}
						disabled={importing || !filePath}
						className="w-full"
					>
						{importing ? "Importing..." : "Import"}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
