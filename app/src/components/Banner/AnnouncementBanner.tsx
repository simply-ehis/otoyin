import {
	ExclamationTriangleIcon,
	InformationCircleIcon,
	SparklesIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import type { Announcement } from "@/lib/api/types";
import { useAnnouncements } from "@/lib/hooks/useContent";
import { cn } from "@/lib/utils/cn";
import { useContentStore } from "@/stores/contentStore";

function isActive(a: Announcement, now: number): boolean {
	const start = a.starts_at ? Date.parse(a.starts_at) : NaN;
	const end = a.ends_at ? Date.parse(a.ends_at) : NaN;
	if (!Number.isNaN(start) && now < start) {
		return false;
	}
	if (!Number.isNaN(end) && now > end) {
		return false;
	}
	return true;
}

const severityStyles: Record<Announcement["severity"], string> = {
	// Solid status surfaces — no translucent fills. Borders keep a low-alpha
	// hairline (allowed); backgrounds and text are solid tokens.
	info: "bg-secondary border-border text-foreground",
	success: "bg-success-soft border-success/40 text-success-text",
	warning: "bg-warning-soft border-warning/40 text-warning-text",
	promo: "bg-secondary border-accent/40 text-accent",
};

/**
 * Dismissible top banner for active announcements. Sits above the main
 * content area (next to RecommendedModelsBanner). Offline-first: data
 * comes from GET /content/announcements.
 */
export function AnnouncementBanner() {
	const navigate = useNavigate();
	const { data, isLoading } = useAnnouncements();
	const dismissed = useContentStore((s) => s.dismissedAnnouncements);
	const dismiss = useContentStore((s) => s.dismissAnnouncement);

	const now = Date.now();
	const active = useMemo(
		() =>
			(data ?? []).filter((a) => isActive(a, now) && !dismissed.includes(a.id)),
		[data, dismissed, now],
	);

	if (isLoading || active.length === 0) {
		return null;
	}
	const a = active[0];
	const Icon =
		a.severity === "warning"
			? ExclamationTriangleIcon
			: a.severity === "promo"
				? SparklesIcon
				: InformationCircleIcon;

	return (
		<div className="mx-auto mt-3 max-w-[1800px] px-8">
			<div
				className={cn(
					"flex items-center gap-3 rounded-lg border px-4 py-3",
					severityStyles[a.severity],
				)}
			>
				<Icon className="size-5 shrink-0" aria-hidden="true" />
				<div className="flex-1 text-sm">
					<span className="font-semibold">{a.title}</span>
					<span className="opacity-80"> — {a.message}</span>
				</div>
				{a.cta && (
					<button
						type="button"
						onClick={() => navigate({ to: a.cta?.to } as never)}
						className="shrink-0 rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-foreground hover:opacity-90"
					>
						{a.cta.label}
					</button>
				)}
				<button
					type="button"
					onClick={() => dismiss(a.id)}
					aria-label="Dismiss announcement"
					className="shrink-0 rounded-md p-1 hover:bg-secondary-hover"
				>
					<XMarkIcon className="size-4" />
				</button>
			</div>
		</div>
	);
}
