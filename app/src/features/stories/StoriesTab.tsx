import { Composer } from "@/features/generate/Composer";
import { StoryContent } from "./StoryContent";
import { StoryList } from "./StoryList";

/**
 * Stories: library rail, line-item content, voice composer docked
 * below. Multitrack timeline editing lands with the studio phase.
 */
export function StoriesTab() {
	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
				<div className="flex min-h-0 w-full max-w-[360px] shrink-0 flex-col overflow-hidden">
					<StoryList />
				</div>
				<div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
					<StoryContent />
				</div>
			</div>
			<div className="shrink-0 border-t border-border bg-background pt-3">
				<Composer />
			</div>
		</div>
	);
}
