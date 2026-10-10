import { ArrowUpTrayIcon as Upload } from "@heroicons/react/24/outline";
import { useCallback, useRef } from "react";
import { SpectrogramCanvas } from "@/features/workspace/spectrogram/SpectrogramCanvas";
import type { StudioTrack } from "./AudioStudioStore";
import { useAudioStudioStore } from "./AudioStudioStore";
import { AutomationOverlay } from "./AutomationOverlay";
import { CrossfadeCanvas } from "./CrossfadeCanvas";
import { MidiPianoRoll } from "./MidiPianoRoll";
import { PluginChainPanel } from "./PluginChainPanel";
import { WaveformCanvas } from "./WaveformCanvas";
import { STEM_HUE, STEM_LABEL } from "./stemColors";

export function TrackVisuals({
	track,
	showAutomation,
	showPlugins,
	channelsCount,
}: {
	track: StudioTrack;
	showAutomation: boolean;
	showPlugins: boolean;
	channelsCount: number;
}) {
	const setCurrentTime = useAudioStudioStore((s) => s.setCurrentTime);
	const containerRef = useRef<HTMLButtonElement>(null);
	const scale = track.expanded ? 2 : 1;

	const handleWaveformClick = useCallback(
		(e: React.MouseEvent) => {
			if (!track.duration || !containerRef.current) {
				return;
			}
			const rect = containerRef.current.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const ratio = Math.max(0, Math.min(1, x / rect.width));
			setCurrentTime(ratio * track.duration);
		},
		[track.duration, setCurrentTime],
	);

	return (
		<div className="flex-1 relative">
			{track.stem && (
				<span
					className="absolute top-0.5 right-1 z-10 rounded px-1 text-[9px] font-medium"
					style={{
						backgroundColor: `color-mix(in srgb, ${track.color} 13%, transparent)`,
						color: track.color,
					}}
					title={`Separated stem: ${STEM_LABEL[track.stem]}`}
				>
					{STEM_LABEL[track.stem]}
				</span>
			)}
			<button
				type="button"
				ref={containerRef}
				className="min-h-[52px] relative cursor-pointer w-full text-left p-0 bg-transparent border-0"
				onClick={handleWaveformClick}
				aria-label="Click to seek"
			>
				<WaveformCanvas
					peaks={track.waveformData}
					color={track.color}
					height={44 * scale}
					className="mt-0.5"
					channels={channelsCount}
				/>
				{track.midiNotes.length > 0 && (
					<MidiPianoRoll
						notes={track.midiNotes}
						height={32 * scale}
						className="mt-0.5"
					/>
				)}
				{showAutomation && (
					<AutomationOverlay
						track={track}
						height={16 * scale}
						className="mt-0.5"
					/>
				)}
				<CrossfadeCanvas track={track} height={12 * scale} className="mt-0.5" />
				{!track.audioUrl && track.midiNotes.length === 0 && (
					<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
						<span className="text-[10px] text-muted-foreground/30 flex items-center gap-1">
							<Upload className="size-3" />
							Import audio or record
						</span>
					</div>
				)}
			</button>
			{track.showSpectrogram && track.audioUrl && (
				<SpectrogramCanvas
					audioUrl={track.audioUrl}
					height={36 * scale}
					className="mt-0.5 mb-0.5"
					hueBase={track.stem ? STEM_HUE[track.stem] : undefined}
				/>
			)}
			{showPlugins && <PluginChainPanel track={track} />}
		</div>
	);
}
