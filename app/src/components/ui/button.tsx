import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
	[
		"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-geist",
		"font-medium ring-offset-background transition-[transform,colors,box-shadow] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2",
		"focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
		"[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
		"[@media(hover:hover)]:hover:shadow-sm active:scale-[0.97] active:shadow-none",
	],
	{
		variants: {
			variant: {
				default:
					"bg-[hsl(0,0%,var(--btn-on-light))] text-[hsl(0,0%,var(--btn-on-light-fg))] [@media(hover:hover)]:hover:opacity-90 [@media(hover:hover)]:hover:shadow-md",
				"work-surface":
					"bg-[hsl(0,0%,var(--btn-on-dark))] text-[hsl(0,0%,var(--btn-on-dark-fg))] [@media(hover:hover)]:hover:opacity-90 [@media(hover:hover)]:hover:shadow-md",
				destructive:
					"bg-destructive text-destructive-foreground [@media(hover:hover)]:hover:bg-destructive/90 [@media(hover:hover)]:hover:shadow-md",
				outline:
					"border border-input bg-background [@media(hover:hover)]:hover:bg-[hsl(0,0%,var(--gs-muted))] [@media(hover:hover)]:hover:text-foreground [@media(hover:hover)]:hover:border-border",
				secondary:
					"bg-secondary text-secondary-foreground [@media(hover:hover)]:hover:bg-secondary/80 [@media(hover:hover)]:hover:shadow-sm",
				ghost:
					"[@media(hover:hover)]:hover:bg-[hsl(0,0%,var(--gs-muted))] [@media(hover:hover)]:hover:text-foreground",
				link: "text-foreground underline-offset-4 [@media(hover:hover)]:hover:underline",
			},
			size: {
				default: "h-10 px-4 py-2",
				sm: "h-8 px-3 text-xs",
				lg: "h-12 px-8",
				icon: "h-10 w-10",
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
