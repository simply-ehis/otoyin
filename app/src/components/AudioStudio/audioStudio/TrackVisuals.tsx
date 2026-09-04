import { SpectrogramCanvas } from "@/components/Spectrogram/SpectrogramCanvas";
import type { StudioTrack } from "../AudioStudioStore";
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
			<div className="min-h-[68px] relative">
				<WaveformCanvas
					peaks={track.waveformData}
					color={track.color}
					height={60}
					className="mt-1"
					channels={channelsCount}
				/>
				{track.midiNotes.length > 0 && (
					<MidiPianoRoll
						notes={track.midiNotes}
						height={40}
						className="mt-0.5"
					/>
				)}
				{showAutomation && (
					<AutomationOverlay track={track} height={20} className="mt-0.5" />
				)}
				<CrossfadeCanvas track={track} height={16} className="mt-0.5" />
				{!track.audioUrl && track.midiNotes.length === 0 && (
					<div className="absolute inset-0 flex items-center justify-center top-0">
						<span className="text-xs text-muted-foreground/30">
							Empty track
						</span>
					</div>
				)}
			</div>
			{track.showSpectrogram && track.audioUrl && (
				<SpectrogramCanvas
					audioUrl={track.audioUrl}
					height={48}
					className="mt-0.5 mb-1"
				/>
			)}
			{showPlugins && <PluginChainPanel track={track} />}
		</div>
	);
}
