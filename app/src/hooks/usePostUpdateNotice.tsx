import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { usePlatform } from "@/platform/PlatformContext";
import { ToastAction } from "@/ui/toast";
import { useToast } from "@/ui/use-toast";

const SEEN_VERSION_KEY = "otoyin.updater.seenVersion";

/**
 * Shows a one-time "What's new" toast after the app version changes
 * (design doc §6). On the very first launch the version is recorded
 * silently — nobody gets an upgrade banner on a fresh install. Mount
 * once at the top of the app (AppFrame).
 */
export function usePostUpdateNotice() {
	const { toast } = useToast();
	const platform = usePlatform();
	const navigate = useNavigate();
	const { t } = useTranslation();

	useEffect(() => {
		if (!platform.metadata.isTauri) {
			return;
		}
		let cancelled = false;
		platform.metadata
			.getVersion()
			.then((version) => {
				if (cancelled || !version) {
					return;
				}
				try {
					const seen = localStorage.getItem(SEEN_VERSION_KEY);
					if (seen === version) {
						return;
					}
					localStorage.setItem(SEEN_VERSION_KEY, version);
					if (seen === null) {
						// Fresh install, not an update — record and move on.
						return;
					}
					toast({
						title: t("updater.newVersionTitle", { version }),
						description: t("updater.newVersionBody"),
						action: (
							<ToastAction
								altText={t("updater.whatsNew")}
								onClick={() => navigate({ to: "/whats-new" } as never)}
							>
								{t("updater.whatsNew")}
							</ToastAction>
						),
					});
				} catch {
					// Storage unavailable — skip silently rather than nag.
				}
			})
			.catch(() => {
				// getVersion failed — nothing to announce.
			});
		return () => {
			cancelled = true;
		};
	}, [platform, toast, navigate, t]);
}
