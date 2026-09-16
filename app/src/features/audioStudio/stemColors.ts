import type { IsolationStem } from "@/features/workspace/VocalIsolationView";

/** Display label per stem. */
export const STEM_LABEL: Record<IsolationStem, string> = {
	vocals: "Vocals",
	drums: "Drums",
	bass: "Bass",
	other: "Other",
};

/** Spectrogram hue base per stem (sweeps down 120° with energy). */
export const STEM_HUE: Record<IsolationStem, number> = {
	vocals: 330,
	drums: 35,
	bass: 190,
	other: 265,
};

/** Waveform/track color per stem. */
export const STEM_WAVEFORM: Record<IsolationStem, string> = {
	vocals: "#fb7185",
	drums: "#fbbf24",
	bass: "#22d3ee",
	other: "#a78bfa",
};
