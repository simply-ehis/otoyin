import { cn } from "@/lib/utils/cn";
import { Spinner } from "./primitives";

/**
 * Canonical app boot screen: brand mark breathing (Rose is the only
 * motion in the visual identity), one honest loading line. Shown while
 * route chunks load — never a blank pane.
 */
export function AppLoadingScreen({
	label = "Loading Otoyin",
}: {
	label?: string;
}) {
	return (
		<output
			aria-label={label}
			className="flex h-full min-h-[240px] flex-1 flex-col items-center justify-center gap-4"
		>
			<svg
				viewBox="0 0 32 32"
				aria-hidden="true"
				className="animate-logo-breath size-10 text-accent"
				fill="currentColor"
			>
				<circle cx="16" cy="16" r="9" fillOpacity="0.25" />
				<circle cx="16" cy="16" r="4.5" />
			</svg>
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Spinner size="sm" />
				<span>{label}…</span>
			</div>
		</output>
	);
}

/** Screen-level loading fallback for lazy routes (Suspense). */
export function PageLoadingFallback() {
	return (
		<div className={cn("flex h-full flex-1 flex-col gap-2 p-8")}>
			<div
				aria-hidden="true"
				className="h-7 w-48 animate-pulse rounded-sm bg-secondary"
			/>
			<div
				aria-hidden="true"
				className="h-4 w-96 max-w-full animate-pulse rounded-sm bg-secondary"
			/>
			<div
				aria-hidden="true"
				className="mt-4 h-40 animate-pulse rounded-md bg-secondary"
			/>
		</div>
	);
}
