import type * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface CircleButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement> {
	icon: React.ComponentType<{ className?: string }>;
	ref?: React.Ref<HTMLButtonElement>;
	/** Accessible name for the icon-only button. Sets both aria-label and title. */
	label?: string;
}

export function CircleButton({
	ref,
	className,
	icon: Icon,
	type = "button",
	label,
	...props
}: CircleButtonProps) {
	const a11y = label ? { "aria-label": label, title: label } : {};
	return (
		<button
			ref={ref}
			type={type}
			className={cn(
				"size-8 rounded-full flex items-center justify-center flex-shrink-0",
				"[@media(hover:hover)]:hover:bg-muted transition-colors active:scale-[0.97]",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
				"disabled:opacity-50 disabled:cursor-not-allowed",
				className,
			)}
			{...a11y}
			{...props}
		>
			<Icon className="size-[60%] text-muted-foreground/60" />
		</button>
	);
}
