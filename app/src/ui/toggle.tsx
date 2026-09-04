import type * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Canonical toggle button: pressed state is a filled segment
 * (never color/border alone). Keyboard: Space/Enter activate natively.
 */
export function Toggle({
	pressed,
	onPressedChange,
	className,
	...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
	pressed?: boolean;
	onPressedChange?: (pressed: boolean) => void;
}) {
	return (
		<button
			type="button"
			aria-pressed={pressed}
			onClick={() => onPressedChange?.(!pressed)}
			className={cn(
				"inline-flex h-9 items-center justify-center gap-2 rounded-md px-3 text-sm text-muted-foreground transition-colors duration-150",
				"hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				"disabled:cursor-not-allowed disabled:opacity-40",
				pressed && "bg-secondary text-foreground shadow-sm",
				"[&_svg]:size-4 [&_svg]:shrink-0",
				className,
			)}
			{...props}
		/>
	);
}
