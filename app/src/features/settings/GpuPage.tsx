import {
	ArrowDownTrayIcon,
	ArrowUturnRightIcon,
	CpuChipIcon,
	ExclamationCircleIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/lib/api/client";
import type { CudaDownloadProgress, HealthResponse } from "@/lib/api/types";
import { useBackendRestart } from "@/lib/hooks/useBackendRestart";
import { useServerHealth } from "@/lib/hooks/useServer";
import { usePlatform } from "@/platform/PlatformContext";
import { useServerStore } from "@/stores/serverStore";
import { Button } from "@/ui/button";
import { Badge, Spinner } from "@/ui/primitives";
import { Progress } from "@/ui/progress";
import { ScreenHeader } from "@/ui/states";
import { SettingRow, SettingSection } from "./rows";

function GpuIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<rect x="4" y="6" width="16" height="12" rx="2" />
			<path d="M2 10h2M2 14h2M20 10h2M20 14h2" />
			<path d="M9 10h6M9 14h4" />
		</svg>
	);
}

function GpuInfoCard({ health }: { health: HealthResponse }) {
	const { t } = useTranslation();
	const hasGpu = health.gpu_available && health.gpu_type;
	const gpuName = hasGpu
		? health.gpu_type?.replace(
				/^(CUDA|ROCm|MPS|Metal|XPU|DirectML)\s*\((.+)\)$/,
				"$2",
			) ||
			health.gpu_type ||
			""
		: null;
	const backend = hasGpu ? health.gpu_type?.replace(/\s*\(.+\)$/, "") : null;

	return (
		<div className="rounded-md border border-border bg-card p-4">
			<div className="flex items-center gap-3">
				{hasGpu ? (
					<GpuIcon className="size-5 shrink-0 text-accent" />
				) : (
					<CpuChipIcon
						className="size-5 shrink-0 text-muted-foreground"
						aria-hidden="true"
					/>
				)}
				<div className="min-w-0 flex-1">
					<p className="text-sm font-medium text-foreground">
						{hasGpu ? gpuName : t("settings.gpu.cpuOnly")}
					</p>
					<p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
						{hasGpu ? (
							<>
								<span>{backend}</span>
								{health.backend_variant && health.backend_variant !== "cpu" ? (
									<>
										<span
											aria-hidden="true"
											className="text-muted-foreground/50"
										>
											|
										</span>
										<span className="uppercase">{health.backend_variant}</span>
									</>
								) : null}
								{health.vram_used_mb != null && health.vram_used_mb > 0 ? (
									<>
										<span
											aria-hidden="true"
											className="text-muted-foreground/50"
										>
											|
										</span>
										<span>
											{t("settings.gpu.vramUsed", {
												mb: health.vram_used_mb.toFixed(0),
											})}
										</span>
									</>
								) : null}
							</>
						) : (
							<span>{t("settings.gpu.noAcceleration")}</span>
						)}
					</p>
				</div>
				{hasGpu ? (
					<Badge tone="success">{t("settings.gpu.active")}</Badge>
				) : null}
			</div>
		</div>
	);
}

function formatBytes(bytes: number): string {
	if (bytes === 0) {
		return "0 B";
	}
	const units = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

/**
 * GPU / CUDA backend management: device info, CUDA download with live
 * progress, backend switching with health polling, removal.
 */
export function GpuPage() {
	const { t } = useTranslation();
	const platform = usePlatform();
	const serverUrl = useServerStore((s) => s.serverUrl);
	const { data: health } = useServerHealth();

	const [progress, setProgress] = useState<CudaDownloadProgress | null>(null);
	const { phase, error, setError, restart } = useBackendRestart();
	const tRef = useRef(t);
	useEffect(() => {
		tRef.current = t;
	}, [t]);

	const { data: cudaStatus, refetch: refetchCuda } = useQuery({
		queryKey: ["cuda-status", serverUrl],
		queryFn: () => apiClient.getCudaStatus(),
		refetchInterval: (query) =>
			query.state.status === "pending" ? false : 10000,
		retry: 1,
		enabled: !!health,
	});

	const isCuda = health?.backend_variant === "cuda";
	const cudaAvailable = cudaStatus?.available ?? false;
	const cudaDownloading = cudaStatus?.downloading ?? false;

	useEffect(() => {
		if (!cudaDownloading || !serverUrl) {
			return;
		}
		const source = new EventSource(`${serverUrl}/backend/cuda-progress`);
		source.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data) as CudaDownloadProgress;
				setProgress(data);
				if (data.status === "complete") {
					source.close();
					setProgress(null);
					void refetchCuda();
				} else if (data.status === "error") {
					source.close();
					setError(
						data.error || tRef.current("settings.gpu.errors.downloadFailed"),
					);
					setProgress(null);
					void refetchCuda();
				}
			} catch {
				// Heartbeats and partial frames are ignorable.
			}
		};
		source.onerror = () => source.close();
		return () => source.close();
	}, [cudaDownloading, serverUrl, refetchCuda, setError]);

	if (!health) {
		return null;
	}
	const hasNativeGpu =
		health.gpu_available &&
		!isCuda &&
		health.gpu_type &&
		!health.gpu_type.includes("CUDA");

	return (
		<div className="flex max-w-3xl flex-col gap-6">
			<ScreenHeader title="GPU" />
			<GpuInfoCard health={health} />

			{!hasNativeGpu && !isCuda ? (
				<SettingSection
					title={t("settings.gpu.cuda.title")}
					description={t("settings.gpu.cuda.description")}
				>
					{cudaDownloading && progress ? (
						<SettingRow title={t("settings.gpu.cuda.downloading")}>
							<div className="flex flex-col gap-1.5">
								<Progress
									value={progress.progress}
									label="CUDA download progress"
									className="h-2"
								/>
								<p className="flex items-center justify-between text-xs text-muted-foreground">
									<span>
										{progress.filename ||
											(cudaAvailable
												? t("settings.gpu.cuda.updating")
												: t("settings.gpu.cuda.downloadingShort"))}
									</span>
									<span className="tabular-nums">
										{progress.total > 0
											? `${formatBytes(progress.current)} / ${formatBytes(progress.total)}`
											: `${progress.progress.toFixed(1)}%`}
									</span>
								</p>
							</div>
						</SettingRow>
					) : null}

					{phase !== "idle" ? (
						<SettingRow
							title={
								phase === "ready"
									? t("settings.gpu.restart.ready")
									: phase === "waiting"
										? t("settings.gpu.restart.waiting")
										: t("settings.gpu.restart.stopping")
							}
							action={<Spinner size="md" />}
						/>
					) : null}

					{error ? (
						<SettingRow title={t("common.error")}>
							<p className="flex items-center gap-2 text-sm text-destructive">
								<ExclamationCircleIcon
									className="size-4 shrink-0"
									aria-hidden="true"
								/>
								{error}
							</p>
						</SettingRow>
					) : null}

					{phase === "idle" && !cudaDownloading ? (
						<>
							{!cudaAvailable && !isCuda ? (
								<SettingRow
									title={t("settings.gpu.download.title")}
									description={t("settings.gpu.download.description")}
									action={
										<Button
											size="sm"
											onClick={() => {
												setError(null);
												apiClient
													.downloadCudaBackend()
													.then(() => refetchCuda())
													.catch((e: unknown) => {
														const msg =
															e instanceof Error
																? e.message
																: t("settings.gpu.errors.downloadStart");
														if (msg.includes("already downloaded")) {
															void refetchCuda();
														} else {
															setError(msg);
														}
													});
											}}
										>
											<ArrowDownTrayIcon
												className="mr-1.5 h-3.5 w-3.5"
												aria-hidden="true"
											/>
											{t("settings.gpu.download.button")}
										</Button>
									}
								/>
							) : null}
							{cudaAvailable && !isCuda && platform.metadata.isTauri ? (
								<SettingRow
									title={t("settings.gpu.switchToCuda.title")}
									description={t("settings.gpu.switchToCuda.description")}
									action={
										<Button
											size="sm"
											onClick={() => {
												restart().catch((e: unknown) => {
													setError(
														e instanceof Error
															? e.message
															: t("settings.gpu.errors.restartFailed"),
													);
												});
											}}
										>
											<ArrowUturnRightIcon
												className="mr-1.5 h-3.5 w-3.5"
												aria-hidden="true"
											/>
											{t("settings.gpu.switchToCuda.button")}
										</Button>
									}
								/>
							) : null}
							{isCuda && platform.metadata.isTauri ? (
								<SettingRow
									title={t("settings.gpu.switchToCpu.title")}
									description={t("settings.gpu.switchToCpu.description")}
									action={
										<Button
											variant="outline"
											size="sm"
											onClick={() => {
												apiClient
													.deleteCudaBackend()
													.then(() => restart())
													.catch((e: unknown) => {
														setError(
															e instanceof Error
																? e.message
																: t("settings.gpu.errors.switchCpu"),
														);
														void refetchCuda();
													});
											}}
										>
											<ArrowUturnRightIcon
												className="mr-1.5 h-3.5 w-3.5"
												aria-hidden="true"
											/>
											{t("settings.gpu.switchToCpu.button")}
										</Button>
									}
								/>
							) : null}
							{cudaAvailable && !isCuda ? (
								<SettingRow
									title={t("settings.gpu.remove.title")}
									description={t("settings.gpu.remove.description")}
									action={
										<Button
											variant="ghost"
											size="sm"
											className="text-muted-foreground"
											onClick={() => {
												setError(null);
												apiClient
													.deleteCudaBackend()
													.then(() => refetchCuda())
													.catch((e: unknown) => {
														setError(
															e instanceof Error
																? e.message
																: t("settings.gpu.errors.deleteCuda"),
														);
													});
											}}
										>
											<TrashIcon
												className="mr-1.5 h-3.5 w-3.5"
												aria-hidden="true"
											/>
											{t("settings.gpu.remove.button")}
										</Button>
									}
								/>
							) : null}
						</>
					) : null}
				</SettingSection>
			) : null}
		</div>
	);
}
