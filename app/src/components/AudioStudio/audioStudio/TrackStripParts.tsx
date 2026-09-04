import {
	Bars3Icon as GripVertical,
	TrashIcon as Trash2,
} from "@heroicons/react/24/outline";
import type { StudioTrack } from "../AudioStudioStore";
import { TrackControlsColumn } from "./TrackControls";
import { TrackVisuals } from "./TrackVisuals";

// Re-export controls/visuals for backward compat
export {
	TrackControlsColumn,
	TrackCrossfadeControls,
	TrackIdentity,
	TrackMuteSolo,
	TrackPan,
	TrackToolButtons,
} from "./TrackControls";
export { TrackVisuals } from "./TrackVisuals";

export function TrackRow({
	track,
	dragHandleProps,
	showAutomation,
	showPlugins,
	setShowPlugins,
	showCrossfade,
	setShowCrossfade,
	otherTracks,
	channelsCount,
	trackAnalysers,
	onMute,
	onSolo,
	onVolume,
	onPan,
	onAddAutomation,
	onClearAutomation,
	updateTrack,
	removeTrack,
	pushUndo,
	onTranscribe,
}: {
	track: StudioTrack;
	dragHandleProps: Record<string, unknown>;
	showAutomation: boolean;
	showPlugins: boolean;
	setShowPlugins: (v: boolean) => void;
	showCrossfade: boolean;
	setShowCrossfade: (v: boolean) => void;
	otherTracks: StudioTrack[];
	channelsCount: number;
	trackAnalysers: Map<string, AnalyserNode>;
	onMute: () => void;
	onSolo: () => void;
	onVolume: (v: number) => void;
	onPan: (pan: number) => void;
	onAddAutomation: () => void;
	onClearAutomation: () => void;
	updateTrack: (id: string, patch: Partial<StudioTrack>) => void;
	removeTrack: (id: string) => void;
	pushUndo: (label: string) => void;
	onTranscribe: () => void;
}) {
	return (
		<div className="flex items-stretch gap-0">
			<button
				type="button"
				{...dragHandleProps}
				aria-label="Drag to reorder track"
				className="flex items-center justify-center w-5 shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/20 hover:text-muted-foreground/50 p-0 bg-transparent border-0"
			>
				<GripVertical className="h-3.5 w-3.5" />
			</button>
			<TrackControlsColumn
				track={track}
				showAutomation={showAutomation}
				showPlugins={showPlugins}
				setShowPlugins={setShowPlugins}
				showCrossfade={showCrossfade}
				setShowCrossfade={setShowCrossfade}
				otherTracks={otherTracks}
				channelsCount={channelsCount}
				trackAnalysers={trackAnalysers}
				onMute={onMute}
				onSolo={onSolo}
				onVolume={onVolume}
				onPan={onPan}
				onAddAutomation={onAddAutomation}
				onClearAutomation={onClearAutomation}
				updateTrack={updateTrack}
				onTranscribe={onTranscribe}
			/>
			<TrackVisuals
				track={track}
				showAutomation={showAutomation}
				showPlugins={showPlugins}
				channelsCount={channelsCount}
			/>
			<button
				type="button"
				className="p-1 text-destructive/60 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity self-start mt-2 mr-1"
				onClick={() => {
					pushUndo(`Remove ${track.name}`);
					removeTrack(track.id);
				}}
				title="Remove track"
			>
				<Trash2 className="h-3.5 w-3.5" />
			</button>
		</div>
	);
}
