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
	const groups = useAudioStudioStore((s) => s.groups);
	const showAutomation = useAudioStudioStore((s) => s.showAutomation);
	const pushUndo = useAudioStudioStore((s) => s.pushUndo);
	const assignTrackToGroup = useAudioStudioStore((s) => s.assignTrackToGroup);

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
		pushUndo(`Add volume keyframe at ${track.name}`);
		const currentTime = useAudioStudioStore.getState().currentTimeRef.current;
		const pts = [...(track.volumeAutomation ?? [])];
		pts.push({ time: currentTime, value: track.volume });
		updateTrack(track.id, { volumeAutomation: pts });
	};

	const addPanAutomationPoint = () => {
		pushUndo(`Add pan keyframe at ${track.name}`);
		const currentTime = useAudioStudioStore.getState().currentTimeRef.current;
		const pts = [...(track.panAutomation ?? [])];
		pts.push({ time: currentTime, value: track.pan });
		updateTrack(track.id, { panAutomation: pts });
	};

	const clearAutomation = () => {
		pushUndo(`Clear automation on ${track.name}`);
		updateTrack(track.id, { volumeAutomation: [], panAutomation: [] });
	};

	const otherTracks = tracks.filter((t) => t.id !== track.id);
	const channelsCount = track.channels;

	const wrappedAssignGroup = (trackId: string, groupId: string | null) => {
		pushUndo(`Assign ${track.name} to group`);
		assignTrackToGroup(trackId, groupId);
	};

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
			groups={groups}
			onMute={wrappedToggleMute}
			onSolo={wrappedToggleSolo}
			onVolume={wrappedSetVolume}
			onPan={wrappedSetPan}
			onAddAutomation={addAutomationPoint}
			onAddPanAutomation={addPanAutomationPoint}
			onClearAutomation={clearAutomation}
			updateTrack={updateTrack}
			removeTrack={removeTrack}
			pushUndo={pushUndo}
			onTranscribe={onTranscribe}
			onAssignGroup={wrappedAssignGroup}
		/>
	);
}
