import {
	ChatBubbleBottomCenterTextIcon as Captions,
	CheckIcon as Check,
	ChevronDownIcon as ChevronDown,
	ClipboardIcon as Copy,
	ArrowDownTrayIcon as Download,
	MusicalNoteIcon as FileAudio,
	DocumentTextIcon as FileText,
	SparklesIcon as Sparkles,
	StopIcon as Square,
	TagIcon as Tag,
	TrashIcon as Trash2,
	SpeakerWaveIcon as Volume2,
} from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import { AudioBars } from "@/components/AudioBars/AudioBars";
import { CaptureInlinePlayer } from "@/components/CapturesTab/CaptureInlinePlayer";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api/client";
import type { CaptureResponse, VoiceProfileResponse } from "@/lib/api/types";
import { BOTTOM_SAFE_AREA_PADDING } from "@/lib/constants/ui";
import type { UseCaptureRecordingSessionResult } from "@/lib/hooks/useCaptureRecordingSession";
import { cn } from "@/lib/utils/cn";
import { formatAbsoluteDate } from "@/lib/utils/format";
import { SourceBadge } from "./SourceBadge";

type PlaybackState = "idle" | "generating" | "playing";

type Props = {
	selected: CaptureResponse;
	showRefined: boolean;
	setShowRefined: (v: boolean) => void;
	isPlayerVisible: boolean;
	llmModel: string;
	playAsVoice: VoiceProfileResponse | null;
	playAsVoiceId: string | null;
	profiles: VoiceProfileResponse[] | undefined;
	playAsMutation: { isPending: boolean };
	playbackState: PlaybackState;
	handlePlayAs: (voice?: VoiceProfileResponse) => void;
	handleCopy: () => void;
	handleCopyAudio?: () => void;
	handleExportAudio: () => void;
	handleExportTranscript: () => void;
	handleExportMarkdown: () => void;
	session: UseCaptureRecordingSessionResult;
	deletePending: boolean;
	onDeleteClick: () => void;
};

export function CaptureDetailPane({
	selected,
	showRefined,
	setShowRefined,
	isPlayerVisible,
	llmModel,
	playAsVoice,
	playAsVoiceId,
	profiles,
	playAsMutation,
	playbackState,
	handlePlayAs,
	handleCopy,
	handleCopyAudio,
	handleExportAudio,
	handleExportTranscript,
	handleExportMarkdown,
	session,
	deletePending,
	onDeleteClick,
}: Props) {
	const { t } = useTranslation();
	return (
		<div
			className={cn(
				"flex-1 overflow-y-auto pt-20 px-8 pb-8",
				isPlayerVisible && BOTTOM_SAFE_AREA_PADDING,
			)}
		>
			{/* Meta row */}
			<div className="flex items-center gap-3 mb-4 text-xs text-muted-foreground">
				<span>{formatAbsoluteDate(selected.created_at)}</span>
				{selected.language && (
					<>
						<span className="text-muted-foreground/40">·</span>
						<span>{selected.language.toUpperCase()}</span>
					</>
				)}
				<span className="text-muted-foreground/40">·</span>
				<SourceBadge source={selected.source} />
			</div>

			{/* Audio player card */}
			<div className="rounded-xl border border-border bg-muted/20 p-4 mb-6">
				<CaptureInlinePlayer
					audioUrl={apiClient.getCaptureAudioUrl(selected.id)}
					fallbackDurationMs={selected.duration_ms}
				/>
			</div>

			{/* Transcript header */}
			<div className="flex items-center gap-3 mb-3">
				<div className="inline-flex rounded-md bg-muted/40 p-0.5 border border-border">
					<button
						type="button"
						onClick={() => setShowRefined(true)}
						disabled={!selected.transcript_refined}
						className={cn(
							"px-3 py-1 text-xs font-medium rounded transition-colors",
							showRefined && selected.transcript_refined
								? "bg-background shadow-sm text-foreground"
								: "text-muted-foreground hover:text-foreground disabled:opacity-40",
						)}
					>
						<Sparkles className="size-3 inline-block mr-1 -translate-y-px" />
						{t("captures.transcript.refined")}
					</button>
					<button
						type="button"
						onClick={() => setShowRefined(false)}
						className={cn(
							"px-3 py-1 text-xs font-medium rounded transition-colors",
							!showRefined || !selected.transcript_refined
								? "bg-background shadow-sm text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<Captions className="size-3 inline-block mr-1 -translate-y-px" />
						{t("captures.transcript.raw")}
					</button>
				</div>
				<div className="flex-1" />
				<span className="text-xs text-muted-foreground">
					{showRefined && selected.transcript_refined
						? t("captures.transcript.refinedHint", {
								model: selected.llm_model ?? llmModel,
							})
						: selected.stt_model
							? t("captures.transcript.rawHint", { model: selected.stt_model })
							: null}
				</span>
			</div>

			{/* Transcript body */}
			<div className="rounded-xl border border-border bg-muted/10">
				<Textarea
					key={`${selected.id}-${showRefined}`}
					defaultValue={
						showRefined && selected.transcript_refined
							? selected.transcript_refined
							: selected.transcript_raw
					}
					readOnly
					className="text-[15px] leading-relaxed min-h-[260px] border-0 bg-transparent resize-none focus-visible:ring-0 focus-visible:ring-offset-0 p-6"
				/>
			</div>

			{/* Bottom actions */}
			<div className="flex items-center gap-2 mt-4 flex-wrap">
				<div className="inline-flex">
					<Button
						variant="outline"
						size="sm"
						onClick={() => handlePlayAs()}
						disabled={!playAsVoice || playAsMutation.isPending}
						className={cn(
							"gap-2 rounded-r-none border-r-0 pr-3 pl-2 transition-colors",
							playbackState !== "idle" &&
								"border-accent/50 text-foreground bg-accent/10 hover:bg-accent/15 hover:text-foreground hover:border-accent/50",
						)}
					>
						{playbackState === "generating" ? (
							<>
								<AudioBars mode="generating" className="h-3.5" />
								{t("captures.actions.playAsGenerating")}
							</>
						) : playbackState === "playing" ? (
							<>
								<Square className="size-3 fill-current" />
								{playAsVoice
									? t("captures.actions.playAsStop", { name: playAsVoice.name })
									: t("captures.actions.playAsStopFallback")}
							</>
						) : (
							<>
								<Volume2 className="h-3.5 w-3.5" />
								{playAsVoice
									? t("captures.actions.playAs", { name: playAsVoice.name })
									: t("captures.actions.playAsFallback")}
							</>
						)}
					</Button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="outline"
								size="sm"
								className={cn(
									"rounded-l-none px-2 transition-colors",
									playbackState !== "idle" &&
										"border-accent/50 bg-accent/10 hover:bg-accent/15 hover:text-foreground hover:border-accent/50",
								)}
								aria-label={t("captures.actions.playAsDropdownLabel")}
								title={t("captures.actions.playAsDropdownLabel")}
								disabled={!profiles || !profiles.length}
							>
								<ChevronDown className="h-3.5 w-3.5 opacity-70" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="w-64">
							<DropdownMenuLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
								{t("captures.actions.playAsDropdownLabel")}
							</DropdownMenuLabel>
							<DropdownMenuSeparator />
							{profiles?.map((v) => (
								<DropdownMenuItem
									key={v.id}
									onClick={() => handlePlayAs(v)}
									className="py-2"
								>
									<div className="flex-1 min-w-0">
										<div className="text-sm font-medium truncate">{v.name}</div>
										<div className="text-xs text-muted-foreground truncate">
											{v.description || v.language.toUpperCase()}
										</div>
									</div>
									{v.id === playAsVoiceId && (
										<Check className="h-3.5 w-3.5 text-accent shrink-0" />
									)}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
				<Button variant="outline" size="sm" onClick={handleCopy}>
					<Copy className="h-3.5 w-3.5 mr-1.5" />
					{t("captures.actions.copy")}
				</Button>
				{handleCopyAudio && (
					<Button
						variant="outline"
						size="sm"
						title="Copy audio to cross-tab clipboard — paste in Timeline, Mixer, Stories, etc."
						aria-label="Copy audio to clipboard"
						onClick={handleCopyAudio}
					>
						???
					</Button>
				)}
				<Button
					variant="outline"
					size="sm"
					onClick={() => session.refine(selected.id)}
					disabled={session.isRefining}
				>
					{session.isRefining ? (
						<Spinner size="sm" className="mr-1.5" />
					) : (
						<Sparkles className="h-3.5 w-3.5 mr-1.5" />
					)}
					{selected.transcript_refined
						? t("captures.actions.reRefine")
						: t("captures.actions.refine")}
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={async () => {
						const name = prompt("Tag name?");
						if (!name?.trim()) {
							return;
						}
						try {
							await apiClient.addTagToItem(
								"capture",
								selected.id,
								undefined,
								name.trim(),
							);
						} catch (e) {
							console.error(e);
						}
					}}
				>
					<Tag className="h-3.5 w-3.5 mr-1.5" />
					Tag
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" size="sm">
							<Download className="h-3.5 w-3.5 mr-1.5" />
							{t("captures.actions.export")}
							<ChevronDown className="h-3.5 w-3.5 ml-1 opacity-70" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-56">
						<DropdownMenuLabel className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
							{t("captures.actions.exportDropdownLabel")}
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={handleExportAudio}>
							<FileAudio className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
							{t("captures.actions.exportAudio")}
						</DropdownMenuItem>
						<DropdownMenuItem onClick={handleExportTranscript}>
							<Captions className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
							{t("captures.actions.exportTranscript")}
						</DropdownMenuItem>
						<DropdownMenuItem onClick={handleExportMarkdown}>
							<FileText className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
							{t("captures.actions.exportMarkdown")}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<div className="flex-1" />
				<Button
					variant="ghost"
					size="sm"
					onClick={onDeleteClick}
					disabled={deletePending}
					className="text-muted-foreground "
				>
					{deletePending ? (
						<Spinner size="sm" className="mr-1.5" />
					) : (
						<Trash2 className="h-3.5 w-3.5 mr-1.5" />
					)}
					{t("captures.actions.delete")}
				</Button>
			</div>
		</div>
	);
}
