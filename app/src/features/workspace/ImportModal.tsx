import { useState } from "react";
import { Button } from "@/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/ui/dialog";
import { Field, Input } from "@/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { Segmented } from "@/ui/controls";
import { showStudioErrorToast } from "@/lib/errors";
import { useToast } from "@/ui/use-toast";
import { apiClient } from "@/lib/api/client";

/**
 * Media import: audio file (with resample/channel/sanitize options)
 * or audio extracted from video. Reports probed format before import.
 */
export function ImportModal({
	open,
	onOpenChange,
	onImportComplete,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onImportComplete?: (audioPath: string) => void;
}) {
	const { toast } = useToast();
	const [mode, setMode] = useState<"audio" | "video">("audio");
	const [filePath, setFilePath] = useState("");
	const [sampleRate, setSampleRate] = useState(48000);
	const [channels, setChannels] = useState(1);
	const [sanitize, setSanitize] = useState(false);
	const [importing, setImporting] = useState(false);
	const [info, setInfo] = useState<{ duration: number; sample_rate: number; channels: number } | null>(null);

	const probe = async () => {
		if (!filePath.trim()) {
			return;
		}
		try {
			setInfo(await apiClient.getAudioInfo(filePath.trim()));
		} catch {
			setInfo(null);
		}
	};

	const run = async () => {
		if (!filePath.trim()) {
			return;
		}
		setImporting(true);
		try {
			const result =
				mode === "video"
					? await apiClient.extractAudioFromVideo(filePath.trim(), sampleRate, channels)
					: await apiClient.convertAudio(filePath.trim(), "wav", sampleRate, channels, sanitize);
			const audioPath = result.audio_path ?? result.output_path;
			if (!audioPath) {
				throw new Error("No audio path returned from import");
			}
			toast({ title: "Import complete", description: audioPath });
			onImportComplete?.(audioPath);
			onOpenChange(false);
		} catch (error: unknown) {
			showStudioErrorToast(error);
		} finally {
			setImporting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogTitle>Import media</DialogTitle>
				<DialogDescription>
					Bring audio (or a video&apos;s soundtrack) into the session.
				</DialogDescription>
				<div className="mt-2 flex flex-col gap-4">
					<Segmented
						label="Media kind"
						value={mode}
						onChange={setMode}
						options={[
							{ value: "audio", label: "Audio" },
							{ value: "video", label: "Video" },
						]}
					/>
					<Field label="File path" htmlFor="import-path">
						<Input
							id="import-path"
							value={filePath}
							onChange={(e) => setFilePath(e.target.value)}
							onBlur={probe}
							placeholder={mode === "video" ? "C:\\Videos\\interview.mp4" : "C:\\Audio\\recording.m4a"}
						/>
					</Field>
					{info ? (
						<p className="rounded-sm border border-border bg-sunken p-3 text-sm tabular-nums text-muted-foreground">
							Duration: {info.duration?.toFixed(1)}s · {info.sample_rate} Hz · {info.channels} ch
						</p>
					) : null}
					<div className="grid grid-cols-2 gap-4">
						<Field label="Sample rate" htmlFor="import-rate">
							<Select value={String(sampleRate)} onValueChange={(v) => setSampleRate(Number.parseInt(v, 10))}>
								<SelectTrigger id="import-rate">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="44100">44100 Hz</SelectItem>
									<SelectItem value="48000">48000 Hz</SelectItem>
									<SelectItem value="96000">96000 Hz</SelectItem>
								</SelectContent>
							</Select>
						</Field>
						<Field label="Channels" htmlFor="import-channels">
							<Select value={String(channels)} onValueChange={(v) => setChannels(Number.parseInt(v, 10))}>
								<SelectTrigger id="import-channels">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="1">Mono</SelectItem>
									<SelectItem value="2">Stereo</SelectItem>
								</SelectContent>
							</Select>
						</Field>
					</div>
					{mode === "audio" ? (
						<label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
							<input
								type="checkbox"
								checked={sanitize}
								onChange={(e) => setSanitize(e.target.checked)}
								className="size-4 cursor-pointer accent-primary"
							/>
							Sanitize audio (neural cleanup — loads DeepFilterNet on demand)
						</label>
					) : null}
					<div>
						<Button onClick={run} disabled={importing || !filePath.trim()} loading={importing} className="w-full">
							{importing ? "Importing…" : "Import"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
