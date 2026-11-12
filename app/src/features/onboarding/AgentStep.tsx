import {
	CheckCircleIcon,
	ClipboardDocumentIcon,
	CpuChipIcon,
	ExclamationTriangleIcon,
	KeyIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { Button } from "@/ui/button";
import { DialogDescription, DialogFooter, DialogTitle } from "@/ui/dialog";

const CLAUDE_COMMAND =
	'claude mcp add otoyin --transport http --url http://127.0.0.1:17493/mcp --header "X-otoyin-Client-Id: claude-code"';

const MCP_GUIDANCE =
	"Any MCP client: point it at http://127.0.0.1:17493/mcp with the header X-otoyin-Client-Id.";

type T = (key: string, fallback: string) => string;
type PlannerState = "loading" | "ready" | "unavailable";

interface PlannerCompat {
	compatible: boolean;
	reason: string | null;
}

/**
 * Onboarding step 4 — "Assistant & coding agent" (optional).
 *
 * Offers the three ways to wire the assistant, all backed by things that
 * exist: the on-device GGUF planner (install via the recommended pack), an
 * OpenAI-compatible provider + key (OS credential store), or the local MCP
 * server for coding agents. Nothing is configured silently — every option
 * needs an explicit click.
 */
export function AgentStep({
	t,
	onBack,
	onNext,
	onSkip,
	onOpenApiKeys,
}: {
	t: T;
	onBack: () => void;
	onNext: () => void;
	onSkip: () => void;
	onOpenApiKeys: () => void;
}) {
	const [plannerState, setPlannerState] = useState<PlannerState>("loading");
	const [plannerInstalled, setPlannerInstalled] = useState(false);
	const [plannerCompat, setPlannerCompat] = useState<PlannerCompat | null>(
		null,
	);
	const [plannerQueued, setPlannerQueued] = useState(false);
	const [installing, setInstalling] = useState(false);
	const [installError, setInstallError] = useState("");
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const res = await apiClient.getRecommendedModels();
				const planner = res.models.find((m) => m.model_name === "planner-4b");
				if (!cancelled) {
					setPlannerInstalled(planner?.downloaded === true);
					setPlannerState("ready");
				}
			} catch {
				if (!cancelled) {
					setPlannerState("unavailable");
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	// The planner is 2.4 GB of RAM-adjacent weight — never offer Install when
	// the host says no, and always surface the backend's verdict when it has one.
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const res = await apiClient.getDeviceCapabilities();
				const compat = res.models.find((m) => m.model_name === "planner-4b");
				if (!cancelled) {
					setPlannerCompat(
						compat
							? { compatible: compat.compatible, reason: compat.reason }
							: null,
					);
				}
			} catch {
				if (!cancelled) {
					setPlannerCompat(null);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const installPlanner = async () => {
		setInstalling(true);
		setInstallError("");
		try {
			await apiClient.triggerModelDownload("planner-4b");
			// Honest state: a 2.4 GB download is queued/running, not "installed".
			// The Store owns progress; the wizard re-checks on next open.
			setPlannerQueued(true);
		} catch (error) {
			setInstallError(
				error instanceof Error ? error.message : "Download failed to start",
			);
		} finally {
			setInstalling(false);
		}
	};

	const copyCommand = async () => {
		try {
			await navigator.clipboard.writeText(CLAUDE_COMMAND);
			setCopied(true);
		} catch {
			setCopied(false);
		}
	};

	return (
		<>
			<DialogTitle>
				{t("onboarding.agent.title", "Assistant & coding agent")}
			</DialogTitle>
			<DialogDescription>
				{t(
					"onboarding.agent.description",
					"Optional — the assistant works offline on-device, or with a provider you choose, or from your coding agent via MCP. Skip anytime.",
				)}
			</DialogDescription>

			<div className="flex flex-col gap-2 py-2">
				{/* Local brain — the default, fully offline option. */}
				<div className="flex items-start gap-3 rounded-lg border border-border p-3">
					<span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
						<CpuChipIcon className="size-4" aria-hidden="true" />
					</span>
					<div className="min-w-0 flex-1">
						<p className="text-sm font-medium">
							{t("onboarding.agent.localTitle", "Local brain (offline)")}
						</p>
						<p className="mt-0.5 text-xs text-muted-foreground">
							{t(
								"onboarding.agent.localBody",
								"The on-device GGUF planner runs the assistant with no network at all — nothing leaves your machine.",
							)}
						</p>
						<div className="mt-2 flex items-center gap-2">
							{plannerQueued && (
								<output className="text-xs text-muted-foreground">
									{t(
										"onboarding.agent.plannerQueued",
										"Download queued — track progress in the Store.",
									)}
								</output>
							)}
							{plannerState === "ready" && plannerInstalled && (
								<span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
									<CheckCircleIcon className="size-4" aria-hidden="true" />
									{t("onboarding.agent.plannerReady", "Planner installed")}
								</span>
							)}
							{plannerState === "ready" &&
								!plannerInstalled &&
								!plannerQueued && (
									<Button
										size="sm"
										variant="outline"
										disabled={
											installing ||
											(plannerCompat !== null && !plannerCompat.compatible)
										}
										title={
											plannerCompat && !plannerCompat.compatible
												? (plannerCompat.reason ?? undefined)
												: undefined
										}
										onClick={() => void installPlanner()}
									>
										{installing
											? t("onboarding.models.starting", "Starting…")
											: t(
													"onboarding.agent.installPlanner",
													"Install planner (4B)",
												)}
									</Button>
								)}
							{plannerState === "loading" && (
								<span className="text-xs text-muted-foreground">
									{t("common.loading", "Loading…")}
								</span>
							)}
							{plannerState === "unavailable" && (
								<span className="text-xs text-muted-foreground">
									{t(
										"onboarding.agent.plannerUnknown",
										"Can't check the planner yet — install it later from the Store.",
									)}
								</span>
							)}
						</div>
						{plannerCompat?.reason && (
							<p className="mt-1 flex items-start gap-1 text-[11px] text-amber-600 dark:text-amber-400">
								<ExclamationTriangleIcon
									className="mt-0.5 size-3.5 shrink-0"
									aria-hidden="true"
								/>
								{plannerCompat.reason}
							</p>
						)}
						{installError && (
							<p role="alert" className="mt-1 text-[11px] text-destructive">
								{installError}
							</p>
						)}
					</div>
				</div>

				{/* Provider + key — routes to the existing API-keys page. */}
				<div className="flex items-start gap-3 rounded-lg border border-border p-3">
					<span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
						<KeyIcon className="size-4" aria-hidden="true" />
					</span>
					<div className="min-w-0 flex-1">
						<p className="text-sm font-medium">
							{t("onboarding.agent.providerTitle", "Provider and key")}
						</p>
						<p className="mt-0.5 text-xs text-muted-foreground">
							{t(
								"onboarding.agent.providerBody",
								"Use an OpenAI-compatible or custom provider for the assistant. Keys live in the OS credential store — never in settings files.",
							)}
						</p>
						<div className="mt-2">
							<Button size="sm" variant="outline" onClick={onOpenApiKeys}>
								{t("onboarding.agent.openApiKeys", "Add provider & key")}
							</Button>
						</div>
					</div>
				</div>

				{/* Coding agent — the built-in MCP server. */}
				<div className="flex items-start gap-3 rounded-lg border border-border p-3">
					<span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
						<ClipboardDocumentIcon className="size-4" aria-hidden="true" />
					</span>
					<div className="min-w-0 flex-1">
						<p className="text-sm font-medium">
							{t("onboarding.agent.codingTitle", "Connect your coding agent")}
						</p>
						<p className="mt-0.5 text-xs text-muted-foreground">
							{t(
								"onboarding.agent.codingBody",
								"Otoyin serves 110 tools over MCP locally, so Claude Code, Cursor or any MCP client can call it. For Claude Code:",
							)}
						</p>
						<div className="mt-2 flex items-start gap-2">
							<code className="block min-w-0 flex-1 overflow-x-auto rounded-md border border-border bg-secondary/40 p-2 text-[10px] leading-relaxed">
								{CLAUDE_COMMAND}
							</code>
							<Button
								size="sm"
								variant="outline"
								onClick={() => void copyCommand()}
								title={t("common.copy", "Copy")}
							>
								{copied
									? t("common.copied", "Copied")
									: t("common.copy", "Copy")}
							</Button>
						</div>
						<p className="mt-1 text-[10px] text-muted-foreground">
							{MCP_GUIDANCE}
						</p>
					</div>
				</div>
			</div>

			<DialogFooter className="flex-row justify-between sm:justify-between">
				<Button variant="ghost" onClick={onBack}>
					{t("common.back", "Back")}
				</Button>
				<span className="flex gap-2">
					<Button variant="ghost" onClick={onSkip}>
						{t("onboarding.wizard.skipTour", "Skip tour")}
					</Button>
					<Button onClick={onNext}>{t("common.next", "Next")}</Button>
				</span>
			</DialogFooter>
		</>
	);
}
