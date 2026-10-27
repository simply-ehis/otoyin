import { PauseIcon, PlayIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { useFloatingVideoStore } from "@/stores/floatingVideoStore";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";

export function FloatingVideoPlayer() {
	const url = useFloatingVideoStore((s) => s.url);
	const visible = useFloatingVideoStore((s) => s.visible);
	const hide = useFloatingVideoStore((s) => s.hide);
	const clear = useFloatingVideoStore((s) => s.clear);

	const videoRef = useRef<HTMLVideoElement | null>(null);
	const [playing, setPlaying] = useState(false);
	const [pos, setPos] = useState({ x: 24, y: 24 });

	useEffect(() => {
		const el = videoRef.current;
		if (!el || !url) return;
		el.src = url;
		void el.play().catch(() => setPlaying(false));
		const onPlay = () => setPlaying(true);
		const onPause = () => setPlaying(false);
		el.addEventListener("play", onPlay);
		el.addEventListener("pause", onPause);
		return () => {
			el.removeEventListener("play", onPlay);
			el.removeEventListener("pause", onPause);
		};
	}, [url]);

	if (!visible || !url) return null;

	return (
		<div
			className="fixed z-50 overflow-hidden rounded-lg border border-border bg-black shadow-2xl"
			style={{ right: pos.x, bottom: pos.y, width: 320 }}
		>
			<div className="flex items-center justify-between bg-card/80 px-2 py-1">
				<span className="text-xs font-medium text-foreground">Video</span>
				<div className="flex items-center gap-1">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-6 w-6 p-0"
						aria-label={playing ? "Pause" : "Play"}
						onClick={() => {
							const el = videoRef.current;
							if (!el) return;
							if (el.paused) void el.play();
							else el.pause();
						}}
					>
						{playing ? (
							<PauseIcon className="size-3.5" aria-hidden="true" />
						) : (
							<PlayIcon className="size-3.5" aria-hidden="true" />
						)}
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-6 w-6 p-0"
						aria-label="Close"
						onClick={() => {
							clear();
						}}
					>
						<XMarkIcon className="size-3.5" aria-hidden="true" />
					</Button>
				</div>
			</div>
			{/* biome-ignore lint/a11y/useMediaCaption: user-provided preview */}
			<video
				ref={videoRef}
				className="aspect-video w-full bg-black"
				controls={false}
				crossOrigin="anonymous"
			/>
		</div>
	);
}