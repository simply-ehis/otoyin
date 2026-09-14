import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePresetAudition } from "@/features/generate/usePresetAudition";
import { apiClient } from "@/lib/api/client";
import { usePlayerStore } from "@/stores/playerStore";

vi.mock("@/lib/api/client", () => ({
	apiClient: {
		synthesizePresetVoicePreview: vi.fn(),
	},
}));

const toastMock = vi.fn();
vi.mock("@/ui/use-toast", () => ({
	useToast: () => ({ toast: toastMock }),
}));

const voice = { id: "af_heart", name: "Heart", gender: "female", language: "en" };

beforeEach(() => {
	vi.clearAllMocks();
	usePlayerStore.getState().reset();
	vi.stubGlobal("URL", {
		createObjectURL: vi.fn(() => "blob:preview-1"),
		revokeObjectURL: vi.fn(),
	});
});

describe("usePresetAudition", () => {
	it("synthesizes once, then plays from the player store", async () => {
		vi.mocked(apiClient.synthesizePresetVoicePreview).mockResolvedValue(
			new Blob(["audio"], { type: "audio/wav" }),
		);
		const { result } = renderHook(() => usePresetAudition("kokoro"));

		await act(async () => {
			await result.current.audition(voice);
		});

		expect(apiClient.synthesizePresetVoicePreview).toHaveBeenCalledWith(
			"kokoro",
			"af_heart",
		);
		const st = usePlayerStore.getState();
		expect(st.audioId).toBe("preview-voice:kokoro:af_heart");
		expect(st.audioUrl).toBe("blob:preview-1");
		expect(st.shouldAutoPlay).toBe(true);
		expect(result.current.loadingVoiceId).toBeNull();
	});

	it("reuses the cached blob URL on repeat auditions", async () => {
		vi.mocked(apiClient.synthesizePresetVoicePreview).mockResolvedValue(
			new Blob(["audio"], { type: "audio/wav" }),
		);
		const { result } = renderHook(() => usePresetAudition("kokoro"));

		await act(async () => {
			await result.current.audition(voice);
		});
		// Same voice while its preview is loaded: memory cache, no re-synthesis.
		usePlayerStore.getState().reset();
		await act(async () => {
			await result.current.audition(voice);
		});

		expect(apiClient.synthesizePresetVoicePreview).toHaveBeenCalledTimes(1);
		expect(usePlayerStore.getState().audioUrl).toBe("blob:preview-1");
	});

	it("tapping the playing preview pauses instead of re-fetching", async () => {
		vi.mocked(apiClient.synthesizePresetVoicePreview).mockResolvedValue(
			new Blob(["audio"], { type: "audio/wav" }),
		);
		const { result } = renderHook(() => usePresetAudition("kokoro"));

		await act(async () => {
			await result.current.audition(voice);
		});
		usePlayerStore.getState().setIsPlaying(true);
		await act(async () => {
			await result.current.audition(voice);
		});

		expect(apiClient.synthesizePresetVoicePreview).toHaveBeenCalledTimes(1);
		expect(usePlayerStore.getState().isPlaying).toBe(false);
	});

	it("toasts and clears loading state on synthesis failure", async () => {
		vi.mocked(apiClient.synthesizePresetVoicePreview).mockRejectedValue(
			new Error("model missing"),
		);
		const { result } = renderHook(() => usePresetAudition("kokoro"));

		await act(async () => {
			await result.current.audition(voice);
		});

		expect(toastMock).toHaveBeenCalledWith(
			expect.objectContaining({ title: "Preview failed" }),
		);
		expect(result.current.loadingVoiceId).toBeNull();
		expect(usePlayerStore.getState().audioUrl).toBeNull();
	});
});
