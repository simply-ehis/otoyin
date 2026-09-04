import { XMarkIcon } from "@heroicons/react/24/outline";
import type * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Canonical banner: persistent view/app-wide status. Stays until dismissed
 * or resolved — never auto-dismisses. One banner at a time (callers combine
 * conditions by highest severity). Solid surfaces only.
 */
const bannerTones = {
	info: {
		box: "border-strong bg-card text-muted-foreground",
		icon: "text-muted-foreground",
	},
	success: {
		box: "border-success/40 bg-success-soft text-success-text",
		icon: "text-success",
	},
	warning: {
		box: "border-warning/40 bg-warning-soft text-warning-text",
		icon: "text-warning",
	},
	danger: {
		box: "border-destructive/40 bg-danger-soft text-danger-text",
		icon: "text-destructive",
	},
} as const;

export type BannerTone = keyof typeof bannerTones;

export function Banner({
	tone = "info",
	icon,
	children,
	onDismiss,
	dismissLabel = "Dismiss",
	className,
}: {
	tone?: BannerTone;
	icon?: React.ReactNode;
	children: React.ReactNode;
	onDismiss?: () => void;
	dismissLabel?: string;
	className?: string;
}) {
	return (
		<div
			role={tone === "danger" ? "alert" : "status"}
			className={cn(
				"flex items-center gap-3 rounded-md border px-4 py-2.5 text-[13px]",
				bannerTones[tone].box,
				className,
			)}
		>
			{icon ? (
				<span aria-hidden="true" className={cn("shrink-0", bannerTones[tone].icon)}>
					{icon}
				</span>
			) : null}
			<div className="min-w-0 flex-1">{children}</div>
			{onDismiss ? (
				<button
					type="button"
					onClick={onDismiss}
					title={dismissLabel}
					aria-label={dismissLabel}
					className="grid size-[22px] shrink-0 place-items-center rounded-sm opacity-70 transition-opacity hover:opacity-100"
				>
					<XMarkIcon className="size-3.5" />
				</button>
			) : null}
		</div>
	);
}
