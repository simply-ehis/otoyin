import * as PopoverPrimitive from "@radix-ui/react-popover";
import type * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Canonical popover: origin-aware entrance (trigger-anchored), solid
 * overlay surface. Dismiss: outside click, Escape, or selection.
 */
export function Popover(props: PopoverPrimitive.PopoverProps) {
	return <PopoverPrimitive.Root {...props} />;
}

export function PopoverTrigger(props: PopoverPrimitive.PopoverTriggerProps) {
	return <PopoverPrimitive.Trigger {...props} />;
}

export function PopoverContent({
	className,
	align = "center",
	sideOffset = 8,
	...props
}: PopoverPrimitive.PopoverContentProps) {
	return (
		<PopoverPrimitive.Portal>
			<PopoverPrimitive.Content
				align={align}
				sideOffset={sideOffset}
				className={cn(
					"z-[90] w-72 rounded-md border border-border bg-popover p-2 shadow-[0_4px_12px_rgba(0,0,0,0.45),0_1px_2px_rgba(0,0,0,0.25)]",
					"ds-enter ds-exit origin-[var(--radix-popover-content-transform-origin)]",
					className,
				)}
				{...props}
			/>
		</PopoverPrimitive.Portal>
	);
}

/** Menu item row inside a popover menu. */
export function PopoverItem({
	className,
	...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
	return (
		<button
			type="button"
			className={cn(
				"flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-foreground transition-colors",
				"hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				"disabled:cursor-not-allowed disabled:opacity-40",
				className,
			)}
			{...props}
		/>
	);
}
