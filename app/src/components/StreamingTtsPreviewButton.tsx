import { PlayIcon, StopIcon } from "@heroicons/react/24/outline";
import { useStreamingTtsPreview } from "@/lib/hooks/useStreamingTtsPreview";
import { Button } from "@/ui/button";

export interface StreamingTtsPreviewButtonProps {
	text: string;
	voice: string;
	language?: string;
	label?: string;
	size?: "sm" | "md" | "lg";
	disabled?: boolean;
}

/**
 * Drop-in button for streaming TTS preview with audio playback.
 * Shows play/stop toggle with progress indicator.
 */
export function StreamingTtsPreviewButton({
	text,
	voice,
	language = "en",
	label = "Preview",
	size = "sm",
	disabled = false,
}: StreamingTtsPreviewButtonProps) {
	const preview = useStreamingTtsPreview();
	const { isPlaying, progress } = preview.state;

	const handleClick = () => {
		if (isPlaying) {
			preview.stop();
		} else {
			preview.play(text, voice, language);
		}
	};

	return (
		<Button
			size={size}
			variant="outline"
			onClick={handleClick}
			disabled={disabled || !text.trim()}
		>
			{isPlaying ? (
				<>
					<StopIcon className="size-4" />
					{progress < 100 ? `${progress}%` : "Stop"}
				</>
			) : (
				<>
					<PlayIcon className="size-4" />
					{label}
				</>
			)}
		</Button>
	);
}
