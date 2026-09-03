import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { useClipboardStore } from "@/stores/clipboardStore";
import { useVoiceChangerStore } from "@/stores/voiceChangerStore";

describe("VoiceChangerStore", () => {
	beforeEach(() => {
		useVoiceChangerStore.setState({
			enabled: false,
			pitchShift: 0,
			formantShift: 0,
			reverbMix: 0.3,
			profile: null,
			preset: null,
		});
	});

	it("has correct defaults", () => {
		const s = useVoiceChangerStore.getState();
		expect(s.enabled).toBe(false);
		expect(s.pitchShift).toBe(0);
		expect(s.formantShift).toBe(0);
		expect(s.reverbMix).toBe(0.3);
		expect(s.profile).toBeNull();
		expect(s.preset).toBeNull();
	});

	it("toggles enabled", () => {
		act(() => useVoiceChangerStore.getState().setEnabled(true));
		expect(useVoiceChangerStore.getState().enabled).toBe(true);
		act(() => useVoiceChangerStore.getState().setEnabled(false));
		expect(useVoiceChangerStore.getState().enabled).toBe(false);
	});

	it("sets pitch shift", () => {
		act(() => useVoiceChangerStore.getState().setPitchShift(3));
		expect(useVoiceChangerStore.getState().pitchShift).toBe(3);
	});

	it("sets formant shift", () => {
		act(() => useVoiceChangerStore.getState().setFormantShift(-2));
		expect(useVoiceChangerStore.getState().formantShift).toBe(-2);
	});

	it("sets reverb mix", () => {
		act(() => useVoiceChangerStore.getState().setReverbMix(0.7));
		expect(useVoiceChangerStore.getState().reverbMix).toBe(0.7);
	});

	it("sets profile", () => {
		act(() => useVoiceChangerStore.getState().setProfile("profile-1"));
		expect(useVoiceChangerStore.getState().profile).toBe("profile-1");
		act(() => useVoiceChangerStore.getState().setProfile(null));
		expect(useVoiceChangerStore.getState().profile).toBeNull();
	});

	it("sets preset", () => {
		act(() => useVoiceChangerStore.getState().setPreset("robot"));
		expect(useVoiceChangerStore.getState().preset).toBe("robot");
	});
});

describe("ClipboardStore", () => {
	beforeEach(() => {
		useClipboardStore.getState().clear();
	});

	it("starts with null clip", () => {
		expect(useClipboardStore.getState().clip).toBeNull();
	});

	it("sets a clip", () => {
		const clip = {
			storagePath: "/audio/test.wav",
			filename: "test.wav",
			durationS: 5.2,
			label: "Test Clip",
		};
		act(() => useClipboardStore.getState().setClip(clip));
		expect(useClipboardStore.getState().clip).toEqual(clip);
	});

	it("clears the clip", () => {
		act(() =>
			useClipboardStore.getState().setClip({
				storagePath: "/audio/test.wav",
				filename: "test.wav",
				durationS: 5.2,
				label: "Test",
			}),
		);
		act(() => useClipboardStore.getState().clear());
		expect(useClipboardStore.getState().clip).toBeNull();
	});

	it("replaces previous clip on setClip", () => {
		act(() =>
			useClipboardStore.getState().setClip({
				storagePath: "/a.wav",
				filename: "a.wav",
				durationS: 1,
				label: "A",
			}),
		);
		act(() =>
			useClipboardStore.getState().setClip({
				storagePath: "/b.wav",
				filename: "b.wav",
				durationS: 2,
				label: "B",
			}),
		);
		expect(useClipboardStore.getState().clip?.filename).toBe("b.wav");
	});
});
