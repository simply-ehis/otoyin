import {
	ExclamationTriangleIcon,
	InformationCircleIcon,
	SparklesIcon,
	SpeakerWaveIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { UpdateBanner } from "@/layouts/Banner/UpdateBanner";
import { apiClient } from "@/lib/api/client";
import type { Announcement } from "@/lib/api/types";
import { useBootReadiness } from "@/lib/hooks/useBootReadiness";
import { useAnnouncements } from "@/lib/hooks/useContent";
import { MODEL_DISPLAY_NAMES } from "@/lib/hooks/useRestoreActiveTasks";
import { useServerHealth } from "@/lib/hooks/useServer";
import { cn } from "@/lib/utils/cn";
import { useContentStore } from "@/stores/contentStore";
import { useServerStore } from "@/stores/serverStore";

const RECOMMENDED_DISMISS_KEY = "Otoyin.recommended-banner.dismissed";

type StripVariant = "error" | "info" | "warning" | "success" | "promo";

interface StripModel {
	id: string;
	variant: StripVariant;
	icon: typeof InformationCircleIcon;
	title: string;
	message: string;
	cta?: { label: string; to: string };
	onDismiss?: () => void;
}

function severityStyles(variant: StripVariant): string {
	switch (variant) {
		case "error":
			return "bg-danger-soft border-destructive/40 text-danger-text";
		case "warning":
			return "bg-warning-soft border-warning/40 text-warning-text";
		case "success":
			return "bg-success-soft border-success/40 text-success-text";
		case "promo":
			return "bg-secondary border-accent/40 text-accent";
		default:
			return "bg-secondary border-border text-foreground";
	}
}

function isActiveAnnouncement(a: Announcement, now: number): boolean {
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

function useRecommendedModelsStrip(): StripModel | null {
	const [missing, setMissing] = useState<string[] | null>(null);
	const [dismissed, setDismissed] = useState<boolean>(() => {
		try {
			return localStorage.getItem(RECOMMENDED_DISMISS_KEY) === "1";
		} catch {
			return false;
		}
	});

	useEffect(() => {
		if (dismissed) {
			return;
		}
		let cancelled = false;
		apiClient
			.getRecommendedModels()
			.then((res) => {
				if (!cancelled && res.missing.length > 0) {
					setMissing(
						res.missing.map(
							(m) => MODEL_DISPLAY_NAMES[m.model_name] ?? m.model_name,
						),
					);
				}
			})
			.catch(() => {
				// Quiet — status/announcement banners cover outages.
			});
		return () => {
			cancelled = true;
		};
	}, [dismissed]);

	const onDismiss = useCallback(() => {
		setDismissed(true);
		try {
			localStorage.setItem(RECOMMENDED_DISMISS_KEY, "1");
		} catch {
			// session-only dismiss
		}
	}, []);

	if (dismissed || !missing || missing.length === 0) {
		return null;
	}

	return {
		id: "recommended-models",
		variant: "info",
		icon: SpeakerWaveIcon,
		title: `${missing.length} model${missing.length > 1 ? "s" : ""} missing`,
		message: missing.join(", "),
		cta: { label: "Open Store", to: "/store" },
		onDismiss,
	};
}

/**
 * Single compact top strip: at most one banner, highest priority first
 * (backend failure → announcement → missing models → update available).
 * Replaces the previous three stacked cards that each added mt-3 + full padding
 * and left a dead zone under the header even after one was dismissed.
 */
export function TopBanners() {
	const navigate = useNavigate();
	const isConnected = useServerStore((s) => s.isConnected);
	const serverUrl = useServerStore((s) => s.serverUrl);
	const { data: health, error: healthError, isLoading } = useServerHealth();
	const boot = useBootReadiness(serverUrl);
	const { data: announcements, isLoading: annLoading } = useAnnouncements();
	const dismissed = useContentStore((s) => s.dismissedAnnouncements);
	const dismissAnnouncement = useContentStore((s) => s.dismissAnnouncement);
	const recommended = useRecommendedModelsStrip();

	const now = Date.now();
	const activeAnnouncement = useMemo(() => {
		const list = (announcements ?? []).filter(
			(a) => isActiveAnnouncement(a, now) && !dismissed.includes(a.id),
		);
		return list[0] ?? null;
	}, [announcements, dismissed, now]);

	// Priority 1 — backend down / failed / initializing
	if (
		!(isLoading && !healthError) &&
		!(isConnected && health?.status === "healthy")
	) {
		const healthMsg = healthError instanceof Error ? healthError.message : "";
		const isStartupFailed =
			typeof health === "object" &&
			health !== null &&
			"status" in health &&
			(health as { status?: string }).status === "startup_failed";

		if (isStartupFailed) {
			const error = (health as { error?: string }).error ?? "Unknown error";
			return (
				<Strip
					model={{
						id: "startup-failed",
						variant: "error",
						icon: ExclamationTriangleIcon,
						title: "Startup failed",
						message: error,
					}}
				/>
			);
		}

		if (isConnected === false || (healthError && !isConnected)) {
			return (
				<Strip
					model={{
						id: "unreachable",
						variant: "error",
						icon: ExclamationTriangleIcon,
						title: "Backend unreachable",
						message: `Check that the server is running at ${serverUrl}`,
					}}
				/>
			);
		}

		if (
			boot.status === "initializing" ||
			healthMsg.toLowerCase().includes("initializing")
		) {
			return (
				<Strip
					model={{
						id: "initializing",
						variant: "info",
						icon: InformationCircleIcon,
						title: "Server initializing",
						message: "Models are loading in the background",
					}}
				/>
			);
		}
	}

	// Priority 2 — active announcement
	if (!annLoading && activeAnnouncement) {
		const a = activeAnnouncement;
		const Icon =
			a.severity === "warning"
				? ExclamationTriangleIcon
				: a.severity === "promo"
					? SparklesIcon
					: InformationCircleIcon;
		return (
			<Strip
				model={{
					id: `announcement-${a.id}`,
					variant: a.severity,
					icon: Icon,
					title: a.title,
					message: a.message,
					cta: a.cta ? { label: a.cta.label, to: a.cta.to } : undefined,
					onDismiss: () => dismissAnnouncement(a.id),
				}}
				onCta={(to) => navigate({ to } as never)}
			/>
		);
	}

	// Priority 3 — missing recommended models
	if (recommended) {
		return (
			<Strip model={recommended} onCta={(to) => navigate({ to } as never)} />
		);
	}

	// Priority 4 — update available (calm banner, doesn't interrupt workflow)
	return <UpdateBanner />;
}

function Strip({
	model,
	onCta,
}: {
	model: StripModel;
	onCta?: (to: string) => void;
}) {
	const Icon = model.icon;
	return (
		<output
			className={cn(
				"flex h-9 shrink-0 items-center gap-2 border-b px-4",
				severityStyles(model.variant),
			)}
		>
			<Icon className="size-4 shrink-0" aria-hidden="true" />
			<p className="min-w-0 flex-1 truncate text-xs">
				<span className="font-semibold">{model.title}</span>
				{model.message ? (
					<span className="opacity-80"> — {model.message}</span>
				) : null}
			</p>
			{model.cta ? (
				<button
					type="button"
					onClick={() => {
						if (model.cta && onCta) {
							onCta(model.cta.to);
						}
					}}
					className="shrink-0 rounded-md bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground hover:opacity-90"
					title={model.cta.label}
					aria-label={model.cta.label}
				>
					{model.cta.label}
				</button>
			) : null}
			{model.onDismiss ? (
				<button
					type="button"
					onClick={model.onDismiss}
					aria-label={`Dismiss: ${model.title}`}
					title="Dismiss"
					className="shrink-0 rounded-md p-1 hover:bg-secondary"
				>
					<XMarkIcon className="size-3.5" aria-hidden="true" />
				</button>
			) : null}
		</output>
	);
}
