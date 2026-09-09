import {
	CheckCircleIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { useAudiobookStore } from "@/stores/audiobookStore";
import { useServerStore } from "@/stores/serverStore";
import { Button } from "@/ui/button";
import { Field, Input, Textarea } from "@/ui/input";
import { Spinner } from "@/ui/primitives";

interface PreviewChapter {
	index: number;
	title: string;
	word_count: number;
	preview: string;
}

interface PreviewData {
	title: string;
	has_cover: boolean;
	chapters: PreviewChapter[];
}

/**
 * EPUB/PDF import: pick file → chapter preview with word counts and
 * speech estimate → confirm. Done state auto-resets.
 */
export function ImportWizard({ onImported }: { onImported: () => void }) {
	const [step, setStep] = useState<"pick" | "preview" | "done">("pick");
	const [busy, setBusy] = useState(false);
	const [title, setTitle] = useState("");
	const [author, setAuthor] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<PreviewData | null>(null);
	const [expanded, setExpanded] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [importMode, setImportMode] = useState<"file" | "paste">("paste");
	const [pasteText, setPasteText] = useState("");
	const [dragOver, setDragOver] = useState(false);

	const totalWords =
		preview?.chapters.reduce((sum, ch) => sum + ch.word_count, 0) ?? 0;
	const estMinutes = Math.round(totalWords / 150);

	const reset = () => {
		setStep("pick");
		setBusy(false);
		setTitle("");
		setAuthor("");
		setFile(null);
		setPreview(null);
		setExpanded(null);
		setError(null);
	};

	const pick = async (f: File | undefined) => {
		if (!f) {
			return;
		}
		setFile(f);
		setBusy(true);
		setError(null);
		try {
			const data = await apiClient.previewBook(f);
			setPreview(data);
			if (!title) {
				setTitle(data.title);
			}
			setStep("preview");
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	};

	const confirm = async () => {
		if (!file || !preview) {
			return;
		}
		setBusy(true);
		setError(null);
		try {
			const book = await apiClient.importBook(
				file,
				title || preview.title,
				author || undefined,
			);
			useAudiobookStore.getState().setSelectedId(book.id);
			setStep("done");
			onImported();
			window.setTimeout(reset, 1500);
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	};

	const importPastedText = async () => {
		if (!pasteText.trim()) {
			return;
		}
		setBusy(true);
		setError(null);
		try {
			const chapters = splitChapters(pasteText);
			const chapterData = chapters.map((ch, i) => ({
				title: ch.title || `Chapter ${i + 1}`,
				text: ch.text,
			}));
			const bookTitle = title || chapterData[0]?.title || "Untitled";
			const book = await apiClient.createAudiobook({
				title: bookTitle,
				author: author || undefined,
			});
			for (const ch of chapterData) {
				const baseUrl = useServerStore.getState().serverUrl;
				const form = new FormData();
				form.append("title", ch.title);
				form.append("text", ch.text);
				const res = await fetch(`${baseUrl}/audiobooks/${book.id}/chapters`, {
					method: "POST",
					body: form,
				});
				if (!res.ok) {
					throw new Error(
						`Failed to create chapter "${ch.title}": ${res.status}`,
					);
				}
			}
			useAudiobookStore.getState().setSelectedId(book.id);
			setStep("done");
			onImported();
			window.setTimeout(reset, 1500);
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	};

	if (step === "done") {
		return (
			<div className="mb-3 rounded-md border border-success/40 bg-success-soft p-3">
				<p className="flex items-center gap-2 text-sm text-success-text">
					<CheckCircleIcon className="h-4 w-4" aria-hidden="true" />
					Imported successfully
				</p>
			</div>
		);
	}

	if (step === "preview" && preview) {
		return (
			<div className="mb-3 flex flex-col gap-3 rounded-md border border-border bg-card p-3">
				<p className="flex items-center justify-between">
					<span className="text-sm font-medium text-foreground">
						Import preview
					</span>
					<button
						type="button"
						onClick={reset}
						className="text-xs text-muted-foreground transition-colors hover:text-foreground"
					>
						Cancel
					</button>
				</p>
				<Field label="Title" htmlFor="import-title">
					<Input
						id="import-title"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
					/>
				</Field>
				<Field label="Author (optional)" htmlFor="import-author">
					<Input
						id="import-author"
						value={author}
						onChange={(e) => setAuthor(e.target.value)}
					/>
				</Field>
				<p className="flex gap-3 text-xs tabular-nums text-muted-foreground">
					<span>{preview.chapters.length} chapters</span>
					<span>{totalWords.toLocaleString()} words</span>
					<span>~{estMinutes} min speech</span>
					{preview.has_cover ? <span>Cover detected</span> : null}
				</p>
				<ul className="max-h-[240px] space-y-1 overflow-y-auto">
					{preview.chapters.map((ch) => {
						const open = expanded === ch.index;
						return (
							<li
								key={ch.index}
								className="rounded-sm border border-border px-2 py-1 text-xs"
							>
								<button
									type="button"
									aria-expanded={open}
									onClick={() => setExpanded(open ? null : ch.index)}
									className="flex w-full items-center gap-2 rounded-sm px-1 py-0.5 text-left transition-colors hover:bg-secondary"
								>
									<DocumentTextIcon
										className="h-3 w-3 shrink-0 text-muted-foreground"
										aria-hidden="true"
									/>
									<span className="flex-1 truncate font-medium text-foreground">
										{ch.title}
									</span>
									<span className="shrink-0 tabular-nums text-muted-foreground">
										{ch.word_count.toLocaleString()} w
									</span>
									{open ? (
										<ChevronUpIcon
											className="h-3 w-3 shrink-0"
											aria-hidden="true"
										/>
									) : (
										<ChevronDownIcon
											className="h-3 w-3 shrink-0"
											aria-hidden="true"
										/>
									)}
								</button>
								{open && ch.preview ? (
									<p className="mt-1 px-4 leading-relaxed text-muted-foreground">
										{ch.preview}
										{(ch.word_count > 200 || ch.preview.length >= 200) && "…"}
									</p>
								) : null}
							</li>
						);
					})}
				</ul>
				{error ? (
					<p role="alert" className="text-xs text-destructive">
						{error}
					</p>
				) : null}
				<Button
					size="sm"
					onClick={confirm}
					disabled={busy}
					loading={busy}
					className="w-full"
				>
					{busy ? "Importing…" : `Import ${preview.chapters.length} chapters`}
				</Button>
			</div>
		);
	}

	return (
		<div className="mb-3 flex flex-col gap-2 rounded-md border border-border bg-card p-3">
			<p className="text-sm font-medium text-foreground">Import audiobook</p>
			<Field label="Title override (optional)" htmlFor="import-title-override">
				<Input
					id="import-title-override"
					value={title}
					onChange={(e) => setTitle(e.target.value)}
				/>
			</Field>
			<Field label="Author (optional)" htmlFor="import-author-override">
				<Input
					id="import-author-override"
					value={author}
					onChange={(e) => setAuthor(e.target.value)}
				/>
			</Field>
			<div className="flex gap-1 rounded-md border border-border bg-secondary/50 p-0.5">
				<button
					type="button"
					onClick={() => setImportMode("file")}
					className={cn(
						"flex-1 rounded-sm px-2 py-1 text-xs font-medium transition-colors",
						importMode === "file"
							? "bg-card text-foreground shadow-sm"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					Upload File
				</button>
				<button
					type="button"
					onClick={() => setImportMode("paste")}
					className={cn(
						"flex-1 rounded-sm px-2 py-1 text-xs font-medium transition-colors",
						importMode === "paste"
							? "bg-card text-foreground shadow-sm"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					Paste Script
				</button>
			</div>
			{importMode === "file" ? (
				<>
					<label
						className={cn(
							"block rounded-md border-2 border-dashed transition-colors",
							dragOver ? "border-accent bg-accent/5" : "border-transparent",
						)}
						onDrop={(e) => {
							e.preventDefault();
							setDragOver(false);
							const f = e.dataTransfer.files[0];
							if (f) {
								void pick(f);
							}
						}}
						onDragOver={(e) => {
							e.preventDefault();
							setDragOver(true);
						}}
						onDragLeave={(e) => {
							e.preventDefault();
							setDragOver(false);
						}}
					>
						<span className="sr-only">Book file (EPUB or PDF)</span>
						<input
							type="file"
							accept=".pdf,.epub"
							disabled={busy}
							onChange={(e) => void pick(e.target.files?.[0])}
							className="block w-full text-sm text-muted-foreground file:mr-2 file:rounded-sm file:border file:border-border file:bg-secondary file:px-2 file:py-1 file:text-xs file:text-foreground"
						/>
						{dragOver ? (
							<p className="pb-2 text-center text-xs font-medium text-accent">
								Drop EPUB or PDF file
							</p>
						) : null}
					</label>
					<p className="text-xs text-muted-foreground">
						Preview chapters before importing. Parsing runs offline.
					</p>
				</>
			) : (
				<>
					<Textarea
						placeholder={
							"Paste your script text here.\n\nUse double line breaks to separate chapters, or prefix chapter titles with # or Chapter N:"
						}
						value={pasteText}
						onChange={(e) => setPasteText(e.target.value)}
						rows={6}
						className="min-h-[120px] resize-y text-sm"
					/>
					<p className="text-xs text-muted-foreground">
						{pasteText
							? `~${Math.round(pasteText.split(/\s+/).filter(Boolean).length / 150)} min speech`
							: "Separate chapters with blank lines or # headings"}
					</p>
					<Button
						size="sm"
						onClick={importPastedText}
						disabled={busy || !pasteText.trim()}
						loading={busy}
						className="w-full"
					>
						{busy ? "Importing…" : "Import from text"}
					</Button>
				</>
			)}
			{busy ? (
				<p className="flex items-center gap-2 text-xs text-muted-foreground">
					<Spinner className="h-3 w-3" aria-hidden="true" />
					Parsing file…
				</p>
			) : null}
			{error ? (
				<p role="alert" className="text-xs text-destructive">
					{error}
				</p>
			) : null}
		</div>
	);
}

function splitChapters(text: string): Array<{ title: string; text: string }> {
	const lines = text.split("\n");
	const chapters: Array<{ title: string; text: string }> = [];
	let current: { title: string; text: string } | null = null;

	for (const line of lines) {
		const headingMatch = line.match(/^#{1,3}\s+(?:Chapter\s+\d+[:\s].*|.+)$/i);
		const chapterMatch = line.match(/^Chapter\s+(\d+)[:\s]*(.*)/i);

		if (headingMatch || chapterMatch) {
			if (current) {
				chapters.push(current);
			}
			const title = chapterMatch
				? `Chapter ${chapterMatch[1]}${chapterMatch[2] ? `: ${chapterMatch[2].trim()}` : ""}`
				: line.replace(/^#{1,3}\s+/, "").trim();
			current = { title, text: "" };
		} else {
			if (!current) {
				current = { title: "Introduction", text: "" };
			}
			current.text += (current.text ? "\n" : "") + line;
		}
	}
	if (current) {
		chapters.push(current);
	}

	if (chapters.length <= 1 && text.trim()) {
		const words = text.trim().split(/\s+/);
		const chunkSize = 3000;
		if (words.length > chunkSize) {
			const result: Array<{ title: string; text: string }> = [];
			for (let i = 0; i < words.length; i += chunkSize) {
				const chunk = words.slice(i, i + chunkSize).join(" ");
				result.push({
					title: `Part ${result.length + 1}`,
					text: chunk,
				});
			}
			return result;
		}
		return [{ title: "Full Text", text: text.trim() }];
	}

	return chapters.filter((ch) => ch.text.trim());
}
