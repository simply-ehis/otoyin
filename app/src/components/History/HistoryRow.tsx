import {
	SignalIcon as AudioLines,
	ClipboardIcon as Copy,
	ArrowDownTrayIcon as Download,
	ArchiveBoxIcon as FileArchive,
	EllipsisHorizontalIcon as MoreHorizontal,
	PlayIcon as Play,
	ArrowUturnLeftIcon as RotateCcwIcon,
	StopIcon as Square,
	StarIcon as Star,
	TagIcon as Tag,
	TrashIcon as Trash2,
	SparklesIcon as Wand2,
} from "@heroicons/react/24/outline";
import { AnimatePresence } from "framer-motion";
import { AudioBars } from "@/components/AudioBars";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import type { HistoryResponse } from "@/lib/api/types";
import { copyClip } from "@/lib/clip";
import { cn } from "@/lib/utils/cn";
import {
	formatDate,
	formatDuration,
	formatEngineName,
} from "@/lib/utils/format";
import type { HistoryTableController } from "./hooks/useHistoryTable";
import { VersionList } from "./VersionList";

interface HistoryRowProps {
	gen: HistoryResponse;
	controller: HistoryTableController;
	measureElement: (node: HTMLElement | null) => void;
	start: number;
	index: number;
}

export function HistoryRow({
	gen,
	controller,
	measureElement,
	start,
	index,
}: HistoryRowProps) {
	const { toast } = useToast();
	const {
		t,
		currentAudioId,
		isPlaying,
		expandedVersionsId,
		setExpandedVersionsId,
		deleteGeneration,
		cancelGeneration,
		handlePlay,
		handleToggleFavorite,
		handleRetry,
		handleDeleteClick,
		handleDownloadAudio,
		handleExportPackage,
		handleApplyEffects,
		handleRegenerate,
		handlePlayVersion,
		handleSwitchVersion,
	} = controller;

	const isCurrentlyPlaying = currentAudioId === gen.id && isPlaying;
	const isInProgress =
		gen.status === "loading_model" || gen.status === "generating";
	const isGenerating = isInProgress;
	const isFailed = gen.status === "failed";
	const isPlayable = !isGenerating && !isFailed;
	const hasVersions = gen.versions && gen.versions.length > 1;
	const isVersionsExpanded = expandedVersionsId === gen.id;
	const isCancelling =
		cancelGeneration.isPending && cancelGeneration.variables === gen.id;

	return (
		<div
			ref={measureElement}
			data-index={index}
			style={{
				position: "absolute",
				top: 0,
				left: 0,
				width: "100%",
				transform: `translateY(${start}px)`,
			}}
		>
			<div
				className={cn(
					"border rounded-md bg-card transition-colors text-left w-full",
					isCurrentlyPlaying && "bg-muted/70",
				)}
			>
				{/* biome-ignore lint/a11y/useSemanticElements: contains nested interactive elements, can't be <button> */}
				<div
					role="button"
					tabIndex={0}
					className={cn(
						"flex items-stretch gap-4 h-26 p-3 outline-none",
						isPlayable && "hover:bg-muted/70 cursor-pointer rounded-md",
						isVersionsExpanded && "rounded-b-none",
					)}
					aria-label={
						isGenerating
							? `Generating speech for ${gen.profile_name}…`
							: isFailed
								? `Generation failed for ${gen.profile_name}`
								: isCurrentlyPlaying
									? `Sample from ${gen.profile_name}, ${formatDuration(gen.duration ?? 0)}, ${formatDate(gen.created_at)}. Playing. Press Enter to restart.`
									: `Sample from ${gen.profile_name}, ${formatDuration(gen.duration ?? 0)}, ${formatDate(gen.created_at)}. Press Enter to play.`
					}
					onMouseDown={(e) => {
						if (!isPlayable) {
							return;
						}
						const target = e.target as HTMLElement;
						if (
							target.closest("textarea") ||
							window.getSelection()?.toString()
						) {
							return;
						}
						handlePlay(gen.id, gen.text, gen.profile_id);
					}}
					onKeyDown={(e) => {
						if (!isPlayable) {
							return;
						}
						const target = e.target as HTMLElement;
						if (target.closest("textarea") || target.closest("button")) {
							return;
						}
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							handlePlay(gen.id, gen.text, gen.profile_id);
						}
					}}
				>
					<div className="flex items-center shrink-0 w-10 justify-center overflow-hidden">
						<AudioBars
							mode={
								isGenerating
									? "generating"
									: isCurrentlyPlaying
										? "playing"
										: "idle"
							}
						/>
					</div>

					<div className="flex flex-col gap-2 w-48 shrink-0 justify-center">
						<div
							className="font-medium text-sm truncate"
							title={gen.profile_name}
						>
							{gen.profile_name}
						</div>
						<div className="flex items-center gap-2">
							<span className="text-xs text-muted-foreground">
								{gen.language}
							</span>
							<span className="text-xs text-muted-foreground">
								{formatEngineName(gen.engine, gen.model_size)}
							</span>
							{isFailed ? (
								<span className="text-xs text-destructive">Failed</span>
							) : !isGenerating ? (
								<span className="text-xs text-muted-foreground">
									{formatDuration(gen.duration ?? 0)}
								</span>
							) : null}
						</div>
						<div className="text-xs text-muted-foreground">
							{isInProgress ? (
								<span className="text-accent">
									{gen.status === "loading_model"
										? "Loading model…"
										: "Generating…"}
								</span>
							) : (
								formatDate(gen.created_at)
							)}
						</div>
					</div>

					<div className="flex-1 min-w-0 flex">
						<Textarea
							value={gen.text}
							className="flex-1 resize-none text-sm text-muted-foreground select-text"
							readOnly
							aria-label={`Transcript for sample from ${gen.profile_name}, ${formatDuration(gen.duration ?? 0)}`}
						/>
					</div>

					{/* biome-ignore lint/a11y/noStaticElementInteractions: only stops propagation, no real interaction */}
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: only stops propagation */}
					<span
						className="shrink-0 flex flex-col justify-center items-center gap-0.5"
						onMouseDown={(e) => e.stopPropagation()}
						onClick={(e) => e.stopPropagation()}
					>
						<Button
							variant="ghost"
							size="icon"
							className={cn(
								"size-6 text-muted-foreground/50 hover:bg-muted-foreground/20 hover:text-muted-foreground",
								gen.is_favorited && "text-accent hover:text-accent",
							)}
							aria-label={gen.is_favorited ? "Unfavorite" : "Favorite"}
							onClick={() => handleToggleFavorite(gen.id)}
						>
							<Star
								className="size-2"
								fill={gen.is_favorited ? "currentColor" : "none"}
							/>
						</Button>
						{hasVersions && (
							<Button
								variant="ghost"
								size="icon"
								className={cn(
									"size-6 text-muted-foreground/50 hover:bg-muted-foreground/20 hover:text-muted-foreground",
									isVersionsExpanded && "text-accent hover:text-accent",
								)}
								aria-label="Toggle versions"
								onClick={() =>
									setExpandedVersionsId(isVersionsExpanded ? null : gen.id)
								}
							>
								<AudioLines className="size-2" />
							</Button>
						)}

						{isFailed ? (
							<>
								<Button
									variant="ghost"
									size="icon"
									className="size-6 text-muted-foreground/50 hover:bg-muted-foreground/20 hover:text-muted-foreground"
									aria-label="Retry generation"
									onClick={() => handleRetry(gen.id)}
								>
									<RotateCcwIcon className="size-2" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									className="size-6 text-muted-foreground/50 hover:bg-muted-foreground/20 hover:text-muted-foreground"
									aria-label="Delete generation"
									disabled={deleteGeneration.isPending}
									onClick={() => handleDeleteClick(gen.id, gen.profile_name)}
								>
									<Trash2 className="size-2" />
								</Button>
							</>
						) : isGenerating ? (
							<Button
								variant="ghost"
								size="icon"
								className="size-6 text-muted-foreground/50 hover:bg-muted-foreground/20 hover:text-muted-foreground"
								aria-label="Cancel generation"
								disabled={isCancelling}
								onClick={() => cancelGeneration.mutate(gen.id)}
							>
								{isCancelling ? (
									<Square className="size-2 animate-spin" />
								) : (
									<Square className="size-2" />
								)}
							</Button>
						) : (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="size-6 text-muted-foreground/50 hover:bg-muted-foreground/20 hover:text-muted-foreground"
										aria-label={t("history.actions.menu")}
										disabled={isGenerating}
									>
										<MoreHorizontal className="size-2" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem
										onClick={() => handlePlay(gen.id, gen.text, gen.profile_id)}
									>
										<Play className="mr-2 size-4" />
										{t("history.actions.play")}
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={() => handleDownloadAudio(gen.id, gen.text)}
										disabled={controller.exportGenerationAudio.isPending}
									>
										<Download className="mr-2 size-4" />
										{t("history.actions.exportAudio")}
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={() => handleExportPackage(gen.id, gen.text)}
										disabled={controller.exportGeneration.isPending}
									>
										<FileArchive className="mr-2 size-4" />
										{t("history.actions.exportPackage")}
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={() => handleApplyEffects(gen.id, gen.versions)}
									>
										<Wand2 className="mr-2 size-4" />
										{t("history.actions.applyEffects")}
									</DropdownMenuItem>
									<DropdownMenuItem onClick={() => handleRegenerate(gen.id)}>
										<RotateCcwIcon className="mr-2 size-4" />
										{t("history.actions.regenerate")}
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={async () => {
											const name = prompt("Tag name?");
											if (!name?.trim()) {
												return;
											}
											try {
												await apiClient.addTagToItem(
													"generation",
													gen.id,
													undefined,
													name.trim(),
												);
												toast({ title: `Tagged "${name.trim()}"` });
											} catch (e) {
												toast({
													title: "Tag failed",
													description:
														e instanceof Error ? e.message : String(e),
													variant: "destructive",
												});
											}
										}}
									>
										<Tag className="mr-2 size-4" />
										Add tag
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={() => {
											window.location.hash = "#/library";
											// also push via router if available
											try {
												window.location.assign("/#/library");
											} catch {}
										}}
									>
										<FileArchive className="mr-2 size-4" />
										Open in Library
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={async () => {
											try {
												await copyClip({
													kind: "generation",
													id: gen.id,
													audioUrl: apiClient.getAudioUrl(gen.id),
													name: `${gen.profile_name}: ${gen.text.slice(0, 40)}`,
													durationMs: Math.round((gen.duration ?? 0) * 1000),
												});
												toast({ title: t("history.actions.copyClipDone") });
											} catch {
												toast({
													title: t("history.actions.copyClipFailed"),
													variant: "destructive",
												});
											}
										}}
									>
										<Copy className="mr-2 size-4" />
										{t("history.actions.copyClip")}
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={() => handleDeleteClick(gen.id, gen.profile_name)}
										disabled={deleteGeneration.isPending}
									>
										<Trash2 className="mr-2 size-4" />
										{t("common.delete")}
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</span>
				</div>

				<AnimatePresence>
					{isVersionsExpanded && gen.versions && (
						<VersionList
							gen={gen}
							onPlayVersion={handlePlayVersion}
							onSwitchVersion={handleSwitchVersion}
						/>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}
