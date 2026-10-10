import { cn } from "@/lib/utils/cn";
import { useStoryStore } from "@/stores/storyStore";

export function AutomationControls() {
	const showAutomation = useStoryStore((s) => s.showAutomation);
	const setShowAutomation = useStoryStore((s) => s.setShowAutomation);
	const selectedAutomationParam = useStoryStore(
		(s) => s.selectedAutomationParam,
	);
	const setSelectedAutomationParam = useStoryStore(
		(s) => s.setSelectedAutomationParam,
	);

	return (
		<div className="flex items-center gap-1 px-2 py-1 border-b bg-background">
			<button
				type="button"
				onClick={() => setShowAutomation(!showAutomation)}
				className={cn(
					"text-xs px-2 py-0.5 rounded transition-colors",
					showAutomation
						? "bg-primary text-primary-foreground"
						: "bg-muted text-muted-foreground hover:bg-muted/80",
				)}
			>
				Automation
			</button>
			{showAutomation &&
				(["volume", "pan", "mute"] as const).map((param) => (
					<button
						key={param}
						type="button"
						onClick={() =>
							setSelectedAutomationParam(
								selectedAutomationParam === param ? null : param,
							)
						}
						className={cn(
							"text-xs px-1.5 py-0.5 rounded transition-colors",
							selectedAutomationParam === param
								? "bg-primary text-primary-foreground"
								: "bg-muted text-muted-foreground hover:bg-muted/80",
						)}
					>
						{param.charAt(0).toUpperCase() + param.slice(1)}
					</button>
				))}
		</div>
	);
}
