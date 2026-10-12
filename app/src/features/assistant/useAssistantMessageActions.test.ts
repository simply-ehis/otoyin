import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { apiClient } from "@/lib/api/client";
import type { Msg } from "./AssistantPanel.types";
import { useAssistantMessageActions } from "./useAssistantMessageActions";

vi.mock("@/lib/api/client", () => ({
	apiClient: {
		updateMessage: vi.fn().mockResolvedValue(undefined),
		deleteMessage: vi.fn().mockResolvedValue(undefined),
		deleteMessagesAfter: vi.fn().mockResolvedValue(undefined),
	},
}));

const updateMock = vi.mocked(apiClient.updateMessage);
const deleteMock = vi.mocked(apiClient.deleteMessage);
const branchMock = vi.mocked(apiClient.deleteMessagesAfter);

function seed(): Msg[] {
	return [
		{ id: "a", serverId: "s-a", role: "user", content: "first" },
		{ id: "b", serverId: "s-b", role: "assistant", content: "reply" },
		{ id: "c", role: "user", content: "unsynced" },
	];
}

function useHarness(initial: Msg[], convId: string | null) {
	const [messages, setMessages] = useState(initial);
	const actions = useAssistantMessageActions(messages, setMessages, convId);
	return { messages, actions };
}

function setup(convId: string | null = "conv-1") {
	updateMock.mockClear();
	deleteMock.mockClear();
	branchMock.mockClear();
	return renderHook(({ m, c }) => useHarness(m, c), {
		initialProps: { m: seed(), c: convId },
	});
}

describe("useAssistantMessageActions", () => {
	it("saves an edit locally and syncs content to the server", async () => {
		const { result } = setup();
		act(() => {
			result.current.actions.editMessage("a");
		});
		expect(result.current.messages[0].isEditing).toBe(true);
		await act(async () => {
			result.current.actions.saveEditMessage("a", "first edited");
		});
		expect(result.current.messages[0].content).toBe("first edited");
		expect(result.current.messages[0].isEditing).toBe(false);
		expect(updateMock).toHaveBeenCalledWith("s-a", "first edited");
	});

	it("ignores blank edits without touching the server", () => {
		const { result } = setup();
		act(() => {
			result.current.actions.saveEditMessage("a", "   ");
		});
		expect(result.current.messages[0].content).toBe("first");
		expect(updateMock).not.toHaveBeenCalled();
	});

	it("edits unsynced messages locally only", () => {
		const { result } = setup();
		act(() => {
			result.current.actions.saveEditMessage("c", "now synced?");
		});
		expect(result.current.messages[2].content).toBe("now synced?");
		expect(updateMock).not.toHaveBeenCalled();
	});

	it("cancels edit mode without changing content", () => {
		const { result } = setup();
		act(() => {
			result.current.actions.editMessage("a");
		});
		act(() => {
			result.current.actions.cancelEditMessage("a");
		});
		expect(result.current.messages[0].isEditing).toBe(false);
		expect(result.current.messages[0].content).toBe("first");
	});

	it("deletes locally and syncs the server id", async () => {
		const { result } = setup();
		await act(async () => {
			result.current.actions.deleteMessage("b");
		});
		expect(result.current.messages.map((m) => m.id)).toEqual(["a", "c"]);
		expect(deleteMock).toHaveBeenCalledWith("s-b");
	});

	it("branches at the anchor and prunes later server messages", async () => {
		const { result } = setup();
		await act(async () => {
			result.current.actions.branchMessage("a");
		});
		expect(result.current.messages.map((m) => m.id)).toEqual(["a"]);
		expect(result.current.messages[0].branchPoint).toBe(true);
		expect(branchMock).toHaveBeenCalledWith("conv-1", "s-a");
	});

	it("branch without a conversation only truncates locally", () => {
		const { result } = setup(null);
		act(() => {
			result.current.actions.branchMessage("a");
		});
		expect(result.current.messages.map((m) => m.id)).toEqual(["a"]);
		expect(branchMock).not.toHaveBeenCalled();
	});
});
