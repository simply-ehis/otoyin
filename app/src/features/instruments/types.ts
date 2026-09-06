/**
 * Instrument domain types, ported from Resonant (© 2026 Calesthio, AGPL-3.0-only).
 * Adapted for otoyin's storage model (backend URLs, not Electron IPC).
 */

export interface InstrumentRef {
	id: string;
	name: string;
	packName?: string;
	format: "soundfont" | "webaudiofont" | "sfz" | "sample";
	program?: number;
	bankMSB?: number;
	bankLSB?: number;
	percussion?: boolean;
}

export interface InstrumentSummary extends InstrumentRef {
	packId: string;
	family: string;
	variant?: string;
	instrument?: string;
	bank?: string;
	installed: boolean;
}

export interface InstrumentPackSummary {
	id: string;
	name: string;
	version: string;
	format: string;
	bytes: number;
	source?: string;
	installedAt: string;
	instrumentCount: number;
}

export interface InstrumentLibraryState {
	root: string;
	packs: InstrumentPackSummary[];
	instruments: InstrumentSummary[];
	bytes: number;
}

export interface SampleZone {
	sample?: string;
	rootKey: number;
	loKey: number;
	hiKey: number;
	loVel: number;
	hiVel: number;
	tune?: number;
	gainDb?: number;
	loopMode?: string;
	loopStart?: number;
	loopEnd?: number;
	oneShot?: boolean;
	data?: ArrayBuffer;
	extension?: string;
	originalPitch?: number;
	keyRangeLow?: number;
	keyRangeHigh?: number;
	velRangeLow?: number;
	velRangeHigh?: number;
	coarseTune?: number;
	fineTune?: number;
	sampleRate?: number;
	file?: string;
}

export interface ResolvedInstrument {
	instrument: InstrumentSummary;
	data?: ArrayBuffer;
	zones?: SampleZone[];
	preset?: { zones?: SampleZone[]; [key: string]: unknown };
}

export interface InstrumentDownloadProgress {
	phase: "download" | "index";
	label: string;
	received: number;
	total: number;
}

export const formatBytes = (bytes: number) => {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 ** 2) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	if (bytes < 1024 ** 3) {
		return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
	}
	return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};
