import { describe, expect, it, vi } from "vitest";
import type { Msg } from "./AssistantPanel.types";
import type { HarnessState, StreamEventSink } from "./assistantStreamEvents";
import { applyStreamEvent } from "./assistantStreamEvents";

function makeSink() {
	let messages: Msg[] = [];
	let harness: HarnessState | null = null;
	let flushed = false;
	const sink: StreamEventSink = {
		setMessages: (updater) => {
			messages =
				typeof updater === "function"
					? (updater as (p: Msg[]) => Msg[])(messages)
					: updater;
		},
		setHarnessState: (updater) => {
			harness =
				typeof updater === "function"
					? (updater as (p: HarnessState | null) => HarnessState | null)(
							harness,
						)
					: updater;
		},
		streamingBufferRef: { current: "" },
		streamingFlushTimerRef: { current: null },
		flushStreamingBuffer: () => {
			flushed = true;
		},
	};
	return {
		sink,
		get messages() {
			return messages;
		},
		get harness() {
			return harness;
		},
		wasFlushed: () => flushed,
	};
}

describe("applyStreamEvent", () => {
	it("accumulates text and schedules a flush", () => {
		const { sink } = makeSink();
		vi.useFakeTimers();
		try {
			applyStreamEvent({ type: "text", content: "hel" }, sink);
			applyStreamEvent({ type: "text", content: "lo" }, sink);
			expect(sink.streamingBufferRef.current).toBe("hello");
			expect(sink.streamingFlushTimerRef.current).not.toBeNull();
		} finally {
			vi.useRealTimers();
			if (sink.streamingFlushTimerRef.current !== null) {
				window.clearTimeout(sink.streamingFlushTimerRef.current);
			}
		}
	});

	it("appends tool_call and thinking messages", () => {
		const t = makeSink();
		applyStreamEvent(
			{ type: "tool_call", content: "{}", tool_name: "speak" },
			t.sink,
		);
		applyStreamEvent({ type: "thinking", content: "hmm" }, t.sink);
		expect(t.messages.map((m) => m.role)).toEqual(["tool_call", "thinking"]);
		expect(t.messages[0].toolName).toBe("speak");
	});

	it("routes audio tool results to audio_preview bubbles", () => {
		const t = makeSink();
		applyStreamEvent(
			{ type: "tool_result", tool_name: "generate_speech", tool_result: "{}" },
			t.sink,
		);
		applyStreamEvent(
			{ type: "tool_result", tool_name: "speak", content: "done" },
			t.sink,
		);
		expect(t.messages.map((m) => m.role)).toEqual([
			"audio_preview",
			"tool_result",
		]);
	});

	it("dispatches assistant commands as window events", () => {
		const t = makeSink();
		const seen: string[] = [];
		const onCmd = (e: Event) =>
			seen.push((e as CustomEvent).detail.intent as string);
		window.addEventListener("assistant-command", onCmd);
		try {
			applyStreamEvent({ type: "command", intent: "open_voices" }, t.sink);
		} finally {
			window.removeEventListener("assistant-command", onCmd);
		}
		expect(seen).toEqual(["open_voices"]);
	});

	it("merges harness_session into previous stats and replaces on summary", () => {
		const t = makeSink();
		applyStreamEvent(
			{ type: "harness_session", session_id: "s1", n_ctx: 4096 },
			t.sink,
		);
		expect(t.harness?.session_id).toBe("s1");
		expect(t.harness?.budget_remaining).toBe(100);
		applyStreamEvent(
			{ type: "harness_summary", summary: { type: "x", n_ctx: 8192 } },
			t.sink,
		);
		expect(t.harness?.n_ctx).toBe(8192);
		expect(t.harness?.session_id).toBe("");
	});

	it("ignores unknown event types", () => {
		const t = makeSink();
		applyStreamEvent({ type: "future_type", content: "?" }, t.sink);
		expect(t.messages).toEqual([]);
		expect(t.harness).toBeNull();
	});
});
