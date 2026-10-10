import { Spinner } from "@/ui/Spinner";

interface AssistantHistoryPanelProps {
	historyConvs: Array<{ id: string; name?: string; updated_at?: string }>;
	loadingConversation: boolean;
	loadHistoryConversation: (id: string) => void;
}

export function AssistantHistoryPanel({
	historyConvs,
	loadingConversation,
	loadHistoryConversation,
}: AssistantHistoryPanelProps) {
	return (
		<div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
			{historyConvs.map((c) => (
				<button
					key={c.id}
					type="button"
					onClick={() => loadHistoryConversation(c.id)}
					disabled={loadingConversation}
					className="w-full text-left rounded-lg border border-border px-3 py-2 hover:bg-muted/50"
				>
					<p className="text-sm font-medium truncate">
						{c.name || "Conversation"}
					</p>
					{c.updated_at && (
						<p className="text-xs text-muted-foreground">{c.updated_at}</p>
					)}
					{loadingConversation && (
						<Spinner size="xs" className="absolute right-3" />
					)}
				</button>
			))}
			{historyConvs.length === 0 && (
				<p className="text-xs text-muted-foreground">No past conversations.</p>
			)}
		</div>
	);
}
