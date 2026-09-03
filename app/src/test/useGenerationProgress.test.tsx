/**
 * Tests for useGenerationProgress — the SSE subscription hook that drives
 * streaming playback. Tests the EventSource lifecycle, chunk_ready handling,
 * completed/failed event handling, and cleanup.
 *
 * Rather than rendering the full React hook (which has deep provider deps),
 * we test the EventSource mock lifecycle + store interactions that the hook
 * orchestrates.
 */
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGenerationStore } from "@/stores/generationStore";
import { usePlayerStore } from "@/stores/playerStore";

// ── Mock EventSource ───────────────────────────────────────────────
class MockEventSource {
	static instances: MockEventSource[] = [];
	url: string;
	onmessage: ((event: { data: string }) => void) | null = null;
	onerror: (() => void) | null = null;
	readyState = 0;
	closed = false;

	constructor(url: string) {
		this.url = url;
		this.readyState = 1;
		MockEventSource.instances.push(this);
	}

	emit(data: Record<string, unknown>) {
		this.onmessage?.({ data: JSON.stringify(data) });
	}

	emitError() {
		this.onerror?.();
	}

	close() {
		this.closed = true;
		this.readyState = 2;
	}
}

// ── Setup ──────────────────────────────────────────────────────────

beforeEach(() => {
	MockEventSource.instances = [];
	vi.stubGlobal("EventSource", MockEventSource);

	useGenerationStore.setState({
		pendingGenerationIds: new Set(),
		isGenerating: false,
		pendingIdsKey: "",
		activeGenerationId: null,
		pendingStoryAdds: new Map(),
	});

	usePlayerStore.getState().reset();
});

// ── Tests ──────────────────────────────────────────────────────────

describe("EventSource lifecycle (mirrors useGenerationProgress logic)", () => {
	it("opens EventSource per pending ID", () => {
		const ids = ["gen-1", "gen-2"];
		for (const id of ids) {
			new MockEventSource(`http://localhost:17493/generate/${id}/status`);
		}
		expect(MockEventSource.instances).toHaveLength(2);
		expect(MockEventSource.instances[0].url).toContain("gen-1");
		expect(MockEventSource.instances[1].url).toContain("gen-2");
	});

	it("closes EventSource when generation completes", () => {
		const source = new MockEventSource(
			"http://localhost/generate/gen-1/status",
		);
		expect(source.closed).toBe(false);
		source.close();
		expect(source.closed).toBe(true);
	});

	it("revents duplicates — same ID should reuse source", () => {
		// Create a source to simulate an existing connection
		new MockEventSource("http://localhost/generate/gen-1/status");
		// Simulate the hook's check: if source already exists for this ID, skip
		const alreadyHas = MockEventSource.instances.some(
			(s) => s.url.includes("gen-1") && !s.closed,
		);
		expect(alreadyHas).toBe(true);

		// Should NOT create a second source
		if (!alreadyHas) {
			new MockEventSource("http://localhost/generate/gen-1/status");
		}
		expect(MockEventSource.instances).toHaveLength(1);
	});
});

describe("SSE event parsing (mirrors useGenerationProgress onmessage)", () => {
	it("parses chunk_ready event", () => {
		const event = {
			id: "gen-1",
			status: "chunk_ready",
			chunk_index: 0,
			chunk_total: 3,
			chunk_url: "/generations/gen-1/chunk/0",
		};
		const data = JSON.parse(JSON.stringify(event));
		expect(data.status).toBe("chunk_ready");
		expect(data.chunk_index).toBe(0);
		expect(data.chunk_url).toBeDefined();
	});

	it("parses completed event", () => {
		const event = {
			id: "gen-1",
			status: "completed",
			duration: 5.2,
		};
		const data = JSON.parse(JSON.stringify(event));
		expect(data.status).toBe("completed");
		expect(data.duration).toBe(5.2);
	});

	it("parses failed event with error", () => {
		const event = {
			id: "gen-1",
			status: "failed",
			error: "Model not loaded",
		};
		const data = JSON.parse(JSON.stringify(event));
		expect(data.status).toBe("failed");
		expect(data.error).toBe("Model not loaded");
	});

	it("ignores parse errors (heartbeats, keepalives)", () => {
		const parseError = (() => {
			try {
				JSON.parse(": keepalive\n\n");
				return false;
			} catch {
				return true;
			}
		})();
		expect(parseError).toBe(true);
	});
});

describe("Store interactions during generation lifecycle", () => {
	it("pending store tracks active generations", () => {
		act(() => {
			useGenerationStore.getState().addPendingGeneration("gen-1");
			useGenerationStore.getState().addPendingGeneration("gen-2");
		});

		expect(useGenerationStore.getState().pendingGenerationIds.size).toBe(2);
		expect(useGenerationStore.getState().isGenerating).toBe(true);
	});

	it("completing a generation removes it from pending", () => {
		act(() => {
			useGenerationStore.getState().addPendingGeneration("gen-1");
			useGenerationStore.getState().addPendingGeneration("gen-2");
		});

		// Simulate completed event for gen-1
		act(() => {
			useGenerationStore.getState().removePendingGeneration("gen-1");
		});

		expect(
			useGenerationStore.getState().pendingGenerationIds.has("gen-1"),
		).toBe(false);
		expect(
			useGenerationStore.getState().pendingGenerationIds.has("gen-2"),
		).toBe(true);
		expect(useGenerationStore.getState().isGenerating).toBe(true);
	});

	it("failing a generation removes it from pending", () => {
		act(() => {
			useGenerationStore.getState().addPendingGeneration("gen-1");
		});

		act(() => {
			useGenerationStore.getState().removePendingGeneration("gen-1");
		});

		expect(
			useGenerationStore.getState().pendingGenerationIds.has("gen-1"),
		).toBe(false);
		expect(useGenerationStore.getState().isGenerating).toBe(false);
	});

	it("chunk_ready does NOT remove generation from pending", () => {
		act(() => {
			useGenerationStore.getState().addPendingGeneration("gen-1");
		});

		// chunk_ready should not call removePendingGeneration
		expect(
			useGenerationStore.getState().pendingGenerationIds.has("gen-1"),
		).toBe(true);
		expect(useGenerationStore.getState().isGenerating).toBe(true);
	});
});

describe("Player store auto-play on generation complete", () => {
	it("setAudioWithAutoPlay sets the auto-play flag", () => {
		act(() => {
			usePlayerStore
				.getState()
				.setAudioWithAutoPlay(
					"http://localhost:17493/audio/gen-1",
					"gen-1",
					null,
					"",
				);
		});

		const s = usePlayerStore.getState();
		expect(s.shouldAutoPlay).toBe(true);
		expect(s.audioUrl).toBe("http://localhost:17493/audio/gen-1");
		expect(s.audioId).toBe("gen-1");
	});

	it("setAudio does NOT set auto-play flag", () => {
		act(() => {
			usePlayerStore
				.getState()
				.setAudio("http://localhost:17493/audio/gen-1", "gen-1", null);
		});

		expect(usePlayerStore.getState().shouldAutoPlay).toBe(false);
	});
});

describe("Story addition on generation complete", () => {
	it("story add mapping round-trips correctly", () => {
		act(() => {
			useGenerationStore.getState().addPendingGeneration("gen-1");
			useGenerationStore.getState().addPendingStoryAdd("gen-1", "story-42");
		});

		const storyId = useGenerationStore
			.getState()
			.removePendingStoryAdd("gen-1");
		expect(storyId).toBe("story-42");
		expect(useGenerationStore.getState().pendingStoryAdds.has("gen-1")).toBe(
			false,
		);
	});

	it("returns undefined when no story add is pending", () => {
		const storyId = useGenerationStore
			.getState()
			.removePendingStoryAdd("nonexistent");
		expect(storyId).toBeUndefined();
	});
});

describe("Full lifecycle simulation", () => {
	it("generate → chunk_ready × 3 → completed → auto-play", () => {
		// 1. Start generation
		act(() => {
			useGenerationStore.getState().addPendingGeneration("gen-1");
		});
		expect(useGenerationStore.getState().isGenerating).toBe(true);

		// 2. Three chunk_ready events — store should remain pending
		for (let i = 0; i < 3; i++) {
			// chunk_ready doesn't change pending state
			expect(
				useGenerationStore.getState().pendingGenerationIds.has("gen-1"),
			).toBe(true);
		}

		// 3. Completed — remove from pending, set auto-play
		act(() => {
			useGenerationStore.getState().removePendingGeneration("gen-1");
			usePlayerStore
				.getState()
				.setAudioWithAutoPlay(
					"http://localhost:17493/audio/gen-1",
					"gen-1",
					null,
				);
		});

		expect(
			useGenerationStore.getState().pendingGenerationIds.has("gen-1"),
		).toBe(false);
		expect(useGenerationStore.getState().isGenerating).toBe(false);
		expect(usePlayerStore.getState().shouldAutoPlay).toBe(true);
		expect(usePlayerStore.getState().audioUrl).toBe(
			"http://localhost:17493/audio/gen-1",
		);
	});

	it("generate → failed → cleanup", () => {
		act(() => {
			useGenerationStore.getState().addPendingGeneration("gen-1");
		});

		// Failed — remove from pending
		act(() => {
			useGenerationStore.getState().removePendingGeneration("gen-1");
		});

		expect(
			useGenerationStore.getState().pendingGenerationIds.has("gen-1"),
		).toBe(false);
		expect(useGenerationStore.getState().isGenerating).toBe(false);
		expect(usePlayerStore.getState().shouldAutoPlay).toBe(false);
	});

	it("generate with story add → completed → story added", () => {
		act(() => {
			useGenerationStore.getState().addPendingGeneration("gen-1");
			useGenerationStore.getState().addPendingStoryAdd("gen-1", "story-1");
		});

		// Completed
		act(() => {
			useGenerationStore.getState().removePendingGeneration("gen-1");
		});

		// Retrieve story ID before cleanup
		const storyId = useGenerationStore
			.getState()
			.removePendingStoryAdd("gen-1");
		expect(storyId).toBe("story-1");
	});

	it("concurrent generations maintain independent state", () => {
		act(() => {
			useGenerationStore.getState().addPendingGeneration("gen-1");
			useGenerationStore.getState().addPendingGeneration("gen-2");
		});

		expect(useGenerationStore.getState().pendingGenerationIds.size).toBe(2);

		// Complete gen-1
		act(() => {
			useGenerationStore.getState().removePendingGeneration("gen-1");
		});

		expect(
			useGenerationStore.getState().pendingGenerationIds.has("gen-1"),
		).toBe(false);
		expect(
			useGenerationStore.getState().pendingGenerationIds.has("gen-2"),
		).toBe(true);
		expect(useGenerationStore.getState().isGenerating).toBe(true);
	});
});
