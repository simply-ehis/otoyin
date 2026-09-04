/**
 * S1 regression tests — after SSE exhaustion the hook watches the terminal
 * state via REST instead of dropping the generation and its story link.
 * Renders the real hook with a mocked EventSource + apiClient.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { act, createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/lib/api/client";
import { useGenerationProgress } from "@/lib/hooks/useGenerationProgress";
import { useGenerationStore } from "@/stores/generationStore";
import { usePlayerStore } from "@/stores/playerStore";

vi.mock("@/lib/api/client", () => ({
	apiClient: {
		getGenerationStatusUrl: (id: string) =>
			`http://localhost/generate/${id}/status`,
		getGeneration: vi.fn(),
		getAudioUrl: (id: string) => `http://localhost/audio/${id}`,
		getChunkUrl: (id: string, idx: number) =>
			`http://localhost/chunk/${id}/${idx}`,
		getGenerationSettings: vi
			.fn()
			.mockResolvedValue({ autoplay_on_generate: false }),
		addStoryItem: vi.fn().mockResolvedValue({}),
	},
}));

class MockEventSource {
	static instances: MockEventSource[] = [];
	onmessage: ((event: { data: string }) => void) | null = null;
	onerror: (() => void) | null = null;
	closed = false;

	constructor(public url: string) {
		MockEventSource.instances.push(this);
	}

	close() {
		this.closed = true;
	}
}

function createWrapper() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return function Wrapper({ children }: { children: React.ReactNode }) {
		return createElement(
			QueryClientProvider,
			{ client: queryClient },
			children,
		);
	};
}

beforeEach(() => {
	vi.useFakeTimers();
	MockEventSource.instances = [];
	vi.stubGlobal("EventSource", MockEventSource);
	vi.mocked(apiClient.getGeneration).mockReset();
	vi.mocked(apiClient.addStoryItem).mockClear();
	useGenerationStore.setState({
		pendingGenerationIds: new Set(),
		isGenerating: false,
		pendingIdsKey: "",
		activeGenerationId: null,
		pendingStoryAdds: new Map(),
	});
	usePlayerStore.getState().reset();
});

async function exhaustRetries(id: string) {
	// Initial source + 3 retried sources = 4 error events, then exhaustion.
	// Backoffs: 2s, 4s, 8s.
	for (const wait of [0, 2000, 4000, 8000]) {
		if (wait > 0) {
			await act(async () => {
				vi.advanceTimersByTime(wait);
			});
		}
		const source = MockEventSource.instances.find(
			(s) => s.url.includes(id) && !s.closed,
		);
		expect(source).toBeDefined();
		act(() => {
			source?.onerror?.();
		});
	}
	await act(async () => {});
}

describe("SSE exhaustion fallback (S1)", () => {
	it("keeps the story link: completed generation is added to the story via REST", async () => {
		vi.mocked(apiClient.getGeneration).mockResolvedValue({
			id: "gen-1",
			status: "completed",
			duration: 4.5,
		} as never);
		act(() => {
			useGenerationStore.getState().addPendingGeneration("gen-1");
			useGenerationStore.getState().addPendingStoryAdd("gen-1", "story-9");
		});
		renderHook(() => useGenerationProgress(), { wrapper: createWrapper() });

		await exhaustRetries("gen-1");
		// Fallback poll resolves on the first attempt.
		await act(async () => {
			vi.advanceTimersByTime(3000);
		});

		expect(apiClient.getGeneration).toHaveBeenCalledWith("gen-1");
		expect(apiClient.addStoryItem).toHaveBeenCalledWith("story-9", {
			generation_id: "gen-1",
		});
		expect(
			useGenerationStore.getState().pendingGenerationIds.has("gen-1"),
		).toBe(false);
	});

	it("surfaces a backend failure observed via REST", async () => {
		vi.mocked(apiClient.getGeneration).mockResolvedValue({
			id: "gen-2",
			status: "failed",
			error: "Model blew a fuse",
		} as never);
		act(() => {
			useGenerationStore.getState().addPendingGeneration("gen-2");
		});
		renderHook(() => useGenerationProgress(), { wrapper: createWrapper() });

		await exhaustRetries("gen-2");
		await act(async () => {
			vi.advanceTimersByTime(3000);
		});

		expect(
			useGenerationStore.getState().pendingGenerationIds.has("gen-2"),
		).toBe(false);
		expect(useGenerationStore.getState().pendingStoryAdds.has("gen-2")).toBe(
			false,
		);
	});

	it("keeps polling while the backend is still generating", async () => {
		vi.mocked(apiClient.getGeneration).mockResolvedValue({
			id: "gen-3",
			status: "generating",
		} as never);
		act(() => {
			useGenerationStore.getState().addPendingGeneration("gen-3");
		});
		renderHook(() => useGenerationProgress(), { wrapper: createWrapper() });

		await exhaustRetries("gen-3");
		await act(async () => {
			vi.advanceTimersByTime(6000);
		});
		const callsAfter6s = vi.mocked(apiClient.getGeneration).mock.calls.length;
		expect(callsAfter6s).toBeGreaterThanOrEqual(1);
		await act(async () => {
			vi.advanceTimersByTime(6000);
		});
		// Still polling (calls keep accumulating) and still pending — not dropped.
		expect(
			vi.mocked(apiClient.getGeneration).mock.calls.length,
		).toBeGreaterThan(callsAfter6s);
		expect(
			useGenerationStore.getState().pendingGenerationIds.has("gen-3"),
		).toBe(true);
	});
});
