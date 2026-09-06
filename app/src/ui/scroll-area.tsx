import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { cn } from "@/lib/utils/cn";

/**
 * Canonical scroll area: slim native-feeling thumb, persistent track.
 * Scrollbars are never hidden on desktop.
 */
export function ScrollArea({
	className,
	children,
	...props
}: ScrollAreaPrimitive.ScrollAreaProps) {
	return (
		<ScrollAreaPrimitive.Root
			className={cn("relative overflow-hidden", className)}
			{...props}
		>
			<ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
				{children}
			</ScrollAreaPrimitive.Viewport>
			<ScrollBar />
			<ScrollAreaPrimitive.Corner />
		</ScrollAreaPrimitive.Root>
	);
}

export function ScrollBar({
	className,
	orientation = "vertical",
	...props
}: ScrollAreaPrimitive.ScrollAreaScrollbarProps) {
	return (
		<ScrollAreaPrimitive.Scrollbar
			orientation={orientation}
			className={cn(
				"flex touch-none select-none transition-colors",
				orientation === "vertical" &&
					"h-full w-2 border-l border-l-transparent p-px",
				orientation === "horizontal" &&
					"h-2 w-full flex-col border-t border-t-transparent p-px",
				className,
			)}
			{...props}
		>
			<ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-strong hover:bg-muted-foreground/60" />
		</ScrollAreaPrimitive.Scrollbar>
	);
}
