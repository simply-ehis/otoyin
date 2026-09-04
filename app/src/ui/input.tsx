import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Canonical text input. Persistent label lives with the caller (Field);
 * this is the control itself: sunken surface, rose focus border, rose ring.
 */
export function Input({
	className,
	type = "text",
	ref,
	...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
	ref?: React.Ref<HTMLInputElement>;
}) {
	return (
		<input
			ref={ref}
			type={type}
			className={cn(
				"h-9 w-full rounded-sm border border-input bg-sunken px-3 text-sm text-foreground",
				"placeholder:text-muted-foreground/60 transition-colors duration-150",
				"focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring",
				"disabled:opacity-50 disabled:cursor-not-allowed",
				"aria-[invalid=true]:border-destructive",
				className,
			)}
			{...props}
		/>
	);
}

/**
 * Labeled field: label + control + optional error/hint. Labels always
 * persist (never placeholder-only).
 */
export function Field({
	label,
	htmlFor,
	error,
	hint,
	children,
	className,
}: {
	label: string;
	htmlFor?: string;
	error?: string;
	hint?: string;
	children: React.ReactNode;
	className?: string;
}) {
	const describedBy = error ? `${htmlFor ?? "field"}-error` : undefined;
	return (
		<div className={cn("flex flex-col gap-1.5", className)}>
			<label
				htmlFor={htmlFor}
				className="text-xs font-medium text-muted-foreground"
			>
				{label}
			</label>
			{children}
			{error ? (
				<span id={describedBy} role="alert" className="text-xs text-destructive">
					{error}
				</span>
			) : hint ? (
				<span className="text-xs text-muted-foreground/70">{hint}</span>
			) : null}
		</div>
	);
}

/**
 * Search field: heroicon left, clear button right, shortcut badge.
 * Caller debounces (150–300ms) and owns the shortcut.
 */
export function SearchInput({
	className,
	shortcut,
	onClear,
	value,
	defaultValue,
	onChange,
	...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
	shortcut?: string;
	onClear?: () => void;
}) {
	// Uncontrolled mode (defaultValue) still shows the clear button: track
	// the typed text locally when no controlled `value` is provided.
	const [inner, setInner] = React.useState(defaultValue ?? "");
	const shownValue = value ?? inner;
	return (
		<div className={cn("relative", className)}>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth={1.8}
				strokeLinecap="round"
				aria-hidden="true"
				className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60"
			>
				<circle cx="11" cy="11" r="7" />
				<path d="m20 20-3.5-3.5" />
			</svg>
			<input
				type="search"
				className={cn(
					"h-9 w-full rounded-sm border border-input bg-sunken pl-9 text-sm text-foreground",
					"placeholder:text-muted-foreground/60 transition-colors duration-150",
					"focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring",
					"[&::-webkit-search-cancel-button]:hidden",
					onClear && shownValue ? "pr-16" : shortcut ? "pr-14" : "pr-3",
				)}
				value={value}
				defaultValue={value === undefined ? defaultValue : undefined}
				onChange={(e) => {
					if (value === undefined) {
						setInner(e.target.value);
					}
					onChange?.(e);
				}}
				{...props}
			/>
			{onClear && shownValue ? (
				<button
					type="button"
					onClick={onClear}
					aria-label="Clear search"
					className="absolute right-8 top-1/2 -translate-y-1/2 rounded-sm px-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
				>
					✕
				</button>
			) : null}
			{shortcut ? (
				<span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm border border-border bg-card px-1.5 py-px text-[11px] text-muted-foreground">
					{shortcut}
				</span>
			) : null}
		</div>
	);
}

/**
 * Canonical textarea: auto-height is the caller's job (rows prop);
 * scrolls internally past max-h.
 */
export function Textarea({
	className,
	ref,
	...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
	ref?: React.Ref<HTMLTextAreaElement>;
}) {
	return (
		<textarea
			ref={ref}
			className={cn(
				"w-full rounded-sm border border-input bg-sunken px-3 py-2 text-sm text-foreground",
				"placeholder:text-muted-foreground/60 transition-colors duration-150",
				"focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring",
				"disabled:opacity-50 disabled:cursor-not-allowed",
				"aria-[invalid=true]:border-destructive",
				className,
			)}
			{...props}
		/>
	);
}
