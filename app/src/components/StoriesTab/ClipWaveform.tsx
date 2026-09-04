import { useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";
import { apiClient } from "@/lib/api/client";

// Clip waveform component with trim support
export function ClipWaveform({
	generationId,
	versionId,
	width,
	trimStartMs,
	trimEndMs,
	duration,
	onUnavailable,
}: {
	generationId: string;
	versionId?: string;
	width: number;
	trimStartMs: number;
	trimEndMs: number;
	duration: number;
	onUnavailable?: () => void;
}) {
	const waveformRef = useRef<HTMLDivElement>(null);
	const wavesurferRef = useRef<WaveSurfer | null>(null);

	// Calculate the full waveform width based on the original duration
	// The visible portion (width) represents the effective duration after trimming
	const effectiveDurationMs = duration * 1000 - trimStartMs - trimEndMs;
	const fullWaveformWidth =
		effectiveDurationMs > 0
			? (width / effectiveDurationMs) * (duration * 1000)
			: width;

	// Calculate how much to offset the waveform to hide the trimmed start
	const offsetX =
		effectiveDurationMs > 0
			? (trimStartMs / (duration * 1000)) * fullWaveformWidth
			: 0;

	useEffect(() => {
		if (!waveformRef.current || fullWaveformWidth < 20) {
			return;
		}

		// Get CSS colors
		const root = document.documentElement;
		const getCSSVar = (varName: string) => {
			const value = getComputedStyle(root).getPropertyValue(varName).trim();
			return value ? `hsl(${value})` : "";
		};

		const waveColor = getCSSVar("--accent-foreground");

		// Hand WaveSurfer a muted <audio> element so the MediaElement backend
		// can never bleed audio. Web Audio is doing the actual playback in
		// useStoryPlayback; this clip waveform exists purely for the visual.
		// Without this, long imported clips (MP3 / M4A) end up audible from
		// wavesurfer's own element on top of the timeline, and that element
		// doesn't get paused by stopAllSources().
		const mediaElement = document.createElement("audio");
		mediaElement.muted = true;
		mediaElement.preload = "metadata";

		const wavesurfer = WaveSurfer.create({
			container: waveformRef.current,
			media: mediaElement,
			waveColor,
			progressColor: waveColor,
			cursorWidth: 0,
			barWidth: 1,
			barRadius: 1,
			barGap: 1,
			height: 28,
			normalize: true,
			interact: false,
		});

		wavesurferRef.current = wavesurfer;

		const audioUrl = versionId
			? apiClient.getVersionAudioUrl(versionId)
			: apiClient.getAudioUrl(generationId);
		wavesurfer.load(audioUrl).catch((err) => {
			// A deleted/missing generation (or any load failure) resolves here.
			// Surface it to the parent so the clip shows a non-silent "Source
			// unavailable" state instead of a silently blank waveform.
			debug.warn("[stories] waveform load failed:", err);
			onUnavailable?.();
		});

		return () => {
			wavesurfer.destroy();
			wavesurferRef.current = null;
		};
	}, [generationId, versionId, fullWaveformWidth, onUnavailable]);

	return (
		<div className="w-full h-full opacity-60 overflow-hidden">
			{/* Inner container that holds the full waveform, offset to show only visible portion */}
			<div
				ref={waveformRef}
				style={{
					width: `${fullWaveformWidth}px`,
					transform: `translateX(-${offsetX}px)`,
				}}
				className="h-full"
			/>
		</div>
	);
}

import { debug } from "../../lib/utils/debug";
