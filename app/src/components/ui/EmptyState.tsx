import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface EmptyStateProps {
	icon?: ReactNode;
	title: string;
	description?: string;
	action?: ReactNode;
	variant?: "default" | "error";
	className?: string;
}

// Consistent empty/error placeholder for sub-views: a rose-accent (or
// destructive, on error) icon chip, a title, optional description and action.
export function EmptyState({
	icon,
	title,
	description,
	action,
	variant = "default",
	className,
}: EmptyStateProps) {
	return (
		<div
			className={cn(
				"flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center",
				className,
			)}
		>
			{icon ? (
				<div
					className={cn(
						"flex size-9 items-center justify-center rounded-lg border",
						variant === "error"
							? "border-destructive bg-secondary text-destructive"
							: "border-border bg-secondary text-accent",
					)}
				>
					{icon}
				</div>
			) : null}
			<div className="space-y-0.5">
				<p
					className={cn(
						"text-sm font-medium",
						variant === "error" ? "text-destructive" : "text-foreground",
					)}
				>
					{title}
				</p>
				{description ? (
					<p className="text-xs text-muted-foreground">{description}</p>
				) : null}
			</div>
			{action ? <div className="mt-1">{action}</div> : null}
		</div>
	);
}
