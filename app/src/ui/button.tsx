import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Canonical button — the only button in the rebuilt app.
 * One primary per view; destructive gets its own color + confirmation.
 * Proof: filled / outlined / ghost hierarchy, press scale(0.97), rose ring.
 */
const buttonVariants = cva(
	[
		"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium",
		"transition-[transform,background-color,border-color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2",
		"focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-40 disabled:cursor-not-allowed",
		"[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
		"[@media(hover:hover)]:hover:shadow-sm active:scale-[0.97] active:shadow-none",
	],
	{
		variants: {
			variant: {
				default:
					"bg-primary text-primary-foreground [@media(hover:hover)]:hover:brightness-110",
				secondary:
					"bg-secondary text-secondary-foreground border border-strong [@media(hover:hover)]:hover:bg-secondary-hover",
				outline:
					"border border-input bg-background [@media(hover:hover)]:hover:bg-secondary [@media(hover:hover)]:hover:text-foreground",
				ghost: "text-muted-foreground [@media(hover:hover)]:hover:bg-secondary [@media(hover:hover)]:hover:text-foreground",
				destructive:
					"bg-destructive text-destructive-foreground [@media(hover:hover)]:hover:brightness-110",
				link: "text-foreground underline-offset-4 [@media(hover:hover)]:hover:underline",
			},
			size: {
				default: "h-9 px-4 py-2",
				sm: "h-7 px-3 text-xs",
				lg: "h-11 px-6 text-[15px]",
				icon: "h-9 w-9",
				"icon-sm": "h-7 w-7",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {
	asChild?: boolean;
	loading?: boolean;
}

export function Button({
	className,
	variant,
	size,
	asChild = false,
	loading = false,
	disabled,
	children,
	...props
}: ButtonProps) {
	const isDisabled = disabled || loading;
	if (asChild) {
		return (
			<Slot
				className={cn(buttonVariants({ variant, size, className }))}
				{...(props as Record<string, unknown>)}
			>
				{children}
			</Slot>
		);
	}
	return (
		<button
			className={cn(
				buttonVariants({ variant, size, className }),
				loading && "relative",
			)}
			disabled={isDisabled}
			aria-busy={loading ? "true" : undefined}
			{...props}
		>
			<span
				className={cn("inline-flex items-center gap-2", loading && "invisible")}
			>
				{children}
			</span>
			{loading && (
				<span
					className="absolute inset-0 inline-flex items-center justify-center"
					aria-hidden="true"
				>
					<span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
				</span>
			)}
		</button>
	);
}

export { buttonVariants };
