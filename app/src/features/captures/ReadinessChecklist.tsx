import {
	ArrowTopRightOnSquareIcon,
	CheckCircleIcon,
	CommandLineIcon,
	CpuChipIcon,
	UserCircleIcon,
} from "@heroicons/react/24/outline";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { DictationReadiness } from "@/lib/hooks/useDictationReadiness";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";

function GateRow({
	icon,
	title,
	description,
	ready,
	action,
}: {
	icon: React.ReactNode;
	title: string;
	description: string;
	ready: boolean;
	action?: React.ReactNode;
}) {
	return (
		<div
			className={cn(
				"flex items-start gap-3 rounded-md border p-3.5 transition-colors",
				ready
					? "border-success/40 bg-success-soft"
					: "border-border bg-secondary",
			)}
		>
			<span className="mt-0.5 shrink-0" aria-hidden="true">
				{ready ? (
					<CheckCircleIcon className="size-5 text-success" />
				) : (
					<span className="block size-5 rounded-full border-2 border-muted-foreground/50" />
				)}
			</span>
			<div className="min-w-0 flex-1">
				<p className="flex items-center gap-2 text-muted-foreground">{icon}</p>
				<p className="text-sm font-medium text-foreground">{title}</p>
				<p className="text-xs leading-relaxed text-muted-foreground">
					{description}
				</p>
				{!ready && action ? <div className="pt-1.5">{action}</div> : null}
			</div>
		</div>
	);
}

/**
 * Dictation readiness checklist: one row per gate (STT, LLM, macOS
 * permissions) with inline resolution. The chord stays disarmed until
 * every row is green.
 */
export function ReadinessChecklist({
	readiness,
	compact = false,
}: {
	readiness: DictationReadiness;
	compact?: boolean;
}) {
	const { t } = useTranslation();
	const isMacOS =
		typeof navigator !== "undefined" &&
		/Mac|iPhone|iPad/.test(navigator.userAgent);
	const sttSize =
		readiness.stt?.size_mb != null
			? `${(readiness.stt.size_mb / 1000).toFixed(1)} GB`
			: null;
	const llmSize =
		readiness.llm?.size_mb != null
			? `${(readiness.llm.size_mb / 1000).toFixed(1)} GB`
			: null;

	return (
		<div className={cn("w-full space-y-2.5", !compact && "mx-auto max-w-md")}>
			{!compact ? (
				<div className="mb-5 space-y-1 text-center">
					<h2 className="text-base font-semibold text-foreground">
						{t("captures.readiness.title")}
					</h2>
					<p className="text-xs text-muted-foreground">
						{t("captures.readiness.subheading")}
					</p>
				</div>
			) : null}

			{readiness.stt ? (
				<GateRow
					icon={<CpuChipIcon className="h-3.5 w-3.5" aria-hidden="true" />}
					title={t("captures.readiness.stt.label", {
						name: readiness.stt.display_name,
					})}
					description={
						readiness.stt.ready
							? t("captures.readiness.stt.ready")
							: sttSize
								? t("captures.readiness.stt.missingWithSize", { size: sttSize })
								: t("captures.readiness.stt.missing")
					}
					ready={readiness.stt.ready}
					action={
						!readiness.stt.ready ? (
							<Link
								to="/store"
								className="inline-block text-xs text-accent hover:underline"
							>
								Get from Store →
							</Link>
						) : undefined
					}
				/>
			) : null}

			{readiness.llm ? (
				<GateRow
					icon={<CpuChipIcon className="h-3.5 w-3.5" aria-hidden="true" />}
					title={t("captures.readiness.llm.label", {
						name: readiness.llm.display_name,
					})}
					description={
						readiness.llm.ready
							? t("captures.readiness.llm.ready")
							: llmSize
								? t("captures.readiness.llm.missingWithSize", { size: llmSize })
								: t("captures.readiness.llm.missing")
					}
					ready={readiness.llm.ready}
					action={
						!readiness.llm.ready ? (
							<Link
								to="/store"
								className="inline-block text-xs text-accent hover:underline"
							>
								Get from Store →
							</Link>
						) : undefined
					}
				/>
			) : null}

			{isMacOS ? (
				<GateRow
					icon={<CommandLineIcon className="h-3.5 w-3.5" aria-hidden="true" />}
					title={t("captures.readiness.inputMonitoring.label")}
					description={
						readiness.inputMonitoring
							? t("captures.readiness.inputMonitoring.ready")
							: t("captures.readiness.inputMonitoring.missing")
					}
					ready={readiness.inputMonitoring}
					action={
						<Button size="sm" onClick={readiness.openInputMonitoringSettings}>
							<ArrowTopRightOnSquareIcon
								className="h-3.5 w-3.5"
								aria-hidden="true"
							/>
							{t("captures.readiness.inputMonitoring.openSettings")}
						</Button>
					}
				/>
			) : null}

			{isMacOS ? (
				<GateRow
					icon={<UserCircleIcon className="h-3.5 w-3.5" aria-hidden="true" />}
					title={t("captures.readiness.accessibility.label")}
					description={
						readiness.accessibility
							? t("captures.readiness.accessibility.ready")
							: t("captures.readiness.accessibility.missing")
					}
					ready={readiness.accessibility}
					action={
						<Button size="sm" onClick={readiness.openAccessibilitySettings}>
							<ArrowTopRightOnSquareIcon
								className="h-3.5 w-3.5"
								aria-hidden="true"
							/>
							{t("captures.readiness.accessibility.openSettings")}
						</Button>
					}
				/>
			) : null}
		</div>
	);
}
