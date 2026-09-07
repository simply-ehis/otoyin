export const PLAY_TONES = [330, 392, 440, 494, 554, 659];
export const TOTAL_DURATION_MS = 10000;

export function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => {
			const result = reader.result as string;
			resolve(result.includes(",") ? (result.split(",")[1] ?? "") : result);
		};
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

export function formatMs(ms: number): string {
	const s = Math.floor(ms / 1000);
	const m = Math.floor(s / 60);
	return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function newLaneId() {
	return `lane-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export function newRegionId() {
	return `r-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}
