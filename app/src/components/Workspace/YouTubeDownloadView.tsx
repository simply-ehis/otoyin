import {
	ArrowDownTrayIcon,
	PlayIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";

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

const EXT_MAP: Record<string, string> = {
	"audio/wav": ".wav",
	"audio/mpeg": ".mp3",
	"audio/ogg": ".ogg",
	"audio/flac": ".flac",
	"video/mp4": ".mp4",
};

function extFromMime(mime: string): string {
	return EXT_MAP[mime] || ".wav";
}

export function YouTubeDownloadView() {
	const [url, setUrl] = useState("");
	const [downloads, setDownloads] = useState<DownloadItem[]>([]);
	const [outputFormat, setOutputFormat] = useState<"audio" | "video">("audio");
	const [audioFormat, setAudioFormat] = useState<"wav" | "mp3" | "flac">("wav");
	const intervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(
		new Map(),
	);

	// Cleanup all polling intervals on unmount
	useEffect(() => {
		return () => {
			for (const interval of intervalsRef.current.values()) {
				clearInterval(interval);
			}
			intervalsRef.current.clear();
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
			pollProgress(result.task_id);
		},
	});

	const pollProgress = async (taskId: string) => {
		const interval = setInterval(async () => {
			try {
				const progress = await apiClient.getYoutubeProgress(taskId);
				setDownloads((prev) =>
					prev.map((d) =>
						d.task_id === taskId
							? {
									...d,
									status: progress.status as DownloadItem["status"],
									progress: progress.percent,
								}
							: d,
					),
				);
				if (progress.status === "completed" || progress.status === "failed") {
					clearInterval(interval);
					intervalsRef.current.delete(taskId);
				}
			} catch {
				clearInterval(interval);
				intervalsRef.current.delete(taskId);
			}
		}, 1000);
		intervalsRef.current.set(taskId, interval);
	};

	const handleDownload = () => {
		if (!url.trim()) {
			return;
		}
		downloadMutation.mutate({
			url: url.trim(),
			output_format: outputFormat,
			audio_format: audioFormat,
		});
	};

	const removeDownload = (taskId: string) => {
		const interval = intervalsRef.current.get(taskId);
		if (interval) {
			clearInterval(interval);
			intervalsRef.current.delete(taskId);
		}
		setDownloads((prev) => prev.filter((d) => d.task_id !== taskId));
	};

	return (
		<div className="flex flex-col h-full">
			<div className="px-6 py-4 border-b border-border">
				<h2 className="text-lg font-semibold">Download from URL</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Import audio/video from YouTube, SoundCloud, Vimeo, and 1000+ sites
				</p>
			</div>

			<div className="p-6 space-y-6">
				{/* URL Input */}
				<div className="flex gap-3">
					<input
						type="text"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && handleDownload()}
						placeholder="Paste YouTube, SoundCloud, Vimeo URL"
						className="flex-1 px-4 py-3 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
					/>
					<button
						type="button"
						onClick={handleDownload}
						disabled={!url.trim() || downloadMutation.isPending}
						className="flex items-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
					>
						<ArrowDownTrayIcon className="size-4" />
						{downloadMutation.isPending ? "Starting..." : "Download"}
					</button>
				</div>

				{/* Format Options */}
				<div className="flex gap-4 items-center">
					<div className="flex gap-2">
						<button
							type="button"
							onClick={() => setOutputFormat("audio")}
							className={`px-3 py-1.5 text-xs rounded-md ${
								outputFormat === "audio"
									? "bg-primary text-primary-foreground"
									: "bg-muted text-muted-foreground hover:text-foreground"
							}`}
						>
							Audio
						</button>
						<button
							type="button"
							onClick={() => setOutputFormat("video")}
							className={`px-3 py-1.5 text-xs rounded-md ${
								outputFormat === "video"
									? "bg-primary text-primary-foreground"
									: "bg-muted text-muted-foreground hover:text-foreground"
							}`}
						>
							Video
						</button>
					</div>

					{outputFormat === "audio" && (
						<select
							value={audioFormat}
							onChange={(e) =>
								setAudioFormat(e.target.value as "wav" | "mp3" | "flac")
							}
							className="px-3 py-1.5 text-xs bg-background border border-border rounded-md"
						>
							<option value="wav">WAV (Lossless)</option>
							<option value="mp3">MP3 (Compressed)</option>
							<option value="flac">FLAC (Lossless)</option>
						</select>
					)}
				</div>

				{/* Downloads List */}
				{downloads.length > 0 && (
					<div className="space-y-3">
						<h3 className="text-sm font-medium text-muted-foreground">
							Downloads
						</h3>
						{downloads.map((item) => (
							<div
								key={item.task_id}
								className="flex items-center gap-4 p-4 bg-card border border-border rounded-lg"
							>
								{item.thumbnail && (
									<img
										src={item.thumbnail}
										alt=""
										className="w-16 h-12 object-cover rounded"
									/>
								)}
								<div className="flex-1 min-w-0">
									<p className="text-sm font-medium truncate">{item.title}</p>
									<p className="text-xs text-muted-foreground">
										{item.uploader}
									</p>
									{item.status === "downloading" && (
										<div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
											<div
												className="h-full bg-primary transition-[width]"
												style={{ width: `${item.progress}%` }}
											/>
										</div>
									)}
									{item.status === "completed" && (
										<p className="text-xs text-green-500 mt-1">
											Download complete
										</p>
									)}
									{item.status === "failed" && (
										<p className="text-xs text-red-500 mt-1">
											{item.error || "Download failed"}
										</p>
									)}
								</div>
								<div className="flex gap-2">
									{item.status === "completed" && (
										<button
											type="button"
											onClick={async () => {
												try {
													const blob = await apiClient.getYoutubeFile(
														item.task_id,
													);
													const ext = extFromMime(blob.type);
													const file = new File([blob], `${item.title}${ext}`, {
														type: blob.type,
													});
													await apiClient.createCapture(file, {
														source: "file",
													});
												} catch (err) {
													console.error("Send to captures failed:", err);
												}
											}}
											className="p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
											title="Send to Captures"
										>
											<PlayIcon className="size-4" />
										</button>
									)}
									<button
										type="button"
										onClick={() => removeDownload(item.task_id)}
										className="p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
										title="Remove"
									>
										<TrashIcon className="size-4" />
									</button>
								</div>
							</div>
						))}
					</div>
				)}

				{/* Empty state */}
				{downloads.length === 0 && (
					<div className="text-center py-12 text-muted-foreground">
						<ArrowDownTrayIcon className="size-12 mx-auto mb-4 opacity-30" />
						<p className="text-sm">
							Paste a URL above to download audio or video
						</p>
						<p className="text-xs mt-1">
							Supports YouTube, SoundCloud, Vimeo, and 1000+ other sites
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
