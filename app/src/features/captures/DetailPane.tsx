import {
	ArrowDownTrayIcon,
	ChatBubbleBottomCenterTextIcon as CaptionsIcon,
	CheckIcon,
	ChevronDownIcon,
	ClipboardDocumentIcon,
	DocumentTextIcon,
	MusicalNoteIcon,
	SparklesIcon,
	SpeakerWaveIcon,
	StopIcon,
	TagIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PillAudioBars } from "@/features/capture/CapturePill";
import { apiClient } from "@/lib/api/client";
import type { CaptureResponse, VoiceProfileResponse } from "@/lib/api/types";
import { showStudioErrorToast } from "@/lib/errors";
import type { UseCaptureRecordingSessionResult } from "@/lib/hooks/useCaptureRecordingSession";
import { cn } from "@/lib/utils/cn";
import { formatAbsoluteDate } from "@/lib/utils/format";
import { Button } from "@/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { InlinePlayer } from "./InlinePlayer";
import { PackedTranscriptView } from "./PackedTranscriptView";
import { SourceBadge } from "./shared";

type PlaybackState = "idle" | "generating" | "playing";

/** Inline tag adder: replaces the old native prompt() dialog. */
function TagAdder({ captureId }: { captureId: string }) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [saving, setSaving] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (open) {
			inputRef.current?.focus();
		}
	}, [open]);
	if (!open) {
		return (
			<Button
				variant="outline"
				size="sm"
				onClick={() => {
					setName("");
					setOpen(true);
				}}
			>
				<TagIcon className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
				Tag
			</Button>
		);
	}
	return (
		<form
			className="flex items-center gap-1.5"
			onSubmit={(e) => {
				e.preventDefault();
				if (!name.trim()) {
					return;
				}
				setSaving(true);
				apiClient
					.addTagToItem("capture", captureId, undefined, name.trim())
					.then(() => {
						setOpen(false);
						setName("");
					})
					.catch((err: unknown) => showStudioErrorToast(err))
					.finally(() => setSaving(false));
			}}
		>
			<input
				ref={inputRef}
				value={name}
				onChange={(e) => setName(e.target.value)}
				placeholder="Tag name"
				aria-label="Tag name"
				className="h-8 w-32 rounded-sm border border-input bg-sunken px-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none"
			/>
			<Button
				type="submit"
				size="sm"
				disabled={!name.trim() || saving}
				loading={saving}
			>
				Add
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onClick={() => setOpen(false)}
			>
				Cancel
			</Button>
		</form>
	);
}

/**
 * Capture detail: metadata, inline waveform player, refined/raw
 * transcript switch, play-as-voice, copy/export, refine, tag, delete.
 */
export function DetailPane({
	capture,
	showRefined,
	onShowRefined,
	llmModel,
	playAsVoice,
	playAsVoiceId,
	profiles,
	playPending,
	playbackState,
	onPlayAs,
	onCopy,
	onCopyAudio,
	onExportAudio,
	onExportTranscript,
	onExportMarkdown,
	session,
	deletePending,
	onDelete,
}: {
	capture: CaptureResponse;
	showRefined: boolean;
	onShowRefined: (v: boolean) => void;
	llmModel: string;
	playAsVoice: VoiceProfileResponse | null;
	playAsVoiceId: string | null;
	profiles: VoiceProfileResponse[] | undefined;
	playPending: boolean;
	playbackState: PlaybackState;
	onPlayAs: (voice?: VoiceProfileResponse) => void;
	onCopy: () => void;
	onCopyAudio: () => void;
	onExportAudio: () => void;
	onExportTranscript: () => void;
	onExportMarkdown: () => void;
	session: UseCaptureRecordingSessionResult;
	deletePending: boolean;
	onDelete: () => void;
}) {
	const { t } = useTranslation();
	const refined = capture.transcript_refined;
	const showingRefined = showRefined && !!refined;

	return (
		<div className="min-w-0 flex-1 overflow-y-auto px-8 pb-8 pt-4">
			<p className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
				{formatAbsoluteDate(capture.created_at)}
				{capture.language ? (
					<>
						<span aria-hidden="true" className="text-muted-foreground/50">
							·
						</span>
						<span>{capture.language.toUpperCase()}</span>
					</>
				) : null}
				<span aria-hidden="true" className="text-muted-foreground/50">
					·
				</span>
				<SourceBadge source={capture.source} />
			</p>

			<div className="mb-6 rounded-md border border-border bg-card p-4">
				<InlinePlayer
					audioUrl={apiClient.getCaptureAudioUrl(capture.id)}
					fallbackMs={capture.duration_ms}
				/>
			</div>

			<div className="mb-3 flex items-center gap-3">
				<fieldset className="inline-flex rounded-md border border-border bg-sunken p-0.5">
					<legend className="sr-only">Transcript version</legend>
					<button
						type="button"
						onClick={() => onShowRefined(true)}
						disabled={!refined}
						aria-pressed={showingRefined}
						className={cn(
							"rounded-[6px] px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40",
							showingRefined
								? "bg-card text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<SparklesIcon
							className="mr-1 inline size-3 -translate-y-px"
							aria-hidden="true"
						/>
						{t("captures.transcript.refined")}
					</button>
					<button
						type="button"
						onClick={() => onShowRefined(false)}
						aria-pressed={!showingRefined}
						className={cn(
							"rounded-[6px] px-3 py-1 text-xs font-medium transition-colors",
							!showingRefined
								? "bg-card text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<CaptionsIcon
							className="mr-1 inline size-3 -translate-y-px"
							aria-hidden="true"
						/>
						{t("captures.transcript.raw")}
					</button>
				</fieldset>
				<span className="flex-1" />
				<span className="text-xs text-muted-foreground">
					{showingRefined
						? t("captures.transcript.refinedHint", {
								model: capture.llm_model ?? llmModel,
							})
						: capture.stt_model
							? t("captures.transcript.rawHint", { model: capture.stt_model })
							: null}
				</span>
			</div>

			<div className="rounded-md border border-border bg-card">
				<textarea
					key={`${capture.id}-${showingRefined}`}
					defaultValue={showingRefined ? refined : capture.transcript_raw}
					readOnly
					rows={12}
					aria-label={
						showingRefined
							? t("captures.transcript.refined")
							: t("captures.transcript.raw")
					}
					className="min-h-[260px] max-h-[500px] w-full resize-none overflow-y-auto rounded-md border-0 bg-transparent p-6 text-[15px] leading-relaxed text-foreground focus:outline-none"
				/>
			</div>

			<div className="mt-4">
				<PackedTranscriptView captureId={capture.id} />
			</div>

			<div className="mt-4 flex flex-wrap items-center gap-2">
				<span className="inline-flex">
					<Button
						variant="outline"
						size="sm"
						onClick={() => onPlayAs()}
						disabled={!playAsVoice || playPending}
						loading={playbackState === "generating"}
						className={cn(
							"gap-2 rounded-r-none border-r-0",
							playbackState !== "idle" && "border-accent/40 text-foreground",
						)}
					>
						{playbackState === "generating" ? (
							<PillAudioBars mode="busy" />
						) : playbackState === "playing" ? (
							<StopIcon className="size-3.5 fill-current" aria-hidden="true" />
						) : (
							<SpeakerWaveIcon className="h-3.5 w-3.5" aria-hidden="true" />
						)}
						{playbackState === "playing"
							? playAsVoice
								? t("captures.actions.playAsStop", { name: playAsVoice.name })
								: t("captures.actions.playAsStopFallback")
							: playAsVoice
								? t("captures.actions.playAs", { name: playAsVoice.name })
								: t("captures.actions.playAsFallback")}
					</Button>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="outline"
								size="sm"
								className="rounded-l-none px-2"
								aria-label={t("captures.actions.playAsDropdownLabel")}
								title={t("captures.actions.playAsDropdownLabel")}
								disabled={!profiles || profiles.length === 0}
							>
								<CaptionsIcon
									className="h-3.5 w-3.5 opacity-70"
									aria-hidden="true"
								/>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="start" className="w-64">
							<DropdownMenuLabel>
								{t("captures.actions.playAsDropdownLabel")}
							</DropdownMenuLabel>
							<DropdownMenuSeparator />
							{profiles?.map((v) => (
								<DropdownMenuItem
									key={v.id}
									onClick={() => onPlayAs(v)}
									className="py-2"
								>
									<span className="min-w-0 flex-1">
										<span className="block truncate text-sm font-medium">
											{v.name}
										</span>
										<span className="block truncate text-xs text-muted-foreground">
											{v.description || v.language.toUpperCase()}
										</span>
									</span>
									{v.id === playAsVoiceId ? (
										<CheckIcon
											className="h-3.5 w-3.5 shrink-0 text-accent"
											aria-hidden="true"
										/>
									) : null}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				</span>
				<Button variant="outline" size="sm" onClick={onCopy}>
					<ClipboardDocumentIcon
						className="mr-1.5 h-3.5 w-3.5"
						aria-hidden="true"
					/>
					{t("captures.actions.copy")}
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={onCopyAudio}
					title="Copy audio to cross-tab clipboard"
				>
					<MusicalNoteIcon className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
					Audio
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={() => session.refine(capture.id)}
					disabled={session.isRefining}
					loading={session.isRefining}
				>
					<SparklesIcon className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
					{capture.transcript_refined
						? t("captures.actions.reRefine")
						: t("captures.actions.refine")}
				</Button>
				<TagAdder captureId={capture.id} />
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline" size="sm">
							<ArrowDownTrayIcon
								className="mr-1.5 h-3.5 w-3.5"
								aria-hidden="true"
							/>
							{t("captures.actions.export")}
							<ChevronDownIcon
								className="ml-1 h-3.5 w-3.5 opacity-70"
								aria-hidden="true"
							/>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-56">
						<DropdownMenuLabel>
							{t("captures.actions.exportDropdownLabel")}
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuItem onClick={onExportAudio}>
							<MusicalNoteIcon
								className="mr-2 h-3.5 w-3.5 text-muted-foreground"
								aria-hidden="true"
							/>
							{t("captures.actions.exportAudio")}
						</DropdownMenuItem>
						<DropdownMenuItem onClick={onExportTranscript}>
							<CaptionsIcon
								className="mr-2 h-3.5 w-3.5 text-muted-foreground"
								aria-hidden="true"
							/>
							{t("captures.actions.exportTranscript")}
						</DropdownMenuItem>
						<DropdownMenuItem onClick={onExportMarkdown}>
							<DocumentTextIcon
								className="mr-2 h-3.5 w-3.5 text-muted-foreground"
								aria-hidden="true"
							/>
							{t("captures.actions.exportMarkdown")}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<span className="flex-1" />
				<Button
					variant="ghost"
					size="sm"
					onClick={onDelete}
					disabled={deletePending}
					loading={deletePending}
					className="text-muted-foreground"
				>
					<TrashIcon className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
					{t("captures.actions.delete")}
				</Button>
			</div>
		</div>
	);
}
