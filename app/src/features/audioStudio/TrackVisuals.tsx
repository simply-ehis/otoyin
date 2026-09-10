import { ArrowUpTrayIcon as Upload } from "@heroicons/react/24/outline";
import { SpectrogramCanvas } from "@/features/workspace/spectrogram/SpectrogramCanvas";
import type { StudioTrack } from "./AudioStudioStore";
import { AutomationOverlay } from "./AutomationOverlay";
import { CrossfadeCanvas } from "./CrossfadeCanvas";
import { MidiPianoRoll } from "./MidiPianoRoll";
import { PluginChainPanel } from "./PluginChainPanel";
import { WaveformCanvas } from "./WaveformCanvas";

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
	return (
		<div className="flex-1 relative">
			<div className="min-h-[52px] relative">
				<WaveformCanvas
					peaks={track.waveformData}
					color={track.color}
					height={44}
					className="mt-0.5"
					channels={channelsCount}
				/>
				{track.midiNotes.length > 0 && (
					<MidiPianoRoll
						notes={track.midiNotes}
						height={32}
						className="mt-0.5"
					/>
				)}
				{showAutomation && (
					<AutomationOverlay track={track} height={16} className="mt-0.5" />
				)}
				<CrossfadeCanvas track={track} height={12} className="mt-0.5" />
				{!track.audioUrl && track.midiNotes.length === 0 && (
					<div className="absolute inset-0 flex items-center justify-center top-0">
						<span className="text-[10px] text-muted-foreground/30 flex items-center gap-1">
							<Upload className="size-3" />
							Import audio or record
						</span>
					</div>
				)}
			</div>
			{track.showSpectrogram && track.audioUrl && (
				<SpectrogramCanvas
					audioUrl={track.audioUrl}
					height={36}
					className="mt-0.5 mb-0.5"
				/>
			)}
			{showPlugins && <PluginChainPanel track={track} />}
		</div>
	);
}
