import { debug } from "@/lib/utils/debug";
import type { StudioTrack } from "../AudioStudioStore";
export async function trackToWavBase64(track: StudioTrack): Promise<string> {
	let blob: Blob | null = track.audioBlob;
	if (!blob && track.audioUrl) {
		try {
			blob = await (await fetch(track.audioUrl)).blob();
		} catch {
			debug.log(
				"trackToWavBase64: fetch of audioUrl failed, falling back to empty blob",
			);
			blob = null;
		}
	}
	if (!blob) {
		return "";
	}
	const bytes = new Uint8Array(await blob.arrayBuffer());
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}
