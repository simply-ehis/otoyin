import {
	ExclamationTriangleIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";

interface HintBannerProps {
	message: string;
	onDismiss: () => void;
}

/**
 * Subtle, dismissible, non-blocking hint for recoverable failures (remote
 * catalog refresh, model download start). Same pattern for every Store hint:
 * warning-soft surface, warning text, X dismiss; clears automatically on the
 * next success. Never used for destructive or data-loss errors — those stay
 * as toasts.
 */
export function HintBanner({ message, onDismiss }: HintBannerProps) {
	return (
		<output className="flex items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning-text">
			<div className="flex min-w-0 items-center gap-2">
				<ExclamationTriangleIcon className="size-4 shrink-0" />
				<span>{message}</span>
			</div>
			<button
				type="button"
				onClick={onDismiss}
				className="shrink-0 rounded p-1 transition-colors hover:bg-warning/15"
				title="Dismiss"
				aria-label="Dismiss"
			>
				<XMarkIcon className="size-3.5" />
			</button>
		</output>
	);
}
