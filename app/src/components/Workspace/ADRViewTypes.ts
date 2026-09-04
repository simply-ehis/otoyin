export interface ADRTake {
	id: string;
	take_number?: number;
	duration_ms?: number;
	quality_score?: number;
}

export interface ADRLine {
	id: string;
	original_text?: string;
	character?: string;
	target_duration_ms?: number;
	takes?: ADRTake[];
	selected_take_id?: string;
}

export interface ADRSession {
	id: string;
	name?: string;
	lines?: ADRLine[];
	guide_audio_path?: string;
	guide_duration_ms?: number;
}

export interface ADRSessionSummary {
	id: string;
	name?: string;
}
