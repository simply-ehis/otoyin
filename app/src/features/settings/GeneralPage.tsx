import {
	ArrowDownTrayIcon,
	ArrowPathIcon,
	ArrowUpRightIcon,
	BookOpenIcon,
	ExclamationCircleIcon,
} from "@heroicons/react/24/outline";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Trans, useTranslation } from "react-i18next";
import * as z from "zod";
import { useAutoUpdater } from "@/hooks/useAutoUpdater";
import { showStudioErrorToast } from "@/lib/errors";
import { apiClient } from "@/lib/api/client";
import { useBackendRestart } from "@/lib/hooks/useBackendRestart";
import { useServerHealth } from "@/lib/hooks/useServer";
import { usePerformanceSettings } from "@/lib/hooks/useSettings";
import { debug } from "@/lib/utils/debug";
import { usePlatform } from "@/platform/PlatformContext";
import {
	isRemoteModeMisconfigured,
	useServerStore,
} from "@/stores/serverStore";
import { Banner } from "@/ui/banner";
import { Button } from "@/ui/button";
import { Switch } from "@/ui/controls";
import { Field, Input } from "@/ui/input";
import { Spinner } from "@/ui/primitives";
import { Progress } from "@/ui/progress";
import { useToast } from "@/ui/use-toast";
import { LanguageSelect } from "./LanguageSelect";
import { SettingRow, SettingSection } from "./rows";
import { ThemeSelect } from "./ThemeSelect";

function connectionSchema(invalidUrl: string) {
	return z.object({ serverUrl: z.string().url(invalidUrl) });
}

/**
 * General settings: connection, server behavior, language, theme,
 * API reference, updates. toggles apply immediately; the server URL
 * saves explicitly (validated) so a typo never bricks the connection.
 */
export function GeneralPage() {
	const { t } = useTranslation();
	const platform = usePlatform();
	const serverUrl = useServerStore((s) => s.serverUrl);
	const setServerUrl = useServerStore((s) => s.setServerUrl);
	const keepRunning = useServerStore((s) => s.keepServerRunningOnClose);
	const setKeepRunning = useServerStore((s) => s.setKeepServerRunningOnClose);
	const mode = useServerStore((s) => s.mode);
	const setMode = useServerStore((s) => s.setMode);
	const { toast } = useToast();
	const { data: health, isLoading, error: healthError } = useServerHealth();
	const { settings: perf, update: updatePerf } = usePerformanceSettings();
	const {
		phase: restartPhase,
		error: restartError,
		restart,
	} = useBackendRestart();

	const { data: serverPort, refetch: refetchServerPort } = useQuery({
		queryKey: ["server-port"],
		queryFn: () => apiClient.getServerPort(),
		retry: 1,
		enabled: !healthError,
	});
	const [portInput, setPortInput] = useState<string | null>(null);
	const [portSaving, setPortSaving] = useState(false);
	const shownPort = portInput ?? String(serverPort?.port ?? "");

	const handleSavePort = async () => {
		const port = Number(shownPort);
		if (!Number.isInteger(port) || port < 1024 || port > 65535) {
			toast({
				title: t("settings.general.serverPort.invalid"),
				variant: "destructive",
			});
			return;
		}
		setPortSaving(true);
		try {
			const state = await apiClient.updateServerPort(port);
			setPortInput(null);
			void refetchServerPort();
			if (!state.needs_restart) {
				toast({ title: t("settings.general.serverPort.updatedTitle") });
				return;
			}
			if (platform.metadata.isTauri) {
				// Backend restart binds the new port; the hook moves the
				// client over to the returned URL and polls health.
				await restart(port);
				toast({
					title: t("settings.general.serverPort.updatedTitle"),
					description: t("settings.general.serverPort.updatedDescription", {
						port,
					}),
				});
				void refetchServerPort();
			} else {
				toast({
					title: t("settings.general.serverPort.updatedTitle"),
					description: t("settings.general.serverPort.devHint", { port }),
				});
			}
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : "";
			const busy = /already in use/.test(msg);
			toast({
				title: busy
					? t("settings.general.serverPort.busy")
					: t("settings.general.keepServerRunning.failedTitle"),
				description: busy ? undefined : msg || undefined,
				variant: "destructive",
			});
			if (!busy) {
				showStudioErrorToast(err);
			}
		} finally {
			setPortSaving(false);
		}
	};

	const form = useForm<{ serverUrl: string }>({
		resolver: useMemo(
			() =>
				zodResolver(
					connectionSchema(t("settings.general.serverUrl.invalidUrl")),
				),
			[t],
		),
		defaultValues: { serverUrl },
	});
	useEffect(() => {
		form.reset({ serverUrl });
	}, [serverUrl, form]);
	useEffect(() => {
		if (form.formState.errors.serverUrl) {
			void form.trigger("serverUrl");
		}
	}, [form]);

	return (
		<div className="flex max-w-3xl flex-col gap-8">
			<div className="grid grid-cols-2 gap-3">
				<a
					href="https://docs.otoyin.app"
					target="_blank"
					rel="noopener noreferrer"
					className="group flex items-center gap-3 rounded-md border border-border p-4 transition-colors hover:bg-secondary"
				>
					<BookOpenIcon
						className="size-5 shrink-0 text-accent"
						aria-hidden="true"
					/>
					<span className="min-w-0 flex-1">
						<span className="block text-sm font-medium text-foreground">
							{t("settings.general.docs.title")}
						</span>
						<span className="block text-xs text-muted-foreground">
							docs.otoyin.app
						</span>
					</span>
					<ArrowUpRightIcon
						className="size-4 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground"
						aria-hidden="true"
					/>
				</a>
				<a
					href="https://discord.gg/StkzQasqPS"
					target="_blank"
					rel="noopener noreferrer"
					className="group flex items-center gap-3 rounded-md border border-border p-4 transition-colors hover:bg-secondary"
				>
					<span
						className="grid size-5 shrink-0 place-items-center rounded-sm bg-accent text-[10px] font-bold text-white"
						aria-hidden="true"
					>
						D
					</span>
					<span className="min-w-0 flex-1">
						<span className="block text-sm font-medium text-foreground">
							{t("settings.general.discord.title")}
						</span>
						<span className="block text-xs text-muted-foreground">
							{t("settings.general.discord.subtitle")}
						</span>
					</span>
					<ArrowUpRightIcon
						className="size-4 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground"
						aria-hidden="true"
					/>
				</a>
			</div>

			<SettingSection>
				<SettingRow
					title={t("settings.general.serverUrl.title")}
					description={t("settings.general.serverUrl.description")}
					action={
						<ConnectionStatus
							health={health}
							isLoading={isLoading}
							healthError={healthError}
						/>
					}
				>
					<form
						onSubmit={form.handleSubmit((data) => {
							setServerUrl(data.serverUrl);
							form.reset(data);
							toast({
								title: t("settings.general.serverUrl.updatedTitle"),
								description: t(
									"settings.general.serverUrl.updatedDescription",
									{
										url: data.serverUrl,
									},
								),
							});
						})}
						className="flex gap-2"
					>
						<Field
							label={t("settings.general.serverUrl.title")}
							htmlFor="server-url"
							error={form.formState.errors.serverUrl?.message}
						>
							<Input
								id="server-url"
								placeholder="http://127.0.0.1:17493"
								{...form.register("serverUrl")}
							/>
						</Field>
						{form.formState.isDirty ? (
							<Button type="submit" size="sm" className="mt-[22px] shrink-0">
								{t("common.save")}
							</Button>
						) : null}
					</form>
				</SettingRow>

				<SettingRow
					title={t("settings.general.serverPort.title")}
					description={t("settings.general.serverPort.description")}
					action={
						serverPort ? (
							<span className="text-xs tabular-nums text-muted-foreground">
								{t("settings.general.serverPort.servingNow", {
									port: serverPort.current_port,
								})}
							</span>
						) : undefined
					}
				>
					<div className="flex gap-2">
						<Field
							label={t("settings.general.serverPort.title")}
							htmlFor="server-port"
						>
							<Input
								id="server-port"
								type="number"
								min={1024}
								max={65535}
								step={1}
								value={shownPort}
								onChange={(e) => setPortInput(e.target.value)}
								placeholder="17493"
							/>
						</Field>
						<Button
							size="sm"
							className="mt-[22px] shrink-0"
							onClick={handleSavePort}
							disabled={portSaving || restartPhase !== "idle"}
						>
							{portSaving || restartPhase !== "idle"
								? t("settings.general.serverPort.restarting")
								: platform.metadata.isTauri
									? t("settings.general.serverPort.saveRestart")
									: t("settings.general.serverPort.save")}
						</Button>
					</div>
					{serverPort?.needs_restart ? (
						<p className="mt-1.5 text-xs text-warning-text">
							{t("settings.general.serverPort.pendingRestart", {
								port: serverPort.port,
							})}
						</p>
					) : null}
					{restartError ? (
						<p className="mt-1.5 text-xs text-destructive">{restartError}</p>
					) : null}
				</SettingRow>

				<SettingRow
					title={t("settings.general.keepServerRunning.title")}
					description={t("settings.general.keepServerRunning.description")}
				>
					<Switch
						checked={keepRunning}
						label={t("settings.general.keepServerRunning.title")}
						onCheckedChange={(checked) => {
							setKeepRunning(checked);
							platform.lifecycle
								.setKeepServerRunning(checked)
								.then(() => {
									toast({
										title: t("settings.general.keepServerRunning.updatedTitle"),
										description: checked
											? t(
													"settings.general.keepServerRunning.runningDescription",
												)
											: t(
													"settings.general.keepServerRunning.stoppedDescription",
												),
									});
								})
								.catch((error: unknown) => {
									showStudioErrorToast(error);
									setKeepRunning(!checked);
									toast({
										title: t("settings.general.keepServerRunning.failedTitle"),
										description: t(
											"settings.general.keepServerRunning.failedDescription",
										),
										variant: "destructive",
									});
								});
						}}
					/>
				</SettingRow>

				<SettingRow
					title={t("settings.general.performanceMode.title")}
					description={t("settings.general.performanceMode.description")}
				>
					<Switch
						checked={perf?.performance_mode ?? false}
						label={t("settings.general.performanceMode.title")}
						onCheckedChange={(checked) => {
							updatePerf(
								{ performance_mode: checked },
								{ onError: (err: unknown) => showStudioErrorToast(err) },
							);
						}}
					/>
				</SettingRow>

				{platform.metadata.isTauri ? (
					<SettingRow
						title={t("settings.general.networkAccess.title")}
						description={t("settings.general.networkAccess.description")}
					>
						<Switch
							checked={mode === "remote"}
							label={t("settings.general.networkAccess.title")}
							onCheckedChange={(checked) => {
								setMode(checked ? "remote" : "local");
								toast({
									title: t("settings.general.networkAccess.updatedTitle"),
									description: checked
										? t("settings.general.networkAccess.enabled")
										: t("settings.general.networkAccess.disabled"),
								});
							}}
						/>
					</SettingRow>
				) : null}
				{isRemoteModeMisconfigured(mode, serverUrl) ? (
					<Banner tone="warning">
						{t("settings.general.networkAccess.needsUrl")}
					</Banner>
				) : null}

				<SettingRow
					title={t("settings.language.label")}
					description={t("settings.language.description")}
					action={<LanguageSelect />}
				/>

				<SettingRow
					title={t("settings.theme.label")}
					description={t("settings.theme.description")}
				/>
				<div className="mt-1">
					<ThemeSelect />
				</div>
			</SettingSection>

			<ApiReferenceCard serverUrl={serverUrl} />

			{platform.metadata.isTauri ? <UpdatesSection /> : null}
		</div>
	);
}

function ConnectionStatus({
	health,
	isLoading,
	healthError,
}: {
	health: ReturnType<typeof useServerHealth>["data"];
	isLoading: boolean;
	healthError: ReturnType<typeof useServerHealth>["error"];
}) {
	const { t } = useTranslation();
	if (isLoading) {
		return (
			<span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1">
				<Spinner size="xs" />
				<span className="text-xs text-muted-foreground">
					{t("settings.general.connection.connecting")}
				</span>
			</span>
		);
	}
	if (healthError) {
		return (
			<span className="inline-flex items-center gap-2 rounded-full border border-destructive/40 bg-danger-soft px-3 py-1">
				<span
					aria-hidden="true"
					className="size-2 rounded-full bg-destructive"
				/>
				<span className="text-xs text-danger-text">
					{t("settings.general.connection.offline")}
				</span>
			</span>
		);
	}
	if (health) {
		return (
			<span className="inline-flex items-center gap-2 rounded-full border border-success/40 bg-success-soft px-3 py-1">
				<span aria-hidden="true" className="size-2 rounded-full bg-success" />
				<span className="text-xs text-success-text">
					{t("settings.general.connection.online")}
				</span>
			</span>
		);
	}
	return null;
}

function UpdatesSection() {
	const { t } = useTranslation();
	const platform = usePlatform();
	const { status, checkForUpdates, downloadAndInstall, restartAndInstall } =
		useAutoUpdater(false);
	const [currentVersion, setCurrentVersion] = useState<string | null>("");
	const isDev = !import.meta.env?.PROD;

	useEffect(() => {
		platform.metadata
			.getVersion()
			.then(setCurrentVersion)
			.catch((err: unknown) => {
				debug.warn("[server] get version failed:", err);
				setCurrentVersion(null);
			});
	}, [platform]);

	return (
		<SettingSection
			title={t("settings.general.updates.title")}
			description={`v${currentVersion ?? t("common.unknown")}${isDev ? t("settings.general.updates.devSuffix") : ""}`}
		>
			{isDev ? (
				<SettingRow
					title={t("settings.general.updates.devMode.title")}
					description={t("settings.general.updates.devMode.description")}
				/>
			) : (
				<>
					<SettingRow
						title={t("settings.general.updates.check.title")}
						description={
							status.available
								? t("settings.general.updates.check.available", {
										version: status.version,
									})
								: status.checking
									? t("settings.general.updates.check.checking")
									: t("settings.general.updates.check.upToDate")
						}
						action={
							<Button
								onClick={checkForUpdates}
								disabled={
									status.checking || status.downloading || status.readyToInstall
								}
								variant="outline"
								size="sm"
							>
								{status.checking ? (
									<Spinner size="sm" className="mr-1.5" />
								) : (
									<ArrowPathIcon
										className="mr-1.5 h-3.5 w-3.5"
										aria-hidden="true"
									/>
								)}
								{t("settings.general.updates.check.button")}
							</Button>
						}
					/>
					{status.error ? (
						<SettingRow title={t("settings.general.updates.error")}>
							<p className="flex items-center gap-2 text-sm text-destructive">
								<ExclamationCircleIcon className="size-4" aria-hidden="true" />
								{status.error}
							</p>
						</SettingRow>
					) : null}
					{status.available && !status.downloading && !status.readyToInstall ? (
						<SettingRow
							title={t("settings.general.updates.download.title", {
								version: status.version,
							})}
							description={t("settings.general.updates.download.description")}
							action={
								<Button onClick={downloadAndInstall} size="sm">
									<ArrowDownTrayIcon
										className="mr-1.5 h-3.5 w-3.5"
										aria-hidden="true"
									/>
									{t("settings.general.updates.download.button")}
								</Button>
							}
						/>
					) : null}
					{status.downloading ? (
						<SettingRow title={t("settings.general.updates.downloading")}>
							<div className="flex flex-col gap-1.5">
								<Progress
									value={status.downloadProgress}
									label="Update download progress"
								/>
								<p className="flex items-center justify-between text-xs text-muted-foreground">
									<span>
										{status.downloadedBytes !== undefined &&
										status.totalBytes !== undefined &&
										status.totalBytes > 0
											? `${(status.downloadedBytes / 1024 / 1024).toFixed(1)} MB / ${(status.totalBytes / 1024 / 1024).toFixed(1)} MB`
											: ""}
									</span>
									{status.downloadProgress !== undefined ? (
										<span className="tabular-nums">
											{status.downloadProgress}%
										</span>
									) : null}
								</p>
							</div>
						</SettingRow>
					) : null}
					{status.readyToInstall ? (
						<SettingRow
							title={t("settings.general.updates.ready.title")}
							description={t("settings.general.updates.ready.description", {
								version: status.version,
							})}
							action={
								<Button onClick={restartAndInstall} size="sm">
									<ArrowPathIcon
										className="mr-1.5 h-3.5 w-3.5"
										aria-hidden="true"
									/>
									{t("settings.general.updates.ready.button")}
								</Button>
							}
						/>
					) : null}
				</>
			)}
		</SettingSection>
	);
}

function ApiReferenceCard({ serverUrl }: { serverUrl: string }) {
	const { t } = useTranslation();
	const endpoints = [
		{
			method: "POST",
			path: "/generate",
			label: t("settings.general.api.endpoints.generate"),
		},
		{
			method: "GET",
			path: "/health",
			label: t("settings.general.api.endpoints.health"),
		},
		{
			method: "GET",
			path: "/profiles",
			label: t("settings.general.api.endpoints.profiles"),
		},
		{
			method: "GET",
			path: "/history",
			label: t("settings.general.api.endpoints.history"),
		},
	];
	return (
		<div className="flex max-w-3xl flex-col gap-3 rounded-md border border-border bg-card p-4">
			<div>
				<h3 className="text-sm font-medium text-foreground">
					{t("settings.general.api.title")}
				</h3>
				<p className="text-sm text-muted-foreground">
					<Trans
						i18nKey="settings.general.api.description"
						values={{ url: serverUrl }}
						components={{
							code: (
								<code className="rounded-sm bg-sunken px-1 py-0.5 font-mono text-xs" />
							),
						}}
					/>
				</p>
			</div>
			<ul className="flex flex-col gap-1">
				{endpoints.map((ep) => (
					<li key={ep.path} className="flex items-center gap-3 py-1">
						<span
							className={
								ep.method === "POST"
									? "w-9 rounded-sm bg-accent-muted px-1 py-px text-center font-mono text-xs font-semibold text-accent"
									: "w-9 rounded-sm bg-secondary px-1 py-px text-center font-mono text-xs font-semibold text-muted-foreground"
							}
						>
							{ep.method}
						</span>
						<code className="font-mono text-xs text-muted-foreground">
							{ep.path}
						</code>
						<span className="ml-auto text-xs text-muted-foreground/70">
							{ep.label}
						</span>
					</li>
				))}
			</ul>
			<p className="text-xs text-muted-foreground">
				<a
					href={`${serverUrl}/docs`}
					target="_blank"
					rel="noopener noreferrer"
					className="text-accent hover:underline"
				>
					{t("settings.general.api.viewReference")}
				</a>
			</p>
		</div>
	);
}
