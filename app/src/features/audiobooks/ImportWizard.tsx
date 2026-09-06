import {
	CheckCircleIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	DocumentTextIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import { useAudiobookStore } from "@/stores/audiobookStore";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/input";
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
			<p className="text-sm font-medium text-foreground">Import EPUB / PDF</p>
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
			<label className="block">
				<span className="sr-only">Book file (EPUB or PDF)</span>
				<input
					type="file"
					accept=".pdf,.epub"
					disabled={busy}
					onChange={(e) => void pick(e.target.files?.[0])}
					className="block w-full text-sm text-muted-foreground file:mr-2 file:rounded-sm file:border file:border-border file:bg-secondary file:px-2 file:py-1 file:text-xs file:text-foreground"
				/>
			</label>
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
			<p className="text-xs text-muted-foreground">
				Preview chapters before importing. Parsing runs offline.
			</p>
		</div>
	);
}
