import {
	ClipboardDocumentIcon,
	SparklesIcon,
} from "@heroicons/react/24/outline";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/ui/button";
import { Textarea } from "@/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import type { SongwritingAnalysis, SongwritingDraft } from "./packs/types";
import type { UpdateDraft } from "./SongwriterBrief";
import { SongwriterCoach } from "./SongwriterCoach";

export type AceStepMode = "generate" | "cover" | "repaint";

const ACE_STEP_MODES: { value: AceStepMode; label: string; hint: string }[] = [
	{ value: "generate", label: "Generate", hint: "Original music from prompt" },
	{ value: "cover", label: "Cover", hint: "Cover of described song/style" },
	{ value: "repaint", label: "Repaint", hint: "Reimagined version" },
];

/** Lyrics editor: section inserts, live counts, brief/render actions, coach. */
export function SongwriterLyrics({
	draft,
	update,
	analysis,
	lyricPlaceholder,
	quickSections,
	lyricsRef,
	packDescription,
	onInsertSection,
	onCopyBrief,
	onSend,
	canSend,
	sending,
	aceStepMode,
	onAceStepModeChange,
}: {
	draft: SongwritingDraft;
	update: UpdateDraft;
	analysis: SongwritingAnalysis;
	lyricPlaceholder: string;
	quickSections: string[];
	lyricsRef: RefObject<HTMLTextAreaElement | null>;
	packDescription: string | undefined;
	onInsertSection: (sectionLabel: string) => void;
	onCopyBrief: () => void;
	onSend: () => void;
	canSend: boolean;
	sending: boolean;
	aceStepMode: AceStepMode;
	onAceStepModeChange: (mode: AceStepMode) => void;
}) {
	const { t } = useTranslation();
	return (
		<div className="grid gap-4 lg:grid-cols-[1fr_320px]">
			<div className="max-w-3xl space-y-3">
				<div className="flex flex-wrap items-center gap-1.5">
					<span className="text-xs text-muted-foreground">
						{t("songwriter.insertSection", { defaultValue: "Insert section:" })}
					</span>
					{quickSections.map((sectionLabel) => (
						<Button
							key={sectionLabel}
							type="button"
							size="sm"
							variant="outline"
							onClick={() => onInsertSection(sectionLabel)}
						>
							+ {sectionLabel}
						</Button>
					))}
				</div>
				<Textarea
					ref={lyricsRef}
					aria-label={t("songwriter.lyrics", { defaultValue: "Song lyrics" })}
					value={draft.lyrics}
					maxLength={20000}
					spellCheck
					placeholder={lyricPlaceholder}
					onChange={(e) => update("lyrics", e.target.value)}
					className="min-h-72 font-mono text-sm"
				/>
				<p className="flex gap-3 text-xs tabular-nums text-muted-foreground">
					<span>
						{analysis.counts.words}{" "}
						{t("songwriter.words", { defaultValue: "words" })}
					</span>
					<span>
						{analysis.counts.lines}{" "}
						{t("songwriter.lines", { defaultValue: "lines" })}
					</span>
					<span>
						{analysis.counts.sections}{" "}
						{t("songwriter.sections", { defaultValue: "sections" })}
					</span>
					<span>
						{analysis.counts.repeatedLines}{" "}
						{t("songwriter.repeated", { defaultValue: "repeated" })}
					</span>
				</p>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={onCopyBrief}
					>
						<ClipboardDocumentIcon className="size-4" aria-hidden="true" />
						{t("songwriter.copyBrief", { defaultValue: "Copy agent brief" })}
					</Button>
					<Select
						value={aceStepMode}
						onValueChange={(v) => onAceStepModeChange(v as AceStepMode)}
					>
						<SelectTrigger
							className="h-8 w-32 text-xs"
							aria-label="ACE-Step mode"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{ACE_STEP_MODES.map((m) => (
								<SelectItem key={m.value} value={m.value}>
									{m.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Button
						type="button"
						size="sm"
						disabled={!canSend}
						title={t("songwriter.sendToAceStep", {
							defaultValue: "Render with ACE-Step",
						})}
						aria-label={t("songwriter.sendToAceStep", {
							defaultValue: "Render with ACE-Step",
						})}
						onClick={onSend}
					>
						<SparklesIcon className="size-4" aria-hidden="true" />
						{sending
							? t("songwriter.rendering", { defaultValue: "Rendering…" })
							: t("songwriter.sendToAceStep", {
									defaultValue: "Send to ACE-Step",
								})}
					</Button>
				</div>
			</div>
			<SongwriterCoach analysis={analysis} packDescription={packDescription} />
		</div>
	);
}
