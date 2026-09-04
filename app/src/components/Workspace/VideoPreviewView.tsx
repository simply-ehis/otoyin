import {
	FilmIcon as Film,
	FolderOpenIcon as FolderOpen,
	PaperAirplaneIcon as Send,
} from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { useAudioStudioStore } from "@/components/AudioStudio/AudioStudioStore";
import { MonitorPicker } from "@/components/AudioStudio/MonitorPicker";
import { TransportBar } from "@/components/AudioStudio/TransportBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import { useAudioBus } from "@/lib/audio/audioBus";
import { registerVideoSource } from "@/lib/audio/sources";
import { showStudioErrorToast } from "@/lib/errors";
import { useServerStore } from "@/stores/serverStore";

function videoPreviewUrl(serverUrl: string, path: string): string {
	return `${serverUrl}/import/video-preview?file_path=${encodeURIComponent(path)}`;
}

export function VideoPreviewView() {
	const { toast } = useToast();
	const serverUrl = useServerStore((s) => s.serverUrl);
	const addTrack = useAudioStudioStore((s) => s.addTrack);
	const setTrackAudio = useAudioStudioStore((s) => s.setTrackAudio);
	const setMonitorSource = useAudioBus((s) => s.setMonitorSource);

	const [videoPath, setVideoPath] = useState("");
	const [extracting, setExtracting] = useState(false);
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const sourceIdRef = useRef<string | null>(null);

	const [objectUrl, setObjectUrl] = useState<string>("");

	useEffect(() => {
		if (!videoPath) {
			setObjectUrl("");
			return;
		}
		const url = videoPreviewUrl(serverUrl, videoPath);
		setObjectUrl(url);
		return () => {
			// Clean up previous object URL if it was a blob URL
			if (url.startsWith("blob:")) {
				URL.revokeObjectURL(url);
			}
		};
	}, [videoPath, serverUrl]);

	useEffect(() => {
		const el = videoRef.current;
		if (!el || !objectUrl) {
			return;
		}
		const registered = registerVideoSource(el, {
			label: `Video: ${videoPath.split(/[\\/]/).pop()}`,
		});
		if (registered) {
			sourceIdRef.current = registered.id;
			setMonitorSource(registered.id);
		}
		return () => {
			if (registered) {
				registered.unregister();
			}
			sourceIdRef.current = null;
		};
	}, [objectUrl, videoPath, setMonitorSource]);

	const handleExtract = async () => {
		if (!videoPath) {
			return;
		}
		setExtracting(true);
		try {
			const result = await apiClient.extractAudioFromVideo(videoPath, 48000, 2);
			const audioPath: string = result.audio_path;
			const res = await fetch(
				`${serverUrl}/import/audio-preview?file_path=${encodeURIComponent(audioPath)}`,
			);
			if (!res.ok) {
				throw new Error("Failed to fetch extracted audio");
			}
			const blob = await res.blob();
			const meta = await apiClient.getAudioInfo(audioPath);
			const trackId = addTrack(
				`Video audio: ${videoPath.split(/[\\/]/).pop()}`,
			);
			setTrackAudio(
				trackId,
				URL.createObjectURL(blob),
				blob,
				meta.duration ?? 0,
			);
			toast({
				title: "Sent to Audio Studio",
				description: "Video audio added as a new track.",
			});
		} catch (error) {
			showStudioErrorToast(error);
		} finally {
			setExtracting(false);
		}
	};

	async function handleBrowse() {
		const win = window as Window & {
			showOpenFilePicker?: (opts?: {
				types?: { description: string; accept: Record<string, string[]> }[];
				multiple?: boolean;
			}) => Promise<{ getFile: () => Promise<{ name: string }> }[]>;
		};
		if (win.showOpenFilePicker) {
			try {
				const [handle] = await win.showOpenFilePicker({
					types: [
						{
							description: "Video files",
							accept: {
								"video/*": [".mp4", ".mkv", ".avi", ".mov", ".webm"],
							},
						},
					],
					multiple: false,
				});
				const file = await handle.getFile();
				setVideoPath(file.name);
			} catch {
				// User cancelled picker — do nothing
			}
		} else {
			inputRef.current?.focus();
		}
	}

	return (
		<div className="p-6 max-w-5xl mx-auto space-y-4">
			<div className="flex items-center gap-2">
				<Film className="size-5 text-rose-400" />
				<h1 className="text-lg font-semibold">Video Preview</h1>
			</div>

			<div className="space-y-2">
				<Label htmlFor="video-path">Video File Path</Label>
				<div className="flex gap-2">
					<Input
						id="video-path"
						ref={inputRef}
						value={videoPath}
						onChange={(e) => setVideoPath(e.target.value)}
						placeholder="C:\Videos\interview.mp4"
					/>
					<Button
						variant="outline"
						title="Browse (paste server-accessible path)"
						onClick={handleBrowse}
					>
						<FolderOpen className="size-4" />
					</Button>
				</div>
			</div>

			{objectUrl && (
				<div className="rounded-lg overflow-hidden border border-border bg-black aspect-video">
					{/* biome-ignore lint/a11y/useMediaCaption: short video-preview clips have no caption track */}
					<video
						ref={videoRef}
						src={objectUrl}
						controls
						className="w-full h-full"
						crossOrigin="anonymous"
					/>
				</div>
			)}

			{objectUrl && (
				<TransportBar
					media={videoRef.current}
					label="Video"
					onCancel={() => videoRef.current?.pause()}
				/>
			)}

			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<MonitorPicker title="Monitor this video" allowedKinds={["video"]} />
				<div className="flex flex-col gap-2 justify-center">
					<Button
						onClick={handleExtract}
						disabled={!videoPath || extracting}
						className="w-full"
					>
						<Send className="size-4 mr-2" />
						{extracting ? "Extracting…" : "Extract audio to Audio Studio"}
					</Button>
					<p className="text-xs text-muted-foreground">
						Strips the video's audio track and drops it into Audio Studio as a
						new track.
					</p>
				</div>
			</div>
		</div>
	);
}
