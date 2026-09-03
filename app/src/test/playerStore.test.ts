import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { usePlayerStore } from "@/stores/playerStore";

beforeEach(() => {
	usePlayerStore.getState().reset();
});

describe("PlayerStore", () => {
	describe("initial state", () => {
		it("has null audio by default", () => {
			const s = usePlayerStore.getState();
			expect(s.audioUrl).toBeNull();
			expect(s.audioId).toBeNull();
			expect(s.profileId).toBeNull();
			expect(s.title).toBeNull();
		});

		it("has sensible defaults", () => {
			const s = usePlayerStore.getState();
			expect(s.isPlaying).toBe(false);
			expect(s.currentTime).toBe(0);
			expect(s.duration).toBe(0);
			expect(s.volume).toBe(1);
			expect(s.isLooping).toBe(false);
		});
	});

	describe("setAudio", () => {
		it("sets audio fields and resets time", () => {
			act(() => {
				usePlayerStore
					.getState()
					.setAudio("http://x/a.wav", "id1", "p1", "My Track");
			});
			const s = usePlayerStore.getState();
			expect(s.audioUrl).toBe("http://x/a.wav");
			expect(s.audioId).toBe("id1");
			expect(s.profileId).toBe("p1");
			expect(s.title).toBe("My Track");
			expect(s.currentTime).toBe(0);
			expect(s.isPlaying).toBe(false);
		});

		it("defaults profileId and title to null when omitted", () => {
			act(() => {
				usePlayerStore.getState().setAudio("http://x/a.wav", "id1", null);
			});
			const s = usePlayerStore.getState();
			expect(s.profileId).toBeNull();
			expect(s.title).toBeNull();
		});
	});

	describe("setAudioWithAutoPlay", () => {
		it("sets shouldAutoPlay to true", () => {
			act(() => {
				usePlayerStore
					.getState()
					.setAudioWithAutoPlay("http://x/a.wav", "id1", null);
			});
			expect(usePlayerStore.getState().shouldAutoPlay).toBe(true);
		});
	});

	describe("playback controls", () => {
		it("setIsPlaying toggles state", () => {
			act(() => usePlayerStore.getState().setIsPlaying(true));
			expect(usePlayerStore.getState().isPlaying).toBe(true);
			act(() => usePlayerStore.getState().setIsPlaying(false));
			expect(usePlayerStore.getState().isPlaying).toBe(false);
		});

		it("setCurrentTime updates time", () => {
			act(() => usePlayerStore.getState().setCurrentTime(42.5));
			expect(usePlayerStore.getState().currentTime).toBe(42.5);
		});

		it("setDuration updates duration", () => {
			act(() => usePlayerStore.getState().setDuration(120));
			expect(usePlayerStore.getState().duration).toBe(120);
		});

		it("setVolume updates volume", () => {
			act(() => usePlayerStore.getState().setVolume(0.5));
			expect(usePlayerStore.getState().volume).toBe(0.5);
		});

		it("toggleLoop flips isLooping", () => {
			expect(usePlayerStore.getState().isLooping).toBe(false);
			act(() => usePlayerStore.getState().toggleLoop());
			expect(usePlayerStore.getState().isLooping).toBe(true);
			act(() => usePlayerStore.getState().toggleLoop());
			expect(usePlayerStore.getState().isLooping).toBe(false);
		});
	});

	describe("restart and autoplay flags", () => {
		it("restartCurrentAudio sets shouldRestart", () => {
			act(() => usePlayerStore.getState().restartCurrentAudio());
			expect(usePlayerStore.getState().shouldRestart).toBe(true);
		});

		it("clearRestartFlag resets shouldRestart", () => {
			act(() => usePlayerStore.getState().restartCurrentAudio());
			act(() => usePlayerStore.getState().clearRestartFlag());
			expect(usePlayerStore.getState().shouldRestart).toBe(false);
		});

		it("clearAutoPlayFlag resets shouldAutoPlay", () => {
			act(() => {
				usePlayerStore.getState().setAudioWithAutoPlay("u", "i", null);
			});
			expect(usePlayerStore.getState().shouldAutoPlay).toBe(true);
			act(() => usePlayerStore.getState().clearAutoPlayFlag());
			expect(usePlayerStore.getState().shouldAutoPlay).toBe(false);
		});
	});

	describe("onFinish callback", () => {
		it("stores and clears onFinish", () => {
			const fn = () => {};
			act(() => usePlayerStore.getState().setOnFinish(fn));
			expect(usePlayerStore.getState().onFinish).toBe(fn);
			act(() => usePlayerStore.getState().setOnFinish(null));
			expect(usePlayerStore.getState().onFinish).toBeNull();
		});
	});

	describe("reset", () => {
		it("clears all state back to defaults", () => {
			act(() => {
				usePlayerStore.getState().setAudio("u", "i", "p", "t");
				usePlayerStore.getState().setIsPlaying(true);
				usePlayerStore.getState().toggleLoop();
			});
			act(() => usePlayerStore.getState().reset());
			const s = usePlayerStore.getState();
			expect(s.audioUrl).toBeNull();
			expect(s.isPlaying).toBe(false);
			expect(s.isLooping).toBe(false);
		});
	});
});
