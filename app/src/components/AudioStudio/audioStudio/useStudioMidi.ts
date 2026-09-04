import { useCallback } from "react";
import type { StudioTrack } from "../AudioStudioStore";

export function useStudioMidi(
	tracks: StudioTrack[],
	selectedTrackIndex: number,
	updateTrack: (id: string, updates: Partial<StudioTrack>) => void,
	pushUndo: (label: string) => void,
) {
	return useCallback(
		(note: number) => {
			const targetTrack = tracks[selectedTrackIndex];
			if (!targetTrack) {
				return;
			}
			const notes = [...(targetTrack.midiNotes ?? [])];
			const idx = notes.indexOf(note);
			if (idx >= 0) {
				notes.splice(idx, 1);
			} else {
				notes.push(note);
			}
			updateTrack(targetTrack.id, { midiNotes: notes });
			pushUndo(`Toggle MIDI note ${note}`);
		},
		[tracks, selectedTrackIndex, updateTrack, pushUndo],
	);
}
