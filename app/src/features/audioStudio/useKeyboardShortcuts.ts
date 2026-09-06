import { useCallback, useEffect } from "react";
import {
	connectVoiceChat,
	disconnectVoiceChat,
	startMicCapture,
	stopMicCapture,
	useVoiceChatStore,
} from "@/stores/voiceChatStore";
import type { StudioTrack } from "./AudioStudioStore";
import { useAudioStudioStore } from "./AudioStudioStore";

interface UseKeyboardShortcutsOptions {
	tracks: StudioTrack[];
	selectedTrackIndex: number;
	isRecording: boolean;
	togglePlayPause: () => void;
	handleStartRecording: () => void;
	handleStopRecording: () => void;
	session: {
		handleSaveSession: () => void;
		handleLoadSession: () => void;
	};
	pushUndo: (desc: string) => void;
	undo: () => void;
	redo: () => void;
	rootRef: React.RefObject<HTMLDivElement | null>;
}

export function useKeyboardShortcuts({
	tracks,
	selectedTrackIndex,
	isRecording,
	togglePlayPause,
	handleStartRecording,
	handleStopRecording,
	session,
	pushUndo,
	undo,
	redo,
	rootRef,
}: UseKeyboardShortcutsOptions) {
	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			const target = e.target as HTMLElement;
			if (
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.tagName === "SELECT"
			) {
				return;
			}

			switch (e.code) {
				case "Space":
					e.preventDefault();
					togglePlayPause();
					break;
				case "Delete":
				case "Backspace":
					if (tracks[selectedTrackIndex]) {
						pushUndo(`Remove ${tracks[selectedTrackIndex].name}`);
						const store = useAudioStudioStore.getState();
						const t = store.tracks[selectedTrackIndex];
						if (t) {
							store.removeTrack(t.id);
						}
					}
					break;
				case "KeyZ":
					if (e.ctrlKey || e.metaKey) {
						e.preventDefault();
						undo();
					}
					break;
				case "KeyY":
					if (e.ctrlKey || e.metaKey) {
						e.preventDefault();
						redo();
					}
					break;
				case "KeyR":
					if (!(e.ctrlKey || e.metaKey)) {
						if (isRecording) {
							handleStopRecording();
						} else {
							handleStartRecording();
						}
					}
					break;
				case "KeyS":
					if (e.ctrlKey || e.metaKey) {
						e.preventDefault();
						session.handleSaveSession();
					}
					break;
				case "KeyO":
					if (e.ctrlKey || e.metaKey) {
						e.preventDefault();
						session.handleLoadSession();
					}
					break;
				case "KeyV":
					if (!(e.ctrlKey || e.metaKey)) {
						const vcStore = useVoiceChatStore.getState();
						if (vcStore.isActive) {
							stopMicCapture();
							disconnectVoiceChat();
						} else {
							connectVoiceChat((msg) => {
								const store = useVoiceChatStore.getState();
								switch (msg.type) {
									case "speech_started":
										store.setIsSpeaking(true);
										break;
									case "speech_ended":
										store.setIsSpeaking(false);
										break;
									case "processing":
										store.setIsProcessing(true);
										break;
									case "response":
										store.setTranscript(msg.text ?? "");
										store.setResponse(msg.response ?? "");
										store.setIsProcessing(false);
										break;
									case "error":
										store.setError(msg.message ?? "Unknown error");
										store.setIsProcessing(false);
										break;
								}
							}).then(() => startMicCapture());
						}
					}
					break;
			}
		},
		[
			tracks,
			selectedTrackIndex,
			isRecording,
			session.handleLoadSession,
			session.handleSaveSession,
			handleStartRecording,
			handleStopRecording,
			pushUndo,
			redo,
			togglePlayPause,
			undo,
		],
	);

	useEffect(() => {
		const el = rootRef.current;
		if (!el) {
			return;
		}
		el.addEventListener("keydown", handleKeyDown);
		return () => el.removeEventListener("keydown", handleKeyDown);
	}, [handleKeyDown, rootRef.current]);
}
