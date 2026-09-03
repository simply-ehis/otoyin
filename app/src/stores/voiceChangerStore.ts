import { create } from "zustand";

export interface VoiceChangerState {
	enabled: boolean;
	pitchShift: number;
	formantShift: number;
	reverbMix: number;
	profile: string | null;
	preset: string | null;
	setEnabled: (enabled: boolean) => void;
	setPitchShift: (v: number) => void;
	setFormantShift: (v: number) => void;
	setReverbMix: (v: number) => void;
	setProfile: (profile: string | null) => void;
	setPreset: (preset: string | null) => void;
}

export const useVoiceChangerStore = create<VoiceChangerState>((set) => ({
	enabled: false,
	pitchShift: 0,
	formantShift: 0,
	reverbMix: 0.3,
	profile: null,
	preset: null,
	setEnabled: (enabled) => set({ enabled }),
	setPitchShift: (pitchShift) => set({ pitchShift }),
	setFormantShift: (formantShift) => set({ formantShift }),
	setReverbMix: (reverbMix) => set({ reverbMix }),
	setProfile: (profile) => set({ profile }),
	setPreset: (preset) => set({ preset }),
}));
