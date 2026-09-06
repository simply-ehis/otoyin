import { FolderOpenIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { useAudioStudioStore } from "@/features/audioStudio/AudioStudioStore";
import { MonitorPicker } from "@/features/audioStudio/MonitorPicker";
import { TransportBar } from "@/features/audioStudio/TransportBar";
import { apiClient } from "@/lib/api/client";
import { useAudioBus } from "@/lib/audio/audioBus";
import { registerVideoSource } from "@/lib/audio/sources";
import { showStudioErrorToast } from "@/lib/errors";
import { useServerStore } from "@/stores/serverStore";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label, Spinner } from "@/ui/primitives";
import { ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";

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
	const [objectUrl, setObjectUrl] = useState("");

	useEffect(() => {
		if (!videoPath) {
			setObjectUrl("");
			return;
		}
		const url = videoPreviewUrl(serverUrl, videoPath);
		setObjectUrl(url);
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
			setMonitorSource(registered.id);
		}
		return () => {
			registered?.unregister();
		};
	}, [objectUrl, videoPath, setMonitorSource]);

	async function handleExtract() {
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
	}

	function handleBrowse() {
		inputRef.current?.focus();
		inputRef.current?.select();
	}

	return (
		<div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader
				title="Video Preview"
				description="Preview video and extract its audio to the studio"
			/>

			<div className="space-y-1">
				<Label htmlFor="video-path">Video file path (on the server)</Label>
				<div className="flex gap-2">
					<Input
						id="video-path"
						ref={inputRef}
						value={videoPath}
						onChange={(e) => setVideoPath(e.target.value)}
						placeholder="C:\Videos\interview.mp4"
						className="h-8 flex-1 text-xs"
					/>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-8 px-2"
						title="Focus the path field to paste a server-accessible path"
						aria-label="Focus path field"
						onClick={handleBrowse}
					>
						<FolderOpenIcon className="size-4" aria-hidden="true" />
					</Button>
				</div>
			</div>

			{objectUrl ? (
				<div className="overflow-hidden rounded-md border border-border bg-black">
					{/* biome-ignore lint/a11y/useMediaCaption: user-provided video preview, no caption track */}
					<video
						ref={videoRef}
						src={objectUrl}
						controls
						className="aspect-video h-auto w-full"
						crossOrigin="anonymous"
					/>
				</div>
			) : null}

			{objectUrl ? (
				<TransportBar
					media={videoRef.current}
					label="Video"
					onCancel={() => videoRef.current?.pause()}
				/>
			) : null}

			<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
				<MonitorPicker title="Monitor this video" allowedKinds={["video"]} />
				<div className="flex flex-col justify-center gap-2">
					<Button
						type="button"
						disabled={!videoPath || extracting}
						title="Extract audio to Audio Studio"
						aria-label="Extract audio to Audio Studio"
						onClick={() => void handleExtract()}
					>
						{extracting ? <Spinner size="xs" className="mr-2" /> : null}
						{extracting ? "Extracting…" : "Extract audio to Audio Studio"}
					</Button>
					<p className="text-xs text-muted-foreground">
						Strips the video&apos;s audio track and drops it into Audio Studio
						as a new track.
					</p>
				</div>
			</div>
		</div>
	);
}
