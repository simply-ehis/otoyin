import {
	ArrowDownTrayIcon,
	CheckCircleIcon,
	ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api/client";
import type {
	DeviceCapabilitiesResponse,
	RecommendedModel,
} from "@/lib/api/types";
import {
	type DiskSpaceReport,
	formatBytes,
	getDiskSpace,
} from "@/lib/system/disk";
import type { UseCaseKey } from "@/stores/workspaceStore";
import { Button } from "@/ui/button";
import { DialogDescription, DialogFooter, DialogTitle } from "@/ui/dialog";

const ROLE_LABEL: Record<string, string> = {
	tts: "Voice",
	stt: "Transcription",
	music: "Music",
	llm: "Assistant",
};

/** Which recommended-pack models each use case brings in. */
const USE_CASE_MODELS: Record<UseCaseKey, readonly string[]> = {
	tts: ["kokoro-onnx"],
	podcast: ["kokoro-onnx", "whisper-tiny-en"],
	audiobook: ["kokoro-onnx"],
	music: ["demucs-htdemucs"],
	voiceChanger: ["whisper-tiny-en"],
};

type T = (key: string, fallback: string) => string;

/**
 * Onboarding step 3 — "Models for your picks".
 *
 * Shows only the recommended engines the user's picks need, with the size and
 * the host's RAM verdict from the backend. Downloads start from the Install
 * button (no silent auto-downloads); the planner (assistant brain) is handled
 * by the agent step instead of here.
 */
export function ModelsStep({
	t,
	selected,
	onBack,
	onNext,
	onSkip,
	onOpenStore,
}: {
	t: T;
	selected: Set<UseCaseKey>;
	onBack: () => void;
	onNext: () => void;
	onSkip: () => void;
	onOpenStore: () => void;
}) {
	const [phase, setPhase] = useState<"loading" | "ready" | "unavailable">(
		"loading",
	);
	const [models, setModels] = useState<RecommendedModel[]>([]);
	const [device, setDevice] = useState<DeviceCapabilitiesResponse | null>(null);
	const [disk, setDisk] = useState<DiskSpaceReport | null>(null);
	const [installing, setInstalling] = useState<ReadonlySet<string>>(new Set());
	const [failed, setFailed] = useState<Record<string, string>>({});

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const [modelsRes, deviceRes, cacheDir] = await Promise.allSettled([
				apiClient.getRecommendedModels(),
				apiClient.getDeviceCapabilities(),
				apiClient.getModelsCacheDir(),
			]);
			if (cancelled) {
				return;
			}
			const modelsOk =
				modelsRes.status === "fulfilled" &&
				Array.isArray(modelsRes.value.models);
			setModels(modelsOk ? modelsRes.value.models : []);
			setDevice(deviceRes.status === "fulfilled" ? deviceRes.value : null);
			setPhase(modelsOk ? "ready" : "unavailable");
			// The disk row is best-effort: measure the drive hosting the model
			// cache when the backend reports it, otherwise the app data drive.
			const cachePath =
				cacheDir.status === "fulfilled" ? cacheDir.value.path : null;
			const diskReport = await getDiskSpace(cachePath);
			if (!cancelled) {
				setDisk(diskReport);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const compatFor = (modelName: string) =>
		device?.models.find((m) => m.model_name === modelName) ?? null;

	const shown = useMemo(() => {
		let names: Set<string>;
		if (selected.size === 0) {
			names = new Set(
				models.filter((m) => m.role !== "llm").map((m) => m.model_name),
			);
		} else {
			names = new Set<string>();
			for (const key of selected) {
				for (const name of USE_CASE_MODELS[key] ?? []) {
					names.add(name);
				}
			}
		}
		return models.filter((m) => names.has(m.model_name));
	}, [models, selected]);

	// Honest disk verdict: only count missing models whose size we actually know.
	const missingBytes = shown.reduce((sum, m) => {
		if (m.downloaded) {
			return sum;
		}
		const compat = compatFor(m.model_name);
		return compat ? sum + compat.size_mb * 1024 * 1024 : sum;
	}, 0);
	const diskTight =
		disk !== null && missingBytes > 0 && disk.freeBytes < missingBytes;

	const install = async (modelName: string) => {
		setFailed((prev) => {
			const next = { ...prev };
			delete next[modelName];
			return next;
		});
		setInstalling((prev) => new Set(prev).add(modelName));
		try {
			await apiClient.triggerModelDownload(modelName);
		} catch (error) {
			setFailed((prev) => ({
				...prev,
				[modelName]:
					error instanceof Error ? error.message : "Download failed to start",
			}));
		} finally {
			setInstalling((prev) => {
				const next = new Set(prev);
				next.delete(modelName);
				return next;
			});
		}
	};

	return (
		<>
			<DialogTitle>
				{t("onboarding.models.title", "Models for your picks")}
			</DialogTitle>
			<DialogDescription>
				{t(
					"onboarding.models.description",
					"The engines your picks need, ready to install. Skipping is fine — you can grab them anytime from the Store.",
				)}
			</DialogDescription>

			{(device || disk) && (
				<p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
					{device && (
						<span>
							{Math.round(device.total_ram_mb / 1024)} GB RAM ·{" "}
							{device.tier.replace(/_/g, " ")}
						</span>
					)}
					{disk && (
						<span>
							{formatBytes(disk.freeBytes)} free on {disk.mountPoint}
						</span>
					)}
				</p>
			)}

			{phase === "loading" && (
				<p className="py-4 text-sm text-muted-foreground">
					{t("common.loading", "Loading…")}
				</p>
			)}

			{phase === "unavailable" && (
				<div
					role="alert"
					className="rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground"
				>
					{t(
						"onboarding.models.unavailable",
						"Couldn't reach the engine to check your models. Nothing breaks if you skip — install them later from the Store.",
					)}
				</div>
			)}

			{phase === "ready" && diskTight && (
				<p
					role="alert"
					className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400"
				>
					<ExclamationTriangleIcon
						className="mt-0.5 size-4 shrink-0"
						aria-hidden="true"
					/>
					{t(
						"onboarding.models.lowDisk",
						`These models need ~${formatBytes(missingBytes)} but only ${disk ? formatBytes(disk.freeBytes) : "?"} is free on ${disk?.mountPoint ?? "the models drive"}. Skip the big ones or free up space.`,
					)}
				</p>
			)}

			{phase === "ready" && (
				<ul className="flex flex-col gap-2 py-1">
					{shown.map((m) => {
						const compat = compatFor(m.model_name);
						const notCompatible = compat !== null && !compat.compatible;
						const isInstalling = installing.has(m.model_name);
						const error = failed[m.model_name];
						const size = compat
							? formatBytes(compat.size_mb * 1024 * 1024)
							: null;
						return (
							<li
								key={m.model_name}
								className="flex items-start gap-3 rounded-lg border border-border p-3"
							>
								{m.downloaded ? (
									<CheckCircleIcon
										className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
										aria-hidden="true"
									/>
								) : (
									<ArrowDownTrayIcon
										className="mt-0.5 size-5 shrink-0 text-muted-foreground"
										aria-hidden="true"
									/>
								)}
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-center gap-2">
										<span className="text-sm font-medium">
											{compat?.display_name ?? m.model_name}
										</span>
										<span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
											{ROLE_LABEL[m.role] ?? m.role}
										</span>
										{size && (
											<span className="text-[10px] text-muted-foreground">
												{size}
											</span>
										)}
									</div>
									<p className="mt-0.5 text-xs text-muted-foreground">
										{m.reason}
									</p>
									{notCompatible && (
										<p className="mt-1 flex items-start gap-1 text-[11px] text-amber-600 dark:text-amber-400">
											<ExclamationTriangleIcon
												className="mt-0.5 size-3.5 shrink-0"
												aria-hidden="true"
											/>
											{compat?.reason ??
												"This model may not fit on this machine."}
										</p>
									)}
									{error && (
										<p
											role="alert"
											className="mt-1 text-[11px] text-destructive"
										>
											{error}
										</p>
									)}
								</div>
								{m.downloaded ? (
									<span className="shrink-0 text-xs text-muted-foreground">
										{t("onboarding.models.installed", "Installed")}
									</span>
								) : (
									<Button
										size="sm"
										variant="outline"
										className="shrink-0"
										disabled={isInstalling || notCompatible}
										title={
											notCompatible ? (compat?.reason ?? undefined) : undefined
										}
										onClick={() => void install(m.model_name)}
									>
										{isInstalling
											? t("onboarding.models.starting", "Starting…")
											: t("onboarding.models.install", "Install")}
									</Button>
								)}
							</li>
						);
					})}
					{shown.length === 0 && (
						<li className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
							{t(
								"onboarding.models.nothingNeeded",
								"No extra models needed for your picks — the essentials are already in the pack.",
							)}
						</li>
					)}
				</ul>
			)}

			{phase === "ready" && shown.length > 0 && (
				<p className="text-[10px] text-muted-foreground">
					{t(
						"onboarding.models.background",
						"Downloads run in the background — track them in the Store. Nothing here is required.",
					)}
				</p>
			)}

			<DialogFooter className="flex-row justify-between sm:justify-between">
				<Button variant="ghost" onClick={onBack}>
					{t("common.back", "Back")}
				</Button>
				<span className="flex gap-2">
					<Button variant="ghost" onClick={onSkip}>
						{t("onboarding.wizard.skipTour", "Skip tour")}
					</Button>
					<Button variant="outline" onClick={onOpenStore}>
						{t("onboarding.models.openStore", "Open Store")}
					</Button>
					<Button onClick={onNext}>{t("common.next", "Next")}</Button>
				</span>
			</DialogFooter>
		</>
	);
}
