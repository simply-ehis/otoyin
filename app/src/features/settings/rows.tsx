import type * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Settings section: clear header + divided rows. One idea per section;
 * unrelated groups separated by larger gaps (proximity = hierarchy).
 */
export function SettingSection({
	title,
	description,
	children,
	className,
}: {
	title?: string;
	description?: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<section className={cn("max-w-3xl", className)}>
			{title ? (
				<h3 className="text-base font-semibold tracking-tight text-foreground">
					{title}
				</h3>
			) : null}
			{description ? (
				<p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
			) : null}
			<div
				className={cn(
					"divide-y divide-border",
					(title ?? description) && "mt-2",
				)}
			>
				{children}
			</div>
		</section>
	);
}

/**
 * Single setting row: label + one-line description left, control right.
 * Full-width `children` render below for sliders and inputs.
 */
export function SettingRow({
	title,
	description,
	htmlFor,
	action,
	children,
}: {
	title: string;
	description?: string;
	htmlFor?: string;
	action?: React.ReactNode;
	children?: React.ReactNode;
}) {
	return (
		<div className="py-3">
			<div className="flex items-center justify-between gap-6">
				<div className="min-w-0">
					<label
						htmlFor={htmlFor}
						className={cn(
							"select-none text-sm font-medium leading-none text-foreground",
							htmlFor && "cursor-pointer",
						)}
					>
						{title}
					</label>
					{description ? (
						<p className="mt-1 text-[13px] leading-snug text-muted-foreground">
							{description}
						</p>
					) : null}
				</div>
				{action ? <div className="shrink-0">{action}</div> : null}
			</div>
			{children ? <div className="mt-3">{children}</div> : null}
		</div>
	);
}
