export function formatDuration(ms?: number | null): string {
	if (!ms || ms < 0) {
		return "0:00";
	}
	const total = Math.round(ms / 1000);
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m}:${String(s).padStart(2, "0")}`;
}
