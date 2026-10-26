import { listen } from "@tauri-apps/api/event";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { useCaptureRecordingSession } from "./useCaptureRecordingSession";

/**
 * Global dictation via the system-wide hotkey (Ctrl/Cmd + Alt + D, registered
 * on the Rust side in `lib.rs`).
 *
 * Listens for the `dictation:toggle` event emitted by the global shortcut and
 * drives the same capture-pill lifecycle used in-app, so dictation and
 * in-app capture share one mental model (one pill, one state machine).
 *
 * Safe to mount anywhere in the app — no-op outside Tauri.
 */
export function useGlobalDictation() {
	const {
		pillState,
		pillElapsedMs,
		errorMessage,
		isRecording,
		toggleRecording,
		stopRecording,
		dismissError,
	} = useCaptureRecordingSession();

	useEffect(() => {
		if (!isTauri()) {
			return undefined;
		}

		const unlisten = listen("dictation:toggle", async () => {
			toggleRecording();
		});

		return () => {
			void unlisten.then((f) => f());
		};
	}, [toggleRecording]);

	return {
		pillState,
		pillElapsedMs,
		errorMessage,
		isRecording,
		toggleRecording,
		stopRecording,
		dismissError,
	};
}
