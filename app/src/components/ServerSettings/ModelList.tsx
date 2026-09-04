import {
	ChevronDownIcon as ChevronDown,
	ChevronRightIcon as ChevronRight,
	ChevronUpIcon as ChevronUp,
	CheckCircleIcon as CircleCheck,
	XCircleIcon as CircleX,
	ArrowDownTrayIcon as Download,
	ArrowUturnLeftIcon as RotateCcw,
	SparklesIcon as Sparkles,
	UserGroupIcon as Users,
} from "@heroicons/react/24/outline";
import type { UseMutationResult } from "@tanstack/react-query";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	CodeConsole,
	TerminalComment,
	TerminalError,
	TerminalInfo,
	TerminalString,
	TerminalSuccess,
} from "@/components/ui/code-console";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/Spinner";
import { CompactRating } from "@/components/ui/star-rating";
import type { ActiveDownloadTask, ModelStatus } from "@/lib/api/types";
import { formatBytes } from "./modelUtils";

interface ModelState {
	isDownloading: boolean;
	hasError: boolean;
}

type ClearAllMutationLike = UseMutationResult<unknown, unknown, void, unknown>;

interface ModelRowProps {
	model: ModelStatus;
	modelState: ModelState;
	openModelDetail: (model: ModelStatus) => void;
	downloadProgressMap: Map<string, ActiveDownloadTask>;
	formatSize: (sizeMb?: number) => string;
}

function ModelRow({
	model,
	modelState,
	openModelDetail,
	downloadProgressMap,
	formatSize,
}: ModelRowProps) {
	const { t } = useTranslation();
	const { isDownloading, hasError } = modelState;
	const voiceCount = model.preset_voices?.length ?? 0;

	return (
		<button
			key={model.model_name}
			type="button"
			onClick={() => openModelDetail(model)}
			aria-label={model.display_name}
			className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors group"
		>
			<div className="shrink-0">
				{hasError ? (
					<CircleX className="h-3.5 w-3.5 text-destructive" />
				) : isDownloading ? (
					<Spinner size="sm" />
				) : model.loaded ? (
					<CircleCheck className="h-3.5 w-3.5 text-accent" />
				) : model.downloaded ? (
					<CircleCheck className="h-3.5 w-3.5 text-green-500" />
				) : (
					<Download className="h-3.5 w-3.5 text-muted-foreground/40" />
				)}
			</div>

			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className="text-xs font-medium truncate">
						{model.display_name}
					</span>
					{model.engine && (
						<Badge variant="outline" className="text-xs h-4 px-1 shrink-0">
							{model.engine}
						</Badge>
					)}
				</div>
				{isDownloading &&
					(() => {
						const dl = downloadProgressMap.get(model.model_name);
						const pct = dl?.progress ?? 0;
						const hasProgress = dl?.total && dl.total > 0;
						return (
							<div className="mt-1 space-y-0.5">
								<Progress
									value={hasProgress ? pct : undefined}
									className="h-0.5"
								/>
								<div className="text-xs text-muted-foreground truncate">
									{hasProgress
										? `${formatBytes(dl.current ?? 0)} / ${formatBytes(dl.total ?? 0)} (${pct.toFixed(0)}%)`
										: dl?.filename || t("models.progress.connecting")}
								</div>
							</div>
						);
					})()}
			</div>

			<div className="shrink-0 flex items-center gap-2">
				{hasError && (
					<Badge variant="destructive" className="text-xs h-4 px-1">
						{t("common.error")}
					</Badge>
				)}
				{model.loaded && (
					<Badge className="text-xs h-4 px-1 bg-accent/15 text-accent border-accent/30">
						{t("models.status.loaded")}
					</Badge>
				)}
				{voiceCount > 0 && (
					<span
						className="flex items-center gap-0.5 text-xs text-muted-foreground"
						title={`${voiceCount} voices`}
					>
						<Users className="size-3" />
						{voiceCount}
					</span>
				)}
				{model.supports_voice_mixing && (
					<Sparkles
						className="size-3 text-amber-500"
						title="Supports voice mixing"
					/>
				)}{" "}
				{model.quality_score != null && model.quality_score > 0 && (
					<CompactRating score={model.quality_score} />
				)}
				{model.downloaded && !isDownloading && !hasError && (
					<span className="text-xs text-muted-foreground">
						{formatSize(model.size_mb)}
					</span>
				)}
				<ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
			</div>
		</button>
	);
}

interface ErrorConsoleProps {
	consoleOpen: boolean;
	setConsoleOpen: Dispatch<SetStateAction<boolean>>;
	clearAllMutation: ClearAllMutationLike;
	erroredDownloads: Map<string, ActiveDownloadTask>;
	errorCount: number;
}

function ErrorConsole({
	consoleOpen,
	setConsoleOpen,
	clearAllMutation,
	erroredDownloads,
	errorCount,
}: ErrorConsoleProps) {
	const { t } = useTranslation();

	return (
		<div className="border rounded-lg overflow-hidden">
			<div className="flex items-center justify-between px-3 py-1 bg-muted/30 text-xs font-medium text-muted-foreground">
				<button
					type="button"
					onClick={() => setConsoleOpen((v) => !v)}
					className="flex items-center gap-2 hover:text-foreground transition-colors"
				>
					{consoleOpen ? (
						<ChevronUp className="size-3" />
					) : (
						<ChevronDown className="size-3" />
					)}
					<span>{t("models.problems.title")}</span>
					<Badge
						variant="destructive"
						className="text-xs h-3.5 px-1 rounded-full"
					>
						{errorCount}
					</Badge>
				</button>
				<Button
					size="sm"
					variant="ghost"
					className="h-5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
					onClick={() => clearAllMutation.mutate()}
					disabled={clearAllMutation.isPending}
				>
					<RotateCcw className="h-2.5 w-2.5 mr-0.5" />
					{t("models.problems.clearAll")}
				</Button>
			</div>
			{consoleOpen && (
				<CodeConsole
					variant="terminal"
					maxHeight="10rem"
					className="p-3 text-xs"
				>
					{Array.from(erroredDownloads.entries()).map(([modelName, dl]) => (
						<div key={modelName} className="mb-1.5 last:mb-0">
							<TerminalError>[error]</TerminalError>{" "}
							<TerminalInfo>{modelName}</TerminalInfo>
							{dl.error ? (
								<>
									:{" "}
									<TerminalString className="whitespace-pre-wrap break-all">
										{dl.error}
									</TerminalString>
								</>
							) : (
								<>
									:{" "}
									<TerminalComment>
										{t("models.problems.noDetails")}
									</TerminalComment>
								</>
							)}
							<div className="mt-0.5">
								<TerminalSuccess>
									{t("models.problems.startedAt", {
										time: new Date(dl.started_at).toLocaleString(),
									})}
								</TerminalSuccess>
							</div>
						</div>
					))}
				</CodeConsole>
			)}
		</div>
	);
}

interface ModelListProps {
	sections: { label: string; models: ModelStatus[] }[];
	getModelState: (model: ModelStatus) => ModelState;
	openModelDetail: (model: ModelStatus) => void;
	downloadProgressMap: Map<string, ActiveDownloadTask>;
	consoleOpen: boolean;
	setConsoleOpen: Dispatch<SetStateAction<boolean>>;
	clearAllMutation: ClearAllMutationLike;
	erroredDownloads: Map<string, ActiveDownloadTask>;
	errorCount: number;
	formatSize: (sizeMb?: number) => string;
}

export function ModelList({
	sections,
	getModelState,
	openModelDetail,
	downloadProgressMap,
	consoleOpen,
	setConsoleOpen,
	clearAllMutation,
	erroredDownloads,
	errorCount,
	formatSize,
}: ModelListProps) {
	const { t } = useTranslation();
	return (
		<div className="flex-1 min-h-0 overflow-y-auto space-y-4 pb-4">
			{sections.map((section) => (
				<div key={section.label}>
					<h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 px-1">
						{t(section.label)}
					</h2>
					<div className="border rounded-lg divide-y overflow-hidden">
						{section.models.map((model) => (
							<ModelRow
								key={model.model_name}
								model={model}
								modelState={getModelState(model)}
								openModelDetail={openModelDetail}
								downloadProgressMap={downloadProgressMap}
								formatSize={formatSize}
							/>
						))}
					</div>
				</div>
			))}

			{errorCount > 0 && (
				<ErrorConsole
					consoleOpen={consoleOpen}
					setConsoleOpen={setConsoleOpen}
					clearAllMutation={clearAllMutation}
					erroredDownloads={erroredDownloads}
					errorCount={errorCount}
				/>
			)}
		</div>
	);
}
