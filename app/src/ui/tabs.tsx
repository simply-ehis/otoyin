import * as TabsPrimitive from "@radix-ui/react-tabs";
import type * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Canonical tabs: active indicator is a filled segment (never color
 * alone). Keyboard: arrows move within the set (Radix roving tabindex).
 */
export function Tabs(props: TabsPrimitive.TabsProps) {
	return <TabsPrimitive.Root {...props} />;
}

export function TabsList({
	className,
	...props
}: TabsPrimitive.TabsListProps) {
	return (
		<TabsPrimitive.List
			className={cn(
				"inline-flex items-center gap-0.5 rounded-md border border-border bg-sunken p-[3px]",
				className,
			)}
			{...props}
		/>
	);
}

export function TabsTrigger({
	className,
	...props
}: TabsPrimitive.TabsTriggerProps) {
	return (
		<TabsPrimitive.Trigger
			className={cn(
				"rounded-[6px] px-3 py-1.5 text-[13px] text-muted-foreground transition-colors duration-150",
				"hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				"disabled:cursor-not-allowed disabled:opacity-40",
				"data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm",
				className,
			)}
			{...props}
		/>
	);
}

export function TabsContent({
	className,
	...props
}: TabsPrimitive.TabsContentProps) {
	return (
		<TabsPrimitive.Content
			className={cn(
				"mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				className,
			)}
			{...props}
		/>
	);
}

/** Page-level tab bar (settings sections, workspace views): underline-free,
 *  filled-segment style, scrolls horizontally on narrow windows. */
export function PageTabs({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			role="navigation"
			aria-label="Sections"
			className={cn("flex items-center gap-0.5 overflow-x-auto pb-1", className)}
		>
			{children}
		</div>
	);
}
