export interface SoundSource {
	id: string;
	/** Radar pixels, 20..380 x 20..280 on the 400x300 stage. */
	x: number;
	y: number;
	label: string;
	gain: number;
	muted: boolean;
}
