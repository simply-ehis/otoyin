import { useCallback, useRef } from "react";
import { apiClient } from "@/lib/api/client";
import { debug } from "@/lib/utils/debug";
import type { Msg } from "./AssistantPanel.types";

/** Local message mutations (edit/save/cancel/delete/branch) with best-effort server sync. */
export function useAssistantMessageActions(
	messages: Msg[],
	setMessages: React.Dispatch<React.SetStateAction<Msg[]>>,
	conversationId: string | null,
) {
	// Latest-messages mirror so callbacks can resolve server ids without
	// going through state (updater functions must stay pure).
	const messagesRef = useRef<Msg[]>([]);
	messagesRef.current = messages;

	const editMessage = useCallback(
		(id: string) => {
			setMessages((prev) =>
				prev.map((m) =>
					m.id === id ? { ...m, isEditing: true, branchPoint: true } : m,
				),
			);
		},
		[setMessages],
	);

	const saveEditMessage = useCallback(
		(id: string, content: string) => {
			const trimmed = content.trim();
			if (!trimmed) {
				return;
			}
			const target = messagesRef.current.find((m) => m.id === id);
			setMessages((prev) =>
				prev.map((m) =>
					m.id === id ? { ...m, content: trimmed, isEditing: false } : m,
				),
			);
			if (target?.serverId) {
				apiClient.updateMessage(target.serverId, trimmed).catch((err) => {
					debug.warn("[assistant] edit sync failed:", err);
				});
			}
		},
		[setMessages],
	);

	const cancelEditMessage = useCallback(
		(id: string) => {
			setMessages((prev) =>
				prev.map((m) => (m.id === id ? { ...m, isEditing: false } : m)),
			);
		},
		[setMessages],
	);

	const deleteMessage = useCallback(
		(id: string) => {
			const target = messagesRef.current.find((m) => m.id === id);
			setMessages((prev) => prev.filter((m) => m.id !== id));
			if (target?.serverId) {
				apiClient.deleteMessage(target.serverId).catch((err) => {
					debug.warn("[assistant] delete sync failed:", err);
				});
			}
		},
		[setMessages],
	);

	const branchMessage = useCallback(
		(id: string) => {
			const current = messagesRef.current;
			const idx = current.findIndex((m) => m.id === id);
			if (idx === -1) {
				return;
			}
			const anchor = current[idx];
			setMessages((prev) => {
				const i = prev.findIndex((m) => m.id === id);
				if (i === -1) {
					return prev;
				}
				return prev
					.slice(0, i + 1)
					.map((m, j) => (j === i ? { ...m, branchPoint: true } : m));
			});
			if (anchor?.serverId && conversationId) {
				apiClient
					.deleteMessagesAfter(conversationId, anchor.serverId)
					.catch((err) => {
						debug.warn("[assistant] branch sync failed:", err);
					});
			}
		},
		[conversationId, setMessages],
	);

	return {
		editMessage,
		saveEditMessage,
		cancelEditMessage,
		deleteMessage,
		branchMessage,
	};
}
