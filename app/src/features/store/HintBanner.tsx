import {
	ArrowPathIcon,
	ExclamationTriangleIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";

interface HintBannerProps {
	message: string;
	onDismiss: () => void;
	/** Optional one-step recovery (e.g. "Retry"), rendered before dismiss. */
	actionLabel?: string;
	/** Invoked when the action button is clicked; required with actionLabel. */
	onAction?: () => void;
	/** Tooltip / accessible description for the action button. */
	actionTitle?: string;
}

/**
 * Subtle, dismissible, non-blocking hint for recoverable failures (remote
 * catalog refresh, model download start, failed download tasks). Same
 * pattern for every Store hint: warning-soft surface, warning text, X
 * dismiss; clears automatically on the next success. Never used for
 * destructive or data-loss errors — those stay as toasts.
 *
 * An optional inline action (actionLabel + onAction) offers one-step
 * recovery — e.g. re-triggering a failed download — so the user doesn't
 * have to hunt for the originating card.
 */
export function HintBanner({
	message,
	onDismiss,
	actionLabel,
	onAction,
	actionTitle,
}: HintBannerProps) {
	return (
		<output className="flex items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning-text">
			<div className="flex min-w-0 items-center gap-2">
				<ExclamationTriangleIcon className="size-4 shrink-0" />
				<span>{message}</span>
			</div>
			<div className="flex shrink-0 items-center gap-1">
				{actionLabel && onAction && (
					<button
						type="button"
						onClick={onAction}
						className="flex items-center gap-1 rounded border border-warning/40 px-2 py-0.5 font-medium transition-colors hover:bg-warning/15"
						title={actionTitle ?? actionLabel}
					>
						<ArrowPathIcon className="size-3" aria-hidden="true" />
						{actionLabel}
					</button>
				)}
				<button
					type="button"
					onClick={onDismiss}
					className="rounded p-1 transition-colors hover:bg-warning/15"
					title="Dismiss"
					aria-label="Dismiss"
				>
					<XMarkIcon className="size-3.5" />
				</button>
			</div>
		</output>
	);
}
