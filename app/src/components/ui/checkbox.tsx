import { CheckIcon as Check } from "@heroicons/react/24/outline";
import type * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface CheckboxProps {
	checked?: boolean;
	onCheckedChange?: (checked: boolean) => void;
	disabled?: boolean;
	className?: string;
	id?: string;
	ref?: React.Ref<HTMLInputElement>;
}

export function Checkbox({
	checked = false,
	onCheckedChange,
	disabled = false,
	className,
	id,
	ref,
	...props
}: CheckboxProps) {
	return (
		<label
			className={cn(
				"size-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
				checked
					? "bg-accent border-accent"
					: "border-muted-foreground/30 [@media(hover:hover)]:hover:border-ring",
				disabled
					? "opacity-50 cursor-not-allowed"
					: "cursor-pointer active:scale-[0.97]",
				className,
			)}
		>
			<input
				type="checkbox"
				ref={ref}
				id={id}
				checked={checked}
				disabled={disabled}
				onChange={(e) => {
					if (!disabled && onCheckedChange) {
						onCheckedChange(e.target.checked);
					}
				}}
				className="sr-only"
				{...props}
			/>
			{checked && <Check className="size-3 text-accent-foreground" />}
		</label>
	);
}
