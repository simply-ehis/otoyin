import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
	dispatchAssistantCommand,
	executeAssistantCommand,
} from "@/lib/assistantCommands";
import type { Msg } from "./AssistantPanel.types";
import { makeId } from "./AssistantPanel.types";

/** Live harness stats shown by the ContextWindowIndicator. */
export interface HarnessState {
	session_id: string;
	n_ctx: number;
	context_pressure: number;
	budget_remaining: number;
	total_tool_calls: number;
	successful_calls: number;
	failed_calls: number;
	tool_confidence: Record<string, number>;
	steering_hints: string[];
}

/** One parsed SSE event from the assistant stream. */
export interface StreamEventData {
	type: string;
	content?: string;
	tool_name?: string;
	tool_args?: Record<string, unknown>;
	tool_result?: string;
	intent?: string;
	session_id?: string;
	n_ctx?: number;
	context_pressure?: number;
	budget_remaining?: number;
	total_tool_calls?: number;
	successful_calls?: number;
	failed_calls?: number;
	tool_confidence?: Record<string, number>;
	steering_hints?: string[];
	summary?: StreamEventData;
}

export interface StreamEventSink {
	setMessages: Dispatch<SetStateAction<Msg[]>>;
	setHarnessState: Dispatch<SetStateAction<HarnessState | null>>;
	streamingBufferRef: MutableRefObject<string>;
	streamingFlushTimerRef: MutableRefObject<number | null>;
	flushStreamingBuffer: () => void;
}

/** Tool results that render as an audio preview bubble instead of text. */
const AUDIO_PREVIEW_TOOLS = new Set([
	"generate_speech",
	"generate_sfx",
	"transcribe",
]);

/** Apply one parsed SSE event to chat state. Unknown types are ignored. */
export function applyStreamEvent(
	data: StreamEventData,
	sink: StreamEventSink,
): void {
	const { setMessages, setHarnessState } = sink;
	if (data.type === "text") {
		// Accumulate in ref, flush periodically to avoid per-chunk re-renders
		sink.streamingBufferRef.current += data.content ?? "";
		if (sink.streamingFlushTimerRef.current === null) {
			// Schedule first flush in 50ms, subsequent flushes handled by flush function
			sink.streamingFlushTimerRef.current = window.setTimeout(
				sink.flushStreamingBuffer,
				50,
			);
		}
	} else if (data.type === "tool_call") {
		const toolName = data.tool_name ?? "";
		const toolArgs = data.tool_args ?? {};
		setMessages((prev) => [
			...prev,
			{
				id: makeId(),
				role: "tool_call",
				content: data.content ?? "",
				toolName,
				toolArgs,
			},
		]);
		// Execute client-side commands via the command registry.
		// Results are added as tool_result messages so the LLM/user can see them.
		void (async () => {
			try {
				const result = await executeAssistantCommand(toolName, toolArgs);
				setMessages((prev) => [
					...prev,
					{
						id: makeId(),
						role: "tool_result",
						content: JSON.stringify(result),
						toolName,
						toolArgs,
						toolResult: JSON.stringify(result),
					},
				]);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				setMessages((prev) => [
					...prev,
					{
						id: makeId(),
						role: "tool_result",
						content: JSON.stringify({ ok: false, error: message }),
						toolName,
						toolArgs,
						toolResult: JSON.stringify({ ok: false, error: message }),
					},
				]);
			}
		})();
	} else if (data.type === "tool_result") {
		if (data.tool_name && AUDIO_PREVIEW_TOOLS.has(data.tool_name)) {
			setMessages((prev) => [
				...prev,
				{
					id: makeId(),
					role: "audio_preview",
					content: data.tool_result ?? "",
				},
			]);
		} else {
			setMessages((prev) => [
				...prev,
				{
					id: makeId(),
					role: "tool_result",
					content: data.content ?? "",
					toolName: data.tool_name,
					toolResult: data.tool_result,
				},
			]);
		}
	} else if (data.type === "thinking") {
		setMessages((prev) => [
			...prev,
			{
				id: makeId(),
				role: "thinking",
				content: data.content ?? "",
			},
		]);
	} else if (data.type === "error") {
		setMessages((prev) => [
			...prev,
			{ id: makeId(), role: "error", content: data.content ?? "" },
		]);
	} else if (data.type === "command") {
		dispatchAssistantCommand(data.intent ?? "", data.tool_args ?? {});
	} else if (data.type === "harness_session") {
		setHarnessState((prev) => ({
			...(prev ?? {}),
			session_id: data.session_id ?? prev?.session_id ?? "",
			n_ctx: data.n_ctx ?? prev?.n_ctx ?? 0,
			context_pressure: prev?.context_pressure ?? 0,
			budget_remaining: prev?.budget_remaining ?? 100,
			total_tool_calls: prev?.total_tool_calls ?? 0,
			successful_calls: prev?.successful_calls ?? 0,
			failed_calls: prev?.failed_calls ?? 0,
			tool_confidence: prev?.tool_confidence ?? {},
			steering_hints: prev?.steering_hints ?? [],
		}));
	} else if (data.type === "harness_summary") {
		const s = data.summary ?? data;
		setHarnessState({
			session_id: s.session_id ?? "",
			n_ctx: s.n_ctx ?? 0,
			context_pressure: s.context_pressure ?? 0,
			budget_remaining: s.budget_remaining ?? 100,
			total_tool_calls: s.total_tool_calls ?? 0,
			successful_calls: s.successful_calls ?? 0,
			failed_calls: s.failed_calls ?? 0,
			tool_confidence: s.tool_confidence ?? {},
			steering_hints: s.steering_hints ?? [],
		});
	}
}
