import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface ScreenHeaderProps {
	icon?: ReactNode;
	title: string;
	description?: string;
	actions?: ReactNode;
	className?: string;
}

export function ScreenHeader({
	icon,
	title,
	description,
	actions,
	className,
}: ScreenHeaderProps) {
	return (
		<header
			className={cn(
				"flex items-start justify-between gap-4 px-6 py-5",
				className,
			)}
		>
			<div className="flex items-start gap-3 min-w-0">
				{icon ? (
					<div className="shrink-0 size-10 rounded-xl bg-muted text-foreground flex items-center justify-center ring-1 ring-border/50">
						{icon}
					</div>
				) : null}
				<div className="min-w-0">
					<h1 className="text-lg font-semibold tracking-tight text-foreground truncate">
						{title}
					</h1>
					{description ? (
						<p className="mt-0.5 text-sm text-muted-foreground leading-snug">
							{description}
						</p>
					) : null}
				</div>
			</div>
			{actions ? (
				<div className="flex items-center gap-2 shrink-0">{actions}</div>
			) : null}
		</header>
	);
}
