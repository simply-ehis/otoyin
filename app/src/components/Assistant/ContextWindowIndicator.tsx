import { CpuChipIcon as Cpu } from "@heroicons/react/24/outline";
import { useState } from "react";

interface HarnessState {
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

export function ContextWindowIndicator({
	harnessState,
}: {
	harnessState: HarnessState | null;
}) {
	const [expanded, setExpanded] = useState(false);

	if (!harnessState) {
		return null;
	}

	const pressure = harnessState.context_pressure;
	const nCtx = harnessState.n_ctx;
	const usedTokens = Math.round(pressure * nCtx);
	const budgetPct =
		harnessState.budget_remaining > 0 ? harnessState.budget_remaining / 100 : 0;
	const successRate =
		harnessState.total_tool_calls > 0
			? harnessState.successful_calls / harnessState.total_tool_calls
			: 1;

	// Ring color: green < 60%, yellow < 80%, red >= 80%
	const ringColor =
		pressure >= 0.8
			? "text-danger-text"
			: pressure >= 0.6
				? "text-warning-text"
				: "text-success-text";
	const ringBg =
		pressure >= 0.8
			? "stroke-red-500/30"
			: pressure >= 0.6
				? "stroke-amber-500/30"
				: "stroke-emerald-500/30";

	if (!expanded) {
		return (
			<button
				type="button"
				onClick={() => setExpanded(true)}
				className={`relative size-7 flex items-center justify-center rounded-full transition-colors hover:bg-muted/50 ${ringColor}`}
				title={`Context: ${Math.round(pressure * 100)}% used`}
				aria-label={`Context window ${Math.round(pressure * 100)}% used`}
			>
				<svg
					className="size-7 -rotate-90"
					viewBox="0 0 28 28"
					role="img"
					aria-label="Context usage ring"
				>
					<circle
						cx="14"
						cy="14"
						r="12"
						fill="none"
						strokeWidth="2"
						className={ringBg}
					/>
					<circle
						cx="14"
						cy="14"
						r="12"
						fill="none"
						strokeWidth="2"
						strokeDasharray={`${2 * Math.PI * 12}`}
						strokeDashoffset={`${2 * Math.PI * 12 * (1 - pressure)}`}
						strokeLinecap="round"
						className={ringColor}
					/>
				</svg>
				<Cpu className="size-3 absolute" />
			</button>
		);
	}

	return (
		<div className="w-64 bg-background border border-border rounded-lg shadow-lg p-3 space-y-2 text-xs animate-in fade-in zoom-in-95">
			<div className="flex items-center justify-between">
				<span className="font-semibold text-sm">Context Window</span>
				<button
					type="button"
					onClick={() => setExpanded(false)}
					className="text-muted-foreground hover:text-foreground"
					aria-label="Collapse"
				>
					×
				</button>
			</div>

			{/* Context usage bar */}
			<div className="space-y-1">
				<div className="flex justify-between text-muted-foreground">
					<span>Context</span>
					<span>
						{usedTokens.toLocaleString()} / {nCtx.toLocaleString()} tokens
					</span>
				</div>
				<div className="h-1.5 bg-muted rounded-full overflow-hidden">
					<div
						className={`h-full rounded-full transition-all duration-300 ${
							pressure >= 0.8
								? "bg-destructive"
								: pressure >= 0.6
									? "bg-warning"
									: "bg-success"
						}`}
						style={{ width: `${Math.min(pressure * 100, 100)}%` }}
					/>
				</div>
			</div>

			{/* Budget */}
			<div className="space-y-1">
				<div className="flex justify-between text-muted-foreground">
					<span>Budget</span>
					<span>{harnessState.budget_remaining} calls left</span>
				</div>
				<div className="h-1.5 bg-muted rounded-full overflow-hidden">
					<div
						className="h-full bg-info rounded-full transition-all duration-300"
						style={{ width: `${budgetPct * 100}%` }}
					/>
				</div>
			</div>

			{/* Tool stats */}
			<div className="flex items-center justify-between pt-1 border-t border-border">
				<div className="flex items-center gap-3 text-muted-foreground">
					<span>Tools: {harnessState.total_tool_calls}</span>
					<span className="text-success-text">
						✓{harnessState.successful_calls}
					</span>
					{harnessState.failed_calls > 0 && (
						<span className="text-danger-text">
							✗{harnessState.failed_calls}
						</span>
					)}
				</div>
				<span
					className={`font-medium ${
						successRate >= 0.8
							? "text-success-text"
							: successRate >= 0.5
								? "text-warning-text"
								: "text-danger-text"
					}`}
				>
					{Math.round(successRate * 100)}%
				</span>
			</div>

			{/* Steering hints */}
			{harnessState.steering_hints.length > 0 && (
				<div className="pt-1 border-t border-border space-y-0.5">
					{harnessState.steering_hints.map((hint) => (
						<div
							key={hint.slice(0, 20)}
							className="text-muted-foreground italic"
						>
							{hint}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
