import { ClockIcon as History } from "@heroicons/react/24/outline";
import { Spinner } from "@/ui/Spinner";

interface AssistantHistoryPanelProps {
	historyConvs: Array<{ id: string; name?: string; updated_at?: string }>;
	loadingConversation: boolean;
	loadingHistory: boolean;
	loadHistoryConversation: (id: string) => void;
}

export function AssistantHistoryPanel({
	historyConvs,
	loadingConversation,
	loadingHistory,
	loadHistoryConversation,
}: AssistantHistoryPanelProps) {
	if (loadingHistory) {
		return (
			<output
				className="flex-1 overflow-y-auto px-4 py-4 space-y-2 block"
				aria-label="Loading conversations"
			>
				{[0, 1, 2].map((i) => (
					<div
						key={i}
						className="rounded-lg border border-border px-3 py-2 space-y-1.5"
					>
						<span className="block h-3.5 w-2/3 animate-pulse rounded bg-secondary" />
						<span className="block h-3 w-1/3 animate-pulse rounded bg-secondary" />
					</div>
				))}
			</output>
		);
	}
	return (
		<div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
			{historyConvs.map((c) => (
				<button
					key={c.id}
					type="button"
					onClick={() => loadHistoryConversation(c.id)}
					disabled={loadingConversation}
					className="relative w-full text-left rounded-lg border border-border px-3 py-2 transition-colors hover:bg-muted/50 active:scale-[0.99] disabled:opacity-50"
				>
					<p className="text-sm font-medium truncate">
						{c.name || "Conversation"}
					</p>
					{c.updated_at && (
						<p className="text-xs text-muted-foreground">{c.updated_at}</p>
					)}
					{loadingConversation && (
						<Spinner
							size="xs"
							className="absolute right-3 top-1/2 -translate-y-1/2"
						/>
					)}
				</button>
			))}
			{historyConvs.length === 0 && (
				<div className="flex flex-col items-center justify-center h-full text-center space-y-3 py-8">
					<div className="size-12 rounded-full bg-accent-muted flex items-center justify-center">
						<History className="size-6 text-accent/60" />
					</div>
					<div>
						<p className="text-sm font-medium text-foreground">
							No past conversations
						</p>
						<p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
							Your chats are saved here automatically as you talk to Otoyin.
						</p>
					</div>
				</div>
			)}
		</div>
	);
}
