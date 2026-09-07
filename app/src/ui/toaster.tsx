import {
	CheckCircleIcon,
	ExclamationCircleIcon,
	InformationCircleIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { memo } from "react";
import { cn } from "@/lib/utils/cn";
import { usePlayerStore } from "@/stores/playerStore";
import { dismissToast, useToast } from "./use-toast";

/**
 * Canonical toaster viewport: bottom-right, solid overlay surface,
 * 360px cap. Toasts are confirmations (4s); destructive persists 8s.
 * Screen readers get live-region announcements without focus theft.
 * Shifts up when the audio player is open so controls stay reachable.
 */
function ToasterInner() {
	const { toasts } = useToast();
	const isPlayerOpen = !!usePlayerStore((s) => s.audioUrl);
	return (
		<div
			aria-live="polite"
			aria-atomic="false"
			className={cn(
				"pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2",
				isPlayerOpen && "sm:bottom-44",
			)}
		>
			{toasts.map((t) => (
				<div
					key={t.id}
					role={t.variant === "destructive" ? "alert" : "status"}
					className={cn(
						"ds-mount-enter pointer-events-auto flex items-start gap-3 rounded-md border bg-popover p-4 shadow-[0_4px_12px_rgba(0,0,0,0.45),0_1px_2px_rgba(0,0,0,0.25)]",
						t.variant === "destructive"
							? "border-destructive/40"
							: t.variant === "success"
								? "border-success/40"
								: "border-border",
					)}
				>
					<span aria-hidden="true" className="mt-px shrink-0">
						{t.variant === "destructive" ? (
							<ExclamationCircleIcon className="size-[18px] text-destructive" />
						) : t.variant === "success" ? (
							<CheckCircleIcon className="size-[18px] text-success" />
						) : (
							<InformationCircleIcon className="size-[18px] text-muted-foreground" />
						)}
					</span>
					<div className="min-w-0 flex-1">
						{t.title ? (
							<div className="text-[13px] font-medium text-foreground">
								{t.title}
							</div>
						) : null}
						{t.description ? (
							<div className="mt-0.5 text-xs text-muted-foreground">
								{t.description}
							</div>
						) : null}
						{t.action}
					</div>
					<button
						type="button"
						onClick={() => dismissToast(t.id)}
						title="Dismiss"
						aria-label="Dismiss notification"
						className="grid size-[22px] shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:text-foreground"
					>
						<XMarkIcon className="size-3.5" />
					</button>
				</div>
			))}
		</div>
	);
}

// Memoize: subscribes to playerStore.audioUrl for layout adjustment.
export const Toaster = memo(ToasterInner);
