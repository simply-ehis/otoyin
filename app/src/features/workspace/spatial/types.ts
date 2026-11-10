export interface SpatialSource {
	id: string;
	/** Server storage path of the source audio. */
	audioPath: string;
	/** Human-readable label (profile name or truncated text). */
	label: string;
	/** Radar pixels, 20..380 x 20..280 on the 400x300 stage. */
	x: number;
	y: number;
	/** Loudness in dB (-30 .. +12). */
	gainDb: number;
	muted: boolean;
}
