import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Canonical tooltip: 500ms first-show delay, functional text or shortcut.
 * Never the only home for essential information. Every icon-only button
 * gets one AND an accessible name.
 */
export function TooltipProvider({
	delayDuration = 500,
	...props
}: TooltipPrimitive.TooltipProviderProps) {
	return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

export function Tooltip(props: TooltipPrimitive.TooltipProps) {
	return <TooltipPrimitive.Root {...props} />;
}

export function TooltipTrigger(props: TooltipPrimitive.TooltipTriggerProps) {
	return <TooltipPrimitive.Trigger {...props} />;
}

export function TooltipContent({
	className,
	shortcut,
	children,
	...props
}: TooltipPrimitive.TooltipContentProps & { shortcut?: string }) {
	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Content
				sideOffset={8}
				className={cn(
					"z-[110] flex items-center gap-1.5 whitespace-nowrap rounded-sm border border-border bg-popover px-2 py-1 text-xs text-foreground",
					"shadow-[0_4px_12px_rgba(0,0,0,0.45)]",
					"ds-enter ds-exit",
					className,
				)}
				{...props}
			>
				{children}
				{shortcut ? (
					<kbd className="rounded-[3px] border border-border bg-sunken px-1 font-sans text-[11px] text-muted-foreground">
						{shortcut}
					</kbd>
				) : null}
			</TooltipPrimitive.Content>
		</TooltipPrimitive.Portal>
	);
}

/**
 * IconButton: square canonical button with tooltip + accessible name
 * baked in (a11y floor: tooltip alone is invisible to screen readers).
 */
export function IconButton({
	label,
	shortcut,
	tooltipSide,
	className,
	children,
	...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
	label: string;
	shortcut?: string;
	tooltipSide?: "top" | "bottom" | "left" | "right";
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					title={label}
					aria-label={label}
					className={cn(
						"grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-150",
						"hover:bg-secondary hover:text-foreground active:scale-[0.97]",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
						"disabled:cursor-not-allowed disabled:opacity-40",
						"[&_svg]:size-[18px]",
						className,
					)}
					{...props}
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent side={tooltipSide} shortcut={shortcut}>
				{label}
			</TooltipContent>
		</Tooltip>
	);
}
