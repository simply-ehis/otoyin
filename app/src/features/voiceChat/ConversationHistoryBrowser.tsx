import {
	ChatBubbleLeftRightIcon as Conversation,
	TrashIcon as Trash,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { Conversation as ConversationType } from "@/lib/api/clientMemory";
import { Button } from "@/ui/button";

interface Props {
	onClose: () => void;
	onSelect: (conversationId: string) => void;
}

export function ConversationHistoryBrowser({ onClose, onSelect }: Props) {
	const [conversations, setConversations] = useState<ConversationType[]>([]);
	const [loading, setLoading] = useState(true);
	const [deleting, setDeleting] = useState<string | null>(null);

	const loadConversations = useCallback(async () => {
		setLoading(true);
		try {
			const convs = await apiClient.listConversations("voice_chat", 50, 0);
			setConversations(convs);
		} catch {
			setConversations([]);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadConversations();
	}, [loadConversations]);

	const handleDelete = useCallback(async (id: string) => {
		setDeleting(id);
		try {
			await apiClient.deleteConversation(id);
			setConversations((prev) => prev.filter((c) => c.id !== id));
		} finally {
			setDeleting(null);
		}
	}, []);

	const formatDate = (iso: string | null) => {
		if (!iso) {
			return "";
		}
		const d = new Date(iso);
		const now = new Date();
		const diffMs = now.getTime() - d.getTime();
		const diffMin = Math.floor(diffMs / 60000);
		if (diffMin < 1) {
			return "Just now";
		}
		if (diffMin < 60) {
			return `${diffMin}m ago`;
		}
		const diffHrs = Math.floor(diffMin / 60);
		if (diffHrs < 24) {
			return `${diffHrs}h ago`;
		}
		const diffDays = Math.floor(diffHrs / 24);
		if (diffDays < 7) {
			return `${diffDays}d ago`;
		}
		return d.toLocaleDateString();
	};

	return (
		<div className="border-t border-border bg-sidebar p-4 space-y-3 max-h-[60vh] overflow-y-auto max-sm:fixed max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:top-auto max-sm:mt-0 max-sm:w-full max-sm:max-h-[70vh] max-sm:rounded-b-none max-sm:border-b-0 max-sm:z-50">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Conversation className="size-4 text-muted-foreground" />
					<span className="text-xs font-semibold">Conversations</span>
				</div>
				<Button
					variant="ghost"
					size="icon"
					className="size-6"
					onClick={onClose}
				>
					x
				</Button>
			</div>

			{loading ? (
				<p className="text-xs text-muted-foreground">Loading…</p>
			) : conversations.length === 0 ? (
				<p className="text-xs text-muted-foreground italic">
					No voice conversations yet.
				</p>
			) : (
				<div className="space-y-1">
					{conversations.map((conv) => (
						<div
							key={conv.id}
							className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-accent/50 group"
						>
							<button
								type="button"
								className="flex-1 text-left min-w-0"
								onClick={() => onSelect(conv.id)}
							>
								<p className="text-xs truncate">
									{conv.title || `Conversation ${conv.id.slice(0, 8)}`}
								</p>
								<p className="text-xs text-muted-foreground">
									{conv.message_count} messages
									{conv.updated_at && ` · ${formatDate(conv.updated_at)}`}
								</p>
							</button>
							<Button
								variant="ghost"
								size="icon"
								className="size-5 opacity-0 group-hover:opacity-100 transition-opacity"
								onClick={() => handleDelete(conv.id)}
								disabled={deleting === conv.id}
								title="Delete conversation"
								aria-label="Delete conversation"
							>
								<Trash className="size-3" />
							</Button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
