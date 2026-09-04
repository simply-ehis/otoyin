import type * as React from "react";
import { cn } from "@/lib/utils/cn";

/** Canonical small label. Always programmatically associated by the caller. */
export function Label({
	className,
	...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
	return (
		<label
			className={cn("text-xs font-medium text-muted-foreground", className)}
			{...props}
		/>
	);
}

/** Canonical badge: solid soft surface, hue in text + hairline border only. */
const badgeTones: Record<string, string> = {
	neutral: "bg-secondary text-muted-foreground border-border",
	accent: "bg-secondary text-accent border-accent/20",
	success: "bg-success-soft text-success-text border-success/40",
	warning: "bg-warning-soft text-warning-text border-warning/40",
	danger: "bg-danger-soft text-danger-text border-destructive/40",
};

export function Badge({
	tone = "neutral",
	className,
	...props
}: React.HTMLAttributes<HTMLSpanElement> & {
	tone?: keyof typeof badgeTones;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
				badgeTones[tone],
				className,
			)}
			{...props}
		/>
	);
}

/** Model/engine state pill: ready / loading / idle / breaker (proof). */
export function StatePill({
	state,
	children,
	className,
}: {
	state: "ready" | "loading" | "idle" | "breaker";
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
				state === "ready" &&
					"border-success/40 bg-success-soft text-success-text",
				state === "loading" && "border-strong bg-secondary text-muted-foreground",
				state === "idle" && "border-border bg-transparent text-muted-foreground",
				state === "breaker" &&
					"border-warning/40 bg-warning-soft text-warning-text",
				className,
			)}
		>
			<span
				aria-hidden="true"
				className={cn(
					"size-1.5 rounded-full",
					state === "ready" && "bg-success",
					state === "loading" && "animate-pulse bg-muted-foreground",
					state === "idle" && "bg-muted-foreground/50",
					state === "breaker" && "bg-warning",
				)}
			/>
			{children}
		</span>
	);
}

/** Hairline separator. */
export function Separator({
	orientation = "horizontal",
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement> & {
	orientation?: "horizontal" | "vertical";
}) {
	return (
		<div
			role="separator"
			aria-orientation={orientation}
			className={cn(
				"bg-border",
				orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
				className,
			)}
			{...props}
		/>
	);
}

/** Skeleton block: shaped shimmer matching eventual layout (no layout jump). */
export function Skeleton({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			aria-hidden="true"
			className={cn("animate-pulse rounded-md bg-secondary", className)}
			{...props}
		/>
	);
}

/** Inline spinner. Fixed size, never shifts layout. */
export function Spinner({
	size = "md",
	className,
}: {
	size?: "xs" | "sm" | "md" | "lg";
	className?: string;
}) {
	return (
		<span
			role="status"
			aria-label="Loading"
			className={cn(
				"inline-block animate-spin rounded-full border-2 border-current border-t-transparent",
				size === "xs" && "size-3",
				size === "sm" && "size-4",
				size === "md" && "size-5",
				size === "lg" && "size-6",
				className,
			)}
		/>
	);
}
