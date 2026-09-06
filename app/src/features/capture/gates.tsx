import {
	ArrowTopRightOnSquareIcon,
	ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { debug } from "@/lib/utils/debug";
import { usePlatform } from "@/platform/PlatformContext";
import { Button } from "@/ui/button";

/**
 * macOS Accessibility permission (auto-paste needs it). Re-checked on
 * mount, window focus, and the dictate window's paste-failure event.
 */
export function useAccessibilityPermission() {
	const platform = usePlatform();
	const [needsPermission, setNeedsPermission] = useState(false);
	const [checking, setChecking] = useState(false);

	const recheck = useCallback(async (): Promise<boolean> => {
		if (!platform.metadata.isTauri) {
			return true;
		}
		setChecking(true);
		try {
			const trusted = await invoke<boolean>("check_accessibility_permission");
			setNeedsPermission(!trusted);
			return trusted;
		} catch (err: unknown) {
			debug.warn("[accessibility] check failed:", err);
			return false;
		} finally {
			setChecking(false);
		}
	}, [platform.metadata.isTauri]);

	useEffect(() => {
		if (!platform.metadata.isTauri) {
			return;
		}
		void recheck();
		const onFocus = () => {
			void recheck();
		};
		window.addEventListener("focus", onFocus);
		return () => window.removeEventListener("focus", onFocus);
	}, [platform.metadata.isTauri, recheck]);

	useEffect(() => {
		if (!platform.metadata.isTauri) {
			return;
		}
		let unlisten: UnlistenFn | null = null;
		listen("system:accessibility-missing", () => {
			setNeedsPermission(true);
		})
			.then((fn) => {
				unlisten = fn;
			})
			.catch((err: unknown) => {
				debug.warn("[accessibility] listen failed:", err);
			});
		return () => {
			unlisten?.();
		};
	}, [platform.metadata.isTauri]);

	const openSettings = useCallback(async () => {
		try {
			await invoke("open_accessibility_settings");
		} catch (err: unknown) {
			debug.warn("[accessibility] open settings failed:", err);
		}
	}, []);

	return { needsPermission, checking, recheck, openSettings };
}

/**
 * macOS Input Monitoring permission (global hotkeys need it).
 * Re-checked on mount and window focus.
 */
export function useInputMonitoringPermission() {
	const platform = usePlatform();
	const [needsPermission, setNeedsPermission] = useState(false);
	const [checking, setChecking] = useState(false);

	const recheck = useCallback(async (): Promise<boolean> => {
		if (!platform.metadata.isTauri) {
			return true;
		}
		setChecking(true);
		try {
			const trusted = await invoke<boolean>(
				"check_input_monitoring_permission",
			);
			setNeedsPermission(!trusted);
			return trusted;
		} catch (err: unknown) {
			debug.warn("[input-monitoring] check failed:", err);
			return false;
		} finally {
			setChecking(false);
		}
	}, [platform.metadata.isTauri]);

	useEffect(() => {
		if (!platform.metadata.isTauri) {
			return;
		}
		void recheck();
		const onFocus = () => {
			void recheck();
		};
		window.addEventListener("focus", onFocus);
		return () => window.removeEventListener("focus", onFocus);
	}, [platform.metadata.isTauri, recheck]);

	const openSettings = useCallback(async () => {
		try {
			await invoke("open_input_monitoring_settings");
		} catch (err: unknown) {
			debug.warn("[input-monitoring] open settings failed:", err);
		}
	}, []);

	return { needsPermission, checking, recheck, openSettings };
}

function PermissionNotice({
	title,
	bodyKey,
	openSettings,
	checking,
	onRecheck,
	stillMissing,
	stillMissingKey,
	recheckLabel,
	recheckingLabel,
	openLabel,
}: {
	title: string;
	bodyKey: string;
	openSettings: () => void;
	checking: boolean;
	onRecheck: () => void;
	stillMissing: boolean;
	stillMissingKey: string;
	recheckLabel: string;
	recheckingLabel: string;
	openLabel: string;
}) {
	const { t } = useTranslation();
	return (
		<div className="mt-3 rounded-md border border-warning/40 bg-warning-soft px-3.5 py-3">
			<div className="flex items-start gap-3">
				<ExclamationTriangleIcon
					className="mt-0.5 size-4 shrink-0 text-warning"
					aria-hidden="true"
				/>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium text-foreground">{title}</p>
					<p className="text-sm leading-relaxed text-muted-foreground">
						<Trans i18nKey={bodyKey} components={{ path: <span /> }} />
					</p>
					<div className="flex items-center gap-2 pt-1.5">
						<Button size="sm" onClick={openSettings}>
							<ArrowTopRightOnSquareIcon
								className="h-3.5 w-3.5"
								aria-hidden="true"
							/>
							{openLabel}
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={onRecheck}
							disabled={checking}
						>
							{checking ? recheckingLabel : recheckLabel}
						</Button>
					</div>
					{stillMissing && !checking ? (
						<p className="pt-1 text-xs text-warning-text">
							{t(stillMissingKey)}
						</p>
					) : null}
				</div>
			</div>
		</div>
	);
}

/** Inline notice next to auto-paste when Accessibility is missing. */
export function AccessibilityNotice() {
	const { t } = useTranslation();
	const { needsPermission, checking, recheck, openSettings } =
		useAccessibilityPermission();
	const [stillMissing, setStillMissing] = useState(false);

	if (!needsPermission) {
		return null;
	}
	return (
		<PermissionNotice
			title={t("captures.permissions.accessibility.title")}
			bodyKey="captures.permissions.accessibility.body"
			openSettings={openSettings}
			checking={checking}
			stillMissing={stillMissing}
			stillMissingKey="captures.permissions.accessibility.stillMissing"
			recheckLabel={t("captures.permissions.accessibility.recheck")}
			recheckingLabel={t("captures.permissions.accessibility.rechecking")}
			openLabel={t("captures.permissions.accessibility.openSettings")}
			onRecheck={() => {
				setStillMissing(false);
				void recheck().then((trusted) => {
					if (!trusted) {
						setStillMissing(true);
					}
				});
			}}
		/>
	);
}

/** Inline notice under the hotkey toggle when Input Monitoring is missing. */
export function InputMonitoringNotice({ enabled }: { enabled: boolean }) {
	const { t } = useTranslation();
	const { needsPermission, checking, recheck, openSettings } =
		useInputMonitoringPermission();
	const [stillMissing, setStillMissing] = useState(false);

	if (!enabled || !needsPermission) {
		return null;
	}
	return (
		<PermissionNotice
			title={t("captures.permissions.inputMonitoring.title")}
			bodyKey="captures.permissions.inputMonitoring.body"
			openSettings={openSettings}
			checking={checking}
			stillMissing={stillMissing}
			stillMissingKey="captures.permissions.inputMonitoring.stillMissing"
			recheckLabel={t("captures.permissions.inputMonitoring.recheck")}
			recheckingLabel={t("captures.permissions.inputMonitoring.rechecking")}
			openLabel={t("captures.permissions.inputMonitoring.openSettings")}
			onRecheck={() => {
				setStillMissing(false);
				void recheck().then((trusted) => {
					if (!trusted) {
						setStillMissing(true);
					}
				});
			}}
		/>
	);
}
