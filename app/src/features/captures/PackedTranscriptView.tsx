import {
	ArrowDownTrayIcon,
	CheckIcon,
	ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/lib/api/client";
import type { CaptureChapter, CaptureWordsDoc } from "@/lib/api/types";
import { showStudioErrorToast } from "@/lib/errors";
import {
	formatTime,
	type PackWord,
	renderTakePack,
	selectHighlights,
} from "@/lib/transcript/packTranscript";
import { Button } from "@/ui/button";

/**
 * Packed takes view: renders a capture's Scribe-shaped words sidecar as the
 * video-use-compatible packed markdown, with copy + .md download. Fetches
 * its own data; renders nothing while loading and a hint when no words
 * JSON exists (404-tolerant — older captures simply lack it).
 */
export function PackedTranscriptView({ captureId }: { captureId: string }) {
	const { t } = useTranslation();
	const [doc, setDoc] = useState<CaptureWordsDoc | null>(null);
	const [chapters, setChapters] = useState<CaptureChapter[]>([]);
	const [missing, setMissing] = useState(false);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		let live = true;
		setDoc(null);
		setChapters([]);
		setMissing(false);
		setCopied(false);
		apiClient
			.fetchCaptureWordsJson(captureId)
			.then((result) => {
				if (!live) {
					return;
				}
				if (result) {
					setDoc(result);
				} else {
					setMissing(true);
				}
			})
			.catch((err: unknown) => {
				if (live) {
					showStudioErrorToast(err);
				}
			});
		apiClient
			.fetchCaptureChapters(captureId)
			.then((result) => {
				if (live && result) {
					setChapters(result.chapters);
				}
			})
			.catch(() => {
				// Chapters are optional garnish — words view stands alone.
			});
		return () => {
			live = false;
		};
	}, [captureId]);

	const markdown = useMemo(() => {
		if (!doc) {
			return null;
		}
		const duration = doc.words.reduce((max, w) => Math.max(max, w.end), 0);
		return renderTakePack(
			captureId.slice(0, 8),
			doc.words as PackWord[],
			duration,
		);
	}, [doc, captureId]);

	const highlights = useMemo(() => {
		if (!doc) {
			return [];
		}
		return selectHighlights(doc.words as PackWord[]);
	}, [doc]);

	if (missing) {
		return (
			<p className="text-xs text-muted-foreground">
				{t("captures.transcript.packedEmpty")}
			</p>
		);
	}
	if (!markdown) {
		return null;
	}

	const copyPack = () => {
		navigator.clipboard
			.writeText(markdown)
			.then(() => setCopied(true))
			.catch((err: unknown) => showStudioErrorToast(err));
	};
	const downloadPack = () => {
		const blob = new Blob([markdown], { type: "text/markdown" });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = "takes_packed.md";
		anchor.click();
		URL.revokeObjectURL(url);
	};
	const highlightsText = highlights
		.map(
			(clip) =>
				`[${formatTime(clip.start)}-${formatTime(clip.end)}] ${clip.labels.join(", ")}`,
		)
		.join("\n");
	const copyHighlights = () => {
		navigator.clipboard
			.writeText(highlightsText)
			.catch((err: unknown) => showStudioErrorToast(err));
	};
	const chaptersText = chapters
		.map(
			(chapter) =>
				`[${formatTime(chapter.start)}-${formatTime(chapter.end)}] ${chapter.title}`,
		)
		.join("\n");
	const copyChapters = () => {
		navigator.clipboard
			.writeText(chaptersText)
			.catch((err: unknown) => showStudioErrorToast(err));
	};

	return (
		<div className="rounded-md border border-border bg-card">
			<div className="flex items-center gap-2 border-b border-border px-4 py-2">
				<span className="text-xs font-medium text-foreground">
					{t("captures.transcript.packed")}
				</span>
				<span className="flex-1" />
				<Button
					variant="ghost"
					size="sm"
					onClick={copyPack}
					title={t("captures.transcript.copyPack")}
				>
					{copied ? (
						<CheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
					) : (
						<ClipboardDocumentIcon className="h-3.5 w-3.5" aria-hidden="true" />
					)}
					{t("captures.transcript.copyPack")}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					onClick={downloadPack}
					title={t("captures.transcript.downloadPack")}
				>
					<ArrowDownTrayIcon className="h-3.5 w-3.5" aria-hidden="true" />
					{t("captures.transcript.downloadPack")}
				</Button>
			</div>
			<pre className="max-h-[320px] overflow-y-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-foreground">
				{markdown}
			</pre>
			{highlights.length > 0 ? (
				<div className="border-t border-border px-4 py-2">
					<div className="flex items-center gap-2 py-1">
						<span className="text-xs font-medium text-foreground">
							{t("captures.transcript.highlights")}
						</span>
						<span className="flex-1" />
						<Button
							variant="ghost"
							size="sm"
							onClick={copyHighlights}
							title={t("captures.transcript.copyHighlights")}
						>
							<ClipboardDocumentIcon
								className="h-3.5 w-3.5"
								aria-hidden="true"
							/>
							{t("captures.transcript.copyHighlights")}
						</Button>
					</div>
					<ul className="space-y-0.5 pb-2 font-mono text-xs text-muted-foreground">
						{highlights.map((clip) => (
							<li key={`${clip.start}-${clip.end}`}>
								[{formatTime(clip.start)}-{formatTime(clip.end)}]{" "}
								{clip.labels.join(", ")}
							</li>
						))}
					</ul>
				</div>
			) : null}
			{chapters.length > 0 ? (
				<div className="border-t border-border px-4 py-2">
					<div className="flex items-center gap-2 py-1">
						<span className="text-xs font-medium text-foreground">
							{t("captures.transcript.chapters")}
						</span>
						<span className="flex-1" />
						<Button
							variant="ghost"
							size="sm"
							onClick={copyChapters}
							title={t("captures.transcript.copyChapters")}
						>
							<ClipboardDocumentIcon
								className="h-3.5 w-3.5"
								aria-hidden="true"
							/>
							{t("captures.transcript.copyChapters")}
						</Button>
					</div>
					<ul className="space-y-0.5 pb-2 font-mono text-xs text-muted-foreground">
						{chapters.map((chapter) => (
							<li key={chapter.index}>
								[{formatTime(chapter.start)}-{formatTime(chapter.end)}]{" "}
								{chapter.title || "…"}
							</li>
						))}
					</ul>
				</div>
			) : null}
		</div>
	);
}
