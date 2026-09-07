import { useState } from "react";
import { type StudioTrack, useAudioStudioStore } from "./AudioStudioStore";
import { TrackRow } from "./TrackStripParts";
export function TrackStripInner({
	track,
	index: _index,
	dragHandleProps,
	trackAnalysers,
	onTranscribe,
}: {
	track: StudioTrack;
	index: number;
	dragHandleProps: Record<string, unknown>;
	trackAnalysers: Map<string, AnalyserNode>;
	onTranscribe: () => void;
}) {
	const [showPlugins, setShowPlugins] = useState(false);
	const [showCrossfade, setShowCrossfade] = useState(false);
	const removeTrack = useAudioStudioStore((s) => s.removeTrack);
	const toggleMute = useAudioStudioStore((s) => s.toggleMute);
	const toggleSolo = useAudioStudioStore((s) => s.toggleSolo);
	const setVolume = useAudioStudioStore((s) => s.setVolume);
	const setPan = useAudioStudioStore((s) => s.setPan);
	const updateTrack = useAudioStudioStore((s) => s.updateTrack);
	const tracks = useAudioStudioStore((s) => s.tracks);
	const showAutomation = useAudioStudioStore((s) => s.showAutomation);
	const pushUndo = useAudioStudioStore((s) => s.pushUndo);

	const wrappedSetVolume = (v: number) => {
		pushUndo(`Set ${track.name} volume`);
		setVolume(track.id, v);
	};

	const wrappedSetPan = (pan: number) => {
		pushUndo(`Set ${track.name} pan`);
		setPan(track.id, pan);
	};

	const wrappedToggleMute = () => {
		pushUndo(`Toggle ${track.name} mute`);
		toggleMute(track.id);
	};

	const wrappedToggleSolo = () => {
		pushUndo(`Toggle ${track.name} solo`);
		toggleSolo(track.id);
	};

	const addAutomationPoint = () => {
		const currentTime = useAudioStudioStore.getState().currentTimeRef.current;
		const pts = [...(track.volumeAutomation ?? [])];
		pts.push({ time: currentTime, value: track.volume });
		updateTrack(track.id, { volumeAutomation: pts });
	};

	const clearAutomation = () => {
		updateTrack(track.id, { volumeAutomation: [] });
	};

	const otherTracks = tracks.filter((t) => t.id !== track.id);
	const channelsCount = track.channels;

	return (
		<TrackRow
			track={track}
			dragHandleProps={dragHandleProps}
			showAutomation={showAutomation}
			showPlugins={showPlugins}
			setShowPlugins={setShowPlugins}
			showCrossfade={showCrossfade}
			setShowCrossfade={setShowCrossfade}
			otherTracks={otherTracks}
			channelsCount={channelsCount}
			trackAnalysers={trackAnalysers}
			onMute={wrappedToggleMute}
			onSolo={wrappedToggleSolo}
			onVolume={wrappedSetVolume}
			onPan={wrappedSetPan}
			onAddAutomation={addAutomationPoint}
			onClearAutomation={clearAutomation}
			updateTrack={updateTrack}
			removeTrack={removeTrack}
			pushUndo={pushUndo}
			onTranscribe={onTranscribe}
		/>
	);
}
