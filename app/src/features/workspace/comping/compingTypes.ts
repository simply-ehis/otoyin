export interface TakeRegion {
	id: string;
	startMs: number;
	endMs: number;
	label: string;
}

export interface TakeLane {
	id: string;
	name: string;
	regions: TakeRegion[];
	selectedRegionId: string | null;
	audioBase64?: string | null;
}

export function isTakeLane(v: unknown): v is TakeLane {
	if (typeof v !== "object" || v === null) {
		return false;
	}
	const l = v as Record<string, unknown>;
	return (
		typeof l.id === "string" &&
		typeof l.name === "string" &&
		Array.isArray(l.regions)
	);
}
