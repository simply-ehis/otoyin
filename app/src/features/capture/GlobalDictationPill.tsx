import { CapturePill } from "@/features/capture/CapturePill";
import { useGlobalDictation } from "@/lib/hooks/useGlobalDictation";
import { cn } from "@/lib/utils/cn";

/**
 * Floating global-dictation pill. Appears when the user presses the
 * system-wide chord (Ctrl/Cmd + Alt + D) and drives the same
 * record → transcribe → refine → rest lifecycle as in-app capture.
 *
 * Renders nothing when hidden, so it's safe to mount once at the app root.
 */
export function GlobalDictationPill() {
	const {
		pillState,
		pillElapsedMs,
		errorMessage,
		isRecording,
		stopRecording,
		dismissError,
	} = useGlobalDictation();

	if (pillState === "hidden") {
		return null;
	}

	return (
		<div
			className={cn(
				"pointer-events-none fixed top-24 left-1/2 -translate-x-1/2 z-[100]",
				"px-4 sm:px-6 lg:px-8",
			)}
		>
			<CapturePill
				state={pillState}
				elapsedMs={pillElapsedMs}
				errorMessage={errorMessage}
				onStop={isRecording ? stopRecording : undefined}
				onDismiss={dismissError}
				className="mx-auto"
			/>
		</div>
	);
}
