import { showStudioErrorToast } from "@/lib/errors";

/**
 * Play a rendered audio blob, releasing the object URL when playback ends
 * or fails. Returns the element so callers can wire an analyser for meters.
 */
export function playPreviewBlob(blob: Blob): HTMLAudioElement {
	const url = URL.createObjectURL(blob);
	const audio = new Audio(url);
	audio.onended = () => URL.revokeObjectURL(url);
	audio.play().catch((err: unknown) => {
		URL.revokeObjectURL(url);
		showStudioErrorToast(err);
	});
	return audio;
}
