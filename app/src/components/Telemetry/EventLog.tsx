import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/20/solid";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { CodeConsole } from "@/components/ui/code-console";

interface TelemetryEvent {
	name: string;
	properties: Record<string, unknown>;
	timestamp: string;
}

interface EventLogProps {
	events: TelemetryEvent[];
}

const EVENT_COLORS: Record<
	string,
	"default" | "secondary" | "destructive" | "outline"
> = {
	generation_completed: "default",
	generation_failed: "destructive",
	model_downloaded: "default",
	profile_created: "secondary",
	profile_deleted: "destructive",
	effects_applied: "outline",
	app_started: "secondary",
	app_closed: "secondary",
	backend_started: "secondary",
};

function formatTime(ts: string) {
	try {
		const d = new Date(ts);
		return d.toLocaleString();
	} catch {
		return ts;
	}
}

export function EventLog({ events }: EventLogProps) {
	const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

	if (events.length === 0) {
		return (
			<p className="text-sm text-muted-foreground text-center py-8">
				No events recorded yet.
			</p>
		);
	}

	return (
		<div className="border rounded-md divide-y divide-border max-h-[500px] overflow-y-auto">
			{events.map((event, idx) => {
				const isOpen = expandedIdx === idx;
				const props = event.properties ?? {};
				const propKeys = Object.keys(props);

				return (
					<div key={`${event.timestamp}-${idx}`} className="flex flex-col">
						<button
							type="button"
							className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left w-full"
							onClick={() => setExpandedIdx(isOpen ? null : idx)}
						>
							{propKeys.length > 0 ? (
								isOpen ? (
									<ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
								) : (
									<ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
								)
							) : (
								<span className="w-4 shrink-0" />
							)}
							<Badge variant={EVENT_COLORS[event.name] ?? "secondary"}>
								{event.name}
							</Badge>
							<span className="text-xs text-muted-foreground flex-1 truncate">
								{formatTime(event.timestamp)}
							</span>
						</button>
						{isOpen && propKeys.length > 0 && (
							<div className="px-4 pb-3 pt-0 ml-7">
								<CodeConsole maxHeight="15rem">
									{JSON.stringify(props, null, 2)}
								</CodeConsole>
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
