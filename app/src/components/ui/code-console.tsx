import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type CodeConsoleVariant = "terminal" | "code";

interface CodeConsoleProps {
	variant?: CodeConsoleVariant;
	children: ReactNode;
	className?: string;
	maxHeight?: string;
	showBorder?: boolean;
	title?: string;
}

/**
 * Shared component for terminal-style and code-block displays.
 *
 * - `"terminal"` — dark console with syntax-colored tokens (--color-terminal-*).
 * - `"code"` — neutral muted code block (--color-muted).
 *
 * Replaces all inline `bg-terminal-bg font-mono` and `bg-sunken font-mono`
 * patterns across the app.
 */
export function CodeConsole({
	variant = "code",
	children,
	className,
	maxHeight,
	showBorder = false,
	title,
}: CodeConsoleProps) {
	return (
		<div
			className={cn(
				"rounded-md p-3 font-mono text-xs leading-relaxed overflow-auto whitespace-pre-wrap break-all",
				showBorder && "border",
				variant === "terminal" &&
					"bg-[var(--color-terminal-bg)] text-[var(--color-terminal-fg)]",
				variant === "code" && "bg-sunken text-muted-foreground",
				className,
			)}
			title={title}
			style={maxHeight ? { maxHeight } : undefined}
		>
			{children}
		</div>
	);
}

/* ── Token sub-components for terminal variant ────────────────────────── */

export function TerminalError({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<span className={cn("text-[var(--color-terminal-error)]", className)}>
			{children}
		</span>
	);
}

export function TerminalInfo({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<span className={cn("text-[var(--color-terminal-info)]", className)}>
			{children}
		</span>
	);
}

export function TerminalString({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<span className={cn("text-[var(--color-terminal-string)]", className)}>
			{children}
		</span>
	);
}

export function TerminalComment({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<span className={cn("text-[var(--color-terminal-comment)]", className)}>
			{children}
		</span>
	);
}

export function TerminalSuccess({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<span className={cn("text-[var(--color-terminal-success)]", className)}>
			{children}
		</span>
	);
}
