/**
 * UpdateBanner — calm, non-intrusive update notice (design doc §6).
 *
 * Mounted once in AppFrame below the backend status banner. Three states:
 *
 * 1. `available` - "Update X is ready" with a What's-new pointer, an
 *    "Update now" action (disabled while a job is running), and "Later"
 *    which hides the banner for the session and marks the update pending —
 *    the next quit installs it (§6 "Later installs on quit").
 * 2. `readyToInstall` — the update downloaded in the background; offers
 *    "Restart now" (disabled while busy) and "Later" (session dismiss).
 * 3. `error` — a failed check/download keeps the current version and shows
 *    a single Retry action; it never nags (session dismiss).
 *
 * Busy means audio playback is active or a generation task is in flight.
 * Auto-check runs 20 s after startup and then about once a day — never
 * blocking startup, never interrupting a job.
 */

import {
	ArrowDownTrayIcon as DownloadIcon,
	ArrowPathIcon as RestartIcon,
	ArrowPathIcon as RetryIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAutoUpdater } from "@/hooks/useAutoUpdater";
import { usePlatform } from "@/platform/PlatformContext";
import { useGenerationStore } from "@/stores/generationStore";
import { usePlayerStore } from "@/stores/playerStore";
import { Button } from "@/ui/button";

export function UpdateBanner() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const platform = usePlatform();
	const { status, downloadAndInstall, restartAndInstall, checkForUpdates } =
		useAutoUpdater({
			autoCheckDelay: 20000, // Check 20 s after startup (doc §6: 15–30 s idle)
			autoCheckInterval: 24 * 60 * 60 * 1000, // Then about once a day
		});
	const isPlaying = usePlayerStore((s) => s.isPlaying);
	const activeGenerationId = useGenerationStore((s) => s.activeGenerationId);

	const [dismissed, setDismissed] = useState(false);

	const isTauri = platform.metadata.isTauri;
	const isBusy = isPlaying || activeGenerationId !== null;

	const showAvailable =
		status.available && !status.downloading && !status.readyToInstall;
	const showReady = status.readyToInstall;
	const showError = Boolean(status.error);

	const showBanner =
		isTauri && !dismissed && (showAvailable || showReady || showError);

	if (!showBanner) {
		return null;
	}

	const handleUpdateNow = async () => {
		if (isBusy) {
			return; // Never restart while a job is running (doc §6)
		}
		await downloadAndInstall();
	};

	const handleRestart = async () => {
		if (isBusy) {
			return;
		}
		await restartAndInstall();
	};

	const handleRetry = async () => {
		setDismissed(false);
		await checkForUpdates();
	};

	// §6 "Later installs on quit": mark the update (available or already
	// downloaded) as pending; Rust does check + download + install in the
	// CloseRequested path instead of a plain close.
	const handleLater = () => {
		if (status.readyToInstall || status.available) {
			void invoke("updater_set_pending_install", { pending: true }).catch(
				() => {},
			);
		}
		setDismissed(true);
	};

	if (showError) {
		return (
			<output className="flex h-9 shrink-0 items-center gap-2 border-b border-warning/40 bg-warning-soft px-4 text-warning-text">
				<RetryIcon className="size-4 shrink-0" aria-hidden="true" />
				<p className="min-w-0 flex-1 truncate text-xs">
					<span className="font-semibold">{t("updater.updateFailed")}</span>{" "}
					{status.error}
				</p>
				<Button
					onClick={handleRetry}
					variant="outline"
					size="sm"
					aria-label={t("updater.retry")}
					title={t("updater.retry")}
				>
					{t("updater.retry")}
				</Button>
				<button
					type="button"
					onClick={() => setDismissed(true)}
					aria-label={t("updater.dismiss")}
					title={t("updater.dismiss")}
					className="shrink-0 rounded-md p-1 hover:bg-secondary"
				>
					<XMarkIcon className="size-3" aria-hidden="true" />
				</button>
			</output>
		);
	}

	return (
		<output className="flex h-9 shrink-0 items-center gap-2 border-b border-warning/40 bg-warning-soft px-4 text-warning-text">
			<DownloadIcon className="size-4 shrink-0" aria-hidden="true" />
			<p className="min-w-0 flex-1 truncate text-xs">
				<span className="font-semibold">
					{t("updater.updateAvailable", {
						version: status.version ?? "",
					})}
				</span>
				{showReady ? (
					<span className="opacity-80"> {t("updater.readyToInstall")}</span>
				) : (
					<button
						type="button"
						onClick={() => navigate({ to: "/whats-new" } as never)}
						className="ml-1 underline underline-offset-2 opacity-80 hover:opacity-100"
					>
						{t("updater.whatsNew")}
					</button>
				)}
			</p>
			<div className="flex shrink-0 gap-2">
				<Button
					onClick={
						isBusy ? undefined : showReady ? handleRestart : handleUpdateNow
					}
					variant="outline"
					size="sm"
					disabled={isBusy}
					title={
						isBusy
							? t("updater.updateBusy")
							: showReady
								? t("updater.restartNow")
								: t("updater.updateNow")
					}
					aria-label={
						showReady ? t("updater.restartNow") : t("updater.updateNow")
					}
				>
					{showReady ? (
						<>
							<RestartIcon
								className="mr-1 inline size-3.5"
								aria-hidden="true"
							/>
							{t("updater.restartNow")}
						</>
					) : (
						t("updater.updateNow")
					)}
				</Button>
				<Button
					onClick={handleLater}
					variant="ghost"
					size="sm"
					className="text-xs"
					title={t("updater.later")}
					aria-label={t("updater.later")}
				>
					{t("updater.later")}
				</Button>
				<button
					type="button"
					onClick={() => setDismissed(true)}
					aria-label={t("updater.dismiss")}
					title={t("updater.dismiss")}
					className="shrink-0 rounded-md p-1 hover:bg-secondary"
				>
					<XMarkIcon className="size-3" aria-hidden="true" />
				</button>
			</div>
		</output>
	);
}
