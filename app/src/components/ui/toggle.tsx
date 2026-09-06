import type * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface ToggleProps {
	checked?: boolean;
	onCheckedChange?: (checked: boolean) => void;
	disabled?: boolean;
	className?: string;
	id?: string;
	/** Accessible name for the switch (required for screen readers). */
	label?: string;
	children?: React.ReactNode;
	ref?: React.Ref<HTMLButtonElement>;
}

export function Toggle({
	checked = false,
	onCheckedChange,
	disabled = false,
	className,
	id,
	label,
	ref,
	...props
}: ToggleProps) {
	const a11y = label ? { "aria-label": label, title: label } : {};
	return (
		<button
			type="button"
			ref={ref}
			id={id}
			role="switch"
			aria-checked={checked}
			disabled={disabled}
			onClick={() => {
				if (!disabled && onCheckedChange) {
					onCheckedChange(!checked);
				}
			}}
			className={cn(
				"relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
				checked ? "bg-primary" : "bg-strong",
				disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
				className,
			)}
			{...a11y}
			{...props}
		>
			<span
				className={cn(
					"pointer-events-none block size-4 rounded-full bg-white shadow-sm transition-transform",
					checked ? "translate-x-[18px]" : "translate-x-[2px]",
				)}
			/>
		</button>
	);
}
