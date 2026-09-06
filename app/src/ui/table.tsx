import type * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Canonical data table: real column grid (values line up), numeric
 * columns right-aligned, ellipsis + title tooltip on truncation.
 */
export function Table({
	className,
	...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
	return (
		<div className="w-full overflow-x-auto rounded-md border border-border">
			<table
				className={cn("w-full border-collapse text-sm", className)}
				{...props}
			/>
		</div>
	);
}

export function TableHead({
	className,
	...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
	return <thead className={cn("bg-sunken", className)} {...props} />;
}

export function TableBody({
	className,
	...props
}: React.HTMLAttributes<HTMLTableSectionElement>) {
	return (
		<tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />
	);
}

export function TableRow({
	className,
	...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
	return (
		<tr
			className={cn(
				"border-b border-border transition-colors last:border-0 hover:bg-secondary",
				className,
			)}
			{...props}
		/>
	);
}

export function TableHeaderCell({
	numeric,
	className,
	...props
}: React.ThHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
	return (
		<th
			className={cn(
				"h-9 whitespace-nowrap px-3 font-medium text-muted-foreground [&:first-child]:pl-4 [&:last-child]:pr-4",
				numeric ? "text-right tabular-nums" : "text-left",
				className,
			)}
			{...props}
		/>
	);
}

export function TableCell({
	numeric,
	className,
	children,
	...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & { numeric?: boolean }) {
	const text = typeof children === "string" ? children : undefined;
	return (
		<td
			className={cn(
				"max-w-[240px] truncate px-3 py-2 text-foreground [&:first-child]:pl-4 [&:last-child]:pr-4",
				numeric && "text-right tabular-nums",
				className,
			)}
			title={text}
			{...props}
		>
			{children}
		</td>
	);
}
