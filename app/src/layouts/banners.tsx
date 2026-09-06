import {
	ExclamationTriangleIcon,
	InformationCircleIcon,
	SpeakerWaveIcon,
} from "@heroicons/react/24/outline";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { Announcement, RecommendedModel } from "@/lib/api/types";
import { useAnnouncements } from "@/lib/hooks/useContent";
import { MODEL_DISPLAY_NAMES } from "@/lib/hooks/useRestoreActiveTasks";
import { useServerHealth } from "@/lib/hooks/useServer";
import { useContentStore } from "@/stores/contentStore";
import { useServerStore } from "@/stores/serverStore";
import { Banner } from "@/ui/banner";

function isActive(a: Announcement, now: number): boolean {
	const start = a.starts_at ? Date.parse(a.starts_at) : Number.NaN;
	const end = a.ends_at ? Date.parse(a.ends_at) : Number.NaN;
	if (!Number.isNaN(start) && now < start) {
		return false;
	}
	if (!Number.isNaN(end) && now > end) {
		return false;
	}
	return true;
}

/**
 * Dismissible announcement banner (GET /content/announcements).
 * One banner at a time; highest severity wins by backend order.
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
	const tone =
		a.severity === "promo" || a.severity === "success"
			? "success"
			: a.severity === "warning"
				? "warning"
				: "info";
	return (
		<Banner
			tone={tone}
			icon={
				tone === "warning" ? (
					<ExclamationTriangleIcon className="size-4" aria-hidden="true" />
				) : (
					<InformationCircleIcon className="size-4" aria-hidden="true" />
				)
			}
			onDismiss={() => dismiss(a.id)}
			dismissLabel="Dismiss announcement"
		>
			<span className="font-semibold text-foreground">{a.title}</span>{" "}
			<span>{a.message}</span>
			{a.cta ? (
				<button
					type="button"
					onClick={() => navigate({ to: a.cta?.to } as never)}
					className="ml-2 inline-block shrink-0 rounded-sm border border-strong px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
				>
					{a.cta.label}
				</button>
			) : null}
		</Banner>
	);
}

const RECOMMENDED_DISMISS_KEY = "otoyin.recommended-banner.dismissed";

/**
 * Starter-pack banner (GET /models/recommended). Hidden once every
 * recommended model is present or the user dismisses it.
 */
export function RecommendedModelsBanner() {
	const [missing, setMissing] = useState<RecommendedModel[] | null>(null);
	const [dismissed, setDismissed] = useState(() => {
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
				if (!cancelled) {
					setMissing(res.missing);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setMissing([]);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [dismissed]);

	const dismiss = useCallback(() => {
		setDismissed(true);
		try {
			localStorage.setItem(RECOMMENDED_DISMISS_KEY, "1");
		} catch {
			// Session-only dismissal when storage is unavailable.
		}
	}, []);

	if (dismissed || !missing || missing.length === 0) {
		return null;
	}
	return (
		<Banner
			tone="info"
			icon={<SpeakerWaveIcon className="size-4" aria-hidden="true" />}
			onDismiss={dismiss}
			dismissLabel="Dismiss model recommendation"
		>
			<span className="font-medium text-foreground">
				{missing.length} model{missing.length > 1 ? "s" : ""} missing for the
				full studio
			</span>{" "}
			<span className="hidden sm:inline">
				(
				{missing
					.map((m) => MODEL_DISPLAY_NAMES[m.model_name] ?? m.model_name)
					.join(", ")}
				)
			</span>{" "}
			<Link
				to="/store"
				className="ml-1 font-medium text-accent hover:underline"
			>
				Open the Store
			</Link>
		</Banner>
	);
}

/**
 * Persistent backend-unreachable banner. Hidden when healthy;
 * initializing shows info, unreachable/failed shows danger.
 */
export function ServerStatusBanner() {
	const isConnected = useServerStore((s) => s.isConnected);
	const serverUrl = useServerStore((s) => s.serverUrl);
	const { data: health, error: healthError, isLoading } = useServerHealth();

	if (isLoading && !healthError) {
		return null;
	}
	if (isConnected && health?.status === "healthy") {
		return null;
	}

	const msg = healthError instanceof Error ? healthError.message : "";
	const failed =
		typeof health === "object" &&
		health !== null &&
		"status" in health &&
		(health as { status?: string }).status === "startup_failed";

	if (failed) {
		const error = (health as { error?: string }).error ?? "Unknown error";
		return (
			<Banner
				tone="danger"
				icon={<ExclamationTriangleIcon className="size-4" aria-hidden="true" />}
			>
				Startup failed: {error}
			</Banner>
		);
	}
	if (isConnected === false || (healthError && !isConnected)) {
		return (
			<Banner
				tone="danger"
				icon={<ExclamationTriangleIcon className="size-4" aria-hidden="true" />}
			>
				Cannot reach the backend at {serverUrl} — start the server and it will
				reconnect automatically.
			</Banner>
		);
	}
	if (msg.toLowerCase().includes("initializing")) {
		return (
			<Banner
				tone="info"
				icon={<InformationCircleIcon className="size-4" aria-hidden="true" />}
			>
				Server is initializing — models load in the background.
			</Banner>
		);
	}
	return null;
}
