import { Suspense, lazy } from "react";
import type * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Button } from "./button";

const TabHelp = lazy(() =>
	import("@/features/help/TabHelp").then((m) => ({ default: m.TabHelp })),
);

/**
 * Canonical content panel: discrete unit on the base surface.
 * Flat sections (plain divs) everywhere else — card soup is banned.
 */
export function Panel({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
		return (
			<section
				className={cn(
					"rounded-lg border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.35)]",
					className,
				)}
				{...props}
			/>
		);
}

/**
 * Canonical section header: title + rule line (proof). Every content
 * section gets a clear header — no mystery meat.
 */
export function SectionHeader({
	title,
	action,
	className,
}: {
	title: string;
	action?: React.ReactNode;
	className?: string;
}) {
		return (
			<div className={cn("mb-4 flex items-baseline gap-3", className)}>
				<h2 className="text-sm font-semibold tracking-tight text-foreground">
					{title}
				</h2>
				<span aria-hidden="true" className="h-px flex-1 bg-border" />
				{action}
			</div>
		);
}

/**
 * Canonical screen header: screen title, description, header actions.
 * One per view, pinned above the scroll region.
 */
export function ScreenHeader({
	title,
	description,
	actions,
	helpPath,
	className,
}: {
	title: string;
	description?: string;
	actions?: React.ReactNode;
	helpPath?: string;
	className?: string;
}) {
		return (
			<div className={cn("flex items-center justify-between gap-3", className)}>
				<div className="min-w-0">
					<h1 className="text-base font-semibold tracking-tight text-foreground">
						{title}
					</h1>
					{description ? (
						<p className="mt-0.5 max-w-[640px] text-xs text-muted-foreground">
							{description}
						</p>
					) : null}
				</div>
				<div className="flex shrink-0 items-center gap-1.5">
					{helpPath ? (
						<Suspense fallback={null}>
							<TabHelp tabPath={helpPath} />
						</Suspense>
					) : null}
					{actions}
				</div>
			</div>
		);
}

/**
 * Canonical empty state: names what lives here + the primary action
 * to fill it. Never a blank pane.
 */
export function EmptyState({
	icon,
	title,
	body,
	action,
	className,
}: {
	icon?: React.ReactNode;
	title: string;
	body?: string;
	action?: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-col items-center gap-1.5 rounded-md border border-dashed border-strong px-6 py-8 text-center",
				className,
			)}
		>
			{icon ? (
				<span
					aria-hidden="true"
					className="mb-1 grid size-9 place-items-center rounded-md border border-border bg-secondary text-accent [&_svg]:size-[18px]"
				>
					{icon}
				</span>
			) : null}
			<p className="text-sm font-medium text-foreground">{title}</p>
			{body ? (
				<p className="max-w-[260px] text-[13px] text-muted-foreground">
					{body}
				</p>
			) : null}
			{action ? <div className="mt-1.5">{action}</div> : null}
		</div>
	);
}

/** Canonical loading block: skeleton matching eventual layout (no jump). */
export function LoadingState({
	label = "Loading",
	lines = 3,
	className,
}: {
	label?: string;
	lines?: number;
	className?: string;
}) {
	return (
		<output aria-label={label} className={cn("flex flex-col gap-2", className)}>
			{Array.from({ length: lines }, (_, i) => {
				const width = 100 - i * 13;
				return (
					<div
						key={width}
						aria-hidden="true"
						className="h-4 animate-pulse rounded-sm bg-secondary"
						style={{ width: `${width}%` }}
					/>
				);
			})}
		</output>
	);
}

/** Canonical error block: plain language + what to do + retry. */
export function ErrorState({
	title,
	body,
	onRetry,
	className,
}: {
	title: string;
	body?: string;
	onRetry?: () => void;
	className?: string;
}) {
	return (
		<div
			role="alert"
			className={cn(
				"flex flex-col items-start gap-1.5 rounded-md border border-destructive/40 bg-danger-soft px-4 py-3",
				className,
			)}
		>
			<p className="text-sm font-medium text-danger-text">{title}</p>
			{body ? <p className="text-[13px] text-danger-text/90">{body}</p> : null}
			{onRetry ? (
				<Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
					Retry
				</Button>
			) : null}
		</div>
	);
}
