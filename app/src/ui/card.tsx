import type * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Canonical card: discrete, comparable unit (product card, project card).
 * Flat sections everywhere else — card soup is banned.
 */
export function Card({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				"rounded-lg border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.35)]",
				"transition-transform duration-150 ease-out",
				className,
			)}
			{...props}
		/>
	);
}

export function CardHeader({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn("mb-3 flex items-start justify-between gap-3", className)}
			{...props}
		/>
	);
}

export function CardTitle({
	className,
	...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
	return (
		<h3
			className={cn(
				"text-sm font-semibold tracking-tight text-foreground",
				className,
			)}
			{...props}
		/>
	);
}

export function CardBody({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn("text-[13px] text-muted-foreground", className)}
			{...props}
		/>
	);
}

export function CardFooter({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	return (
		<div className={cn("mt-3 flex items-center gap-2", className)} {...props} />
	);
}
