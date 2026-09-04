import type * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Canonical switch: immediate-effect on/off only. Thumb slides
 * (transform, 200ms) — never teleports. Keyboard: Space toggles.
 */
export function Switch({
	checked,
	onCheckedChange,
	label,
	className,
}: {
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	label: string;
	className?: string;
}) {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-label={label}
			title={label}
			onClick={() => onCheckedChange(!checked)}
			className={cn(
				"relative h-[22px] w-10 shrink-0 rounded-full border border-transparent transition-colors duration-150",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
				checked ? "bg-primary" : "bg-strong",
				className,
			)}
		>
			<span
				aria-hidden="true"
				className={cn(
					"absolute top-1/2 left-[2px] size-[18px] -translate-y-1/2 rounded-full bg-white transition-transform duration-200 ease-out",
					checked && "translate-x-[18px]",
				)}
			/>
		</button>
	);
}

/** Canonical checkbox: multi-select within a set, independent options. */
export function Checkbox({
	label,
	className,
	...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
	return (
		<label className={cn("inline-flex cursor-pointer items-center gap-2", className)}>
			<input
				type="checkbox"
				aria-label={label}
				className="size-4 shrink-0 cursor-pointer accent-primary"
				{...props}
			/>
			<span className="text-sm text-foreground">{label}</span>
		</label>
	);
}

/** Canonical radio: single-select within a visible set of 2–6. */
export function Radio({
	label,
	name,
	className,
	...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
	label: string;
	name: string;
}) {
	return (
		<label className={cn("inline-flex cursor-pointer items-center gap-2", className)}>
			<input
				type="radio"
				name={name}
				aria-label={label}
				className="size-4 shrink-0 cursor-pointer accent-primary"
				{...props}
			/>
			<span className="text-sm text-foreground">{label}</span>
		</label>
	);
}

/**
 * Canonical segmented control: single-select where seeing all options
 * side-by-side matters (view mode, density). Instant switching.
 */
export function Segmented<T extends string>({
	options,
	value,
	onChange,
	label,
	className,
}: {
	options: ReadonlyArray<{ value: T; label: string }>;
	value: T;
	onChange: (value: T) => void;
	label: string;
	className?: string;
}) {
	return (
		<div
			role="group"
			aria-label={label}
			className={cn(
				"inline-flex gap-0.5 rounded-md border border-border bg-sunken p-[3px]",
				className,
			)}
		>
			{options.map((opt) => (
				<button
					key={opt.value}
					type="button"
					aria-pressed={opt.value === value}
					onClick={() => onChange(opt.value)}
					className={cn(
						"rounded-[6px] px-3 py-1 text-[13px] transition-colors duration-150",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						opt.value === value
							? "bg-card text-foreground shadow-sm"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					{opt.label}
				</button>
			))}
		</div>
	);
}
