import { ArrowDownTrayIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Badge, Label, Spinner } from "@/ui/primitives";
import { Progress } from "@/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { EmptyState, ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";

interface DownloadItem {
	task_id: string;
	file_path: string;
	title: string;
	duration: number;
	thumbnail: string;
	uploader: string;
	status: "idle" | "downloading" | "converting" | "completed" | "failed";
	progress: number;
	error?: string;
}

function extFromMime(mime: string): string {
	if (mime === "audio/mpeg") {
		return ".mp3";
	}
	if (mime === "audio/ogg") {
		return ".ogg";
	}
	if (mime === "audio/flac") {
		return ".flac";
	}
	if (mime === "video/mp4") {
		return ".mp4";
	}
	return ".wav";
}

export function YouTubeDownloadView() {
	const { toast } = useToast();
	const [url, setUrl] = useState("");
	const [downloads, setDownloads] = useState<DownloadItem[]>([]);
	const [outputFormat, setOutputFormat] = useState<"audio" | "video">("audio");
	const [audioFormat, setAudioFormat] = useState<"wav" | "mp3" | "flac">("wav");
	const intervalsRef = useRef(new Map<string, number>());

	useEffect(() => {
		const pending = intervalsRef.current;
		return () => {
			for (const handle of pending.values()) {
				window.clearInterval(handle);
			}
			pending.clear();
		};
	}, []);

	const downloadMutation = useMutation({
		mutationFn: (data: {
			url: string;
			output_format: string;
			audio_format: string;
		}) =>
			apiClient.startYoutubeDownload(
				data.url,
				data.output_format,
				data.audio_format,
			),
		onSuccess: (result) => {
			const item: DownloadItem = {
				task_id: result.task_id,
				file_path: result.file_path,
				title: result.title,
				duration: result.duration,
				thumbnail: result.thumbnail,
				uploader: result.uploader,
				status: "downloading",
				progress: 0,
			};
			setDownloads((prev) => [item, ...prev]);
			void pollProgress(result.task_id);
			toast({ title: "Download started" });
		},
		onError: (err: unknown) => showStudioErrorToast(err),
	});

	async function pollProgress(taskId: string) {
		const handle = window.setInterval(async () => {
			try {
				const progress = await apiClient.getYoutubeProgress(taskId);
				setDownloads((prev) =>
					prev.map((d) =>
						d.task_id === taskId
							? {
									...d,
									status: progress.status as DownloadItem["status"],
									progress: progress.percent,
									error: progress.error || d.error,
								}
							: d,
					),
				);
				if (progress.status === "completed" || progress.status === "failed") {
					window.clearInterval(handle);
					intervalsRef.current.delete(taskId);
				}
			} catch {
				window.clearInterval(handle);
				intervalsRef.current.delete(taskId);
			}
		}, 1000);
		intervalsRef.current.set(taskId, handle);
	}

	function handleDownload() {
		if (!url.trim()) {
			return;
		}
		downloadMutation.mutate({
			url: url.trim(),
			output_format: outputFormat,
			audio_format: audioFormat,
		});
	}

	function removeDownload(taskId: string) {
		const handle = intervalsRef.current.get(taskId);
		if (handle !== undefined) {
			window.clearInterval(handle);
			intervalsRef.current.delete(taskId);
		}
		setDownloads((prev) => prev.filter((d) => d.task_id !== taskId));
	}

	async function sendToCaptures(item: DownloadItem) {
		try {
			const blob = await apiClient.getYoutubeFile(item.task_id);
			const ext = extFromMime(blob.type);
			const file = new File([blob], `${item.title}${ext}`, {
				type: blob.type,
			});
			await apiClient.createCapture(file, { source: "file" });
			toast({ title: "Sent to Captures" });
		} catch (err) {
			showStudioErrorToast(err);
		}
	}

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader title="Download from URL" />

			<div className="flex max-w-4xl gap-2">
				<Input
					value={url}
					onChange={(e) => setUrl(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							handleDownload();
						}
					}}
					placeholder="Paste a video or audio page URL"
					className="h-9 flex-1 text-xs"
					aria-label="Media page URL"
				/>
				<Button
					type="button"
					disabled={!url.trim() || downloadMutation.isPending}
					title="Start download"
					aria-label="Start download"
					onClick={handleDownload}
				>
					{downloadMutation.isPending ? (
						<Spinner size="xs" className="mr-1.5" />
					) : (
						<ArrowDownTrayIcon className="mr-1.5 size-4" aria-hidden="true" />
					)}
					{downloadMutation.isPending ? "Starting…" : "Download"}
				</Button>
			</div>

			<fieldset
				className="m-0 flex min-w-0 flex-wrap items-center gap-2 border-0 p-0"
				aria-label="Output format"
			>
				{(["audio", "video"] as const).map((f) => (
					<button
						key={f}
						type="button"
						aria-pressed={outputFormat === f}
						className={cn(
							"rounded-md px-3 py-1.5 text-xs capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							outputFormat === f
								? "bg-primary text-primary-foreground"
								: "bg-secondary text-muted-foreground hover:text-foreground",
						)}
						onClick={() => setOutputFormat(f)}
					>
						{f}
					</button>
				))}
				{outputFormat === "audio" ? (
					<Select
						value={audioFormat}
						onValueChange={(v) => setAudioFormat(v as "wav" | "mp3" | "flac")}
					>
						<SelectTrigger
							className="h-8 w-40 text-xs"
							aria-label="Audio format"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="wav">WAV (Lossless)</SelectItem>
							<SelectItem value="mp3">MP3 (Compressed)</SelectItem>
							<SelectItem value="flac">FLAC (Lossless)</SelectItem>
						</SelectContent>
					</Select>
				) : null}
			</fieldset>

			{downloads.length === 0 ? (
				<EmptyState
					title="No downloads yet"
					body="Paste a URL above to download audio or video."
				/>
			) : (
				<div className="max-w-4xl space-y-2">
					<Label>
						Downloads{" "}
						<span className="text-muted-foreground">({downloads.length})</span>
					</Label>
					{downloads.map((item) => (
						<div
							key={item.task_id}
							className="flex items-center gap-3 rounded-md border border-border bg-card p-3"
						>
							{item.thumbnail ? (
								<img
									src={item.thumbnail}
									alt=""
									className="h-12 w-16 shrink-0 rounded-sm object-cover"
								/>
							) : null}
							<div className="min-w-0 flex-1">
								<p
									className="truncate text-xs font-medium text-foreground"
									title={item.title}
								>
									{item.title}
								</p>
								<p className="truncate text-xs text-muted-foreground">
									{item.uploader}
								</p>
								{item.status === "downloading" ||
								item.status === "converting" ? (
									<div className="mt-2 flex items-center gap-2">
										<Progress
											value={item.progress}
											className="h-1.5 flex-1"
											label={`${item.title} ${item.status} progress`}
										/>
										<span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
											{Math.round(item.progress)}%
										</span>
									</div>
								) : null}
								{item.status === "completed" ? (
									<Badge tone="success" className="mt-1">
										Download complete
									</Badge>
								) : null}
								{item.status === "failed" ? (
									<Badge tone="danger" className="mt-1">
										{item.error || "Download failed"}
									</Badge>
								) : null}
							</div>
							<div className="flex shrink-0 gap-1">
								{item.status === "completed" ? (
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="h-8 px-2 text-xs"
										title="Send to Captures"
										aria-label={`Send ${item.title} to Captures`}
										onClick={() => void sendToCaptures(item)}
									>
										To Captures
									</Button>
								) : null}
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-8 px-2 text-xs text-destructive hover:text-destructive"
									title="Remove"
									aria-label={`Remove ${item.title}`}
									onClick={() => removeDownload(item.task_id)}
								>
									<TrashIcon className="size-3.5" aria-hidden="true" />
								</Button>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
