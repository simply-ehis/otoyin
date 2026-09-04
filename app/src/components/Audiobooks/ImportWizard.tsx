import {
	CheckCircleIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	DocumentTextIcon as FileText,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/Spinner";
import { apiClient } from "@/lib/api/client";
import { useAudiobookStore } from "@/stores/audiobookStore";

type PreviewData = {
	title: string;
	has_cover: boolean;
	chapters: Array<{
		index: number;
		title: string;
		word_count: number;
		preview: string;
	}>;
};

type Step = "pick" | "preview" | "done";

export function ImportWizard({ onImported }: { onImported: () => void }) {
	const [step, setStep] = useState<Step>("pick");
	const [busy, setBusy] = useState(false);
	const [title, setTitle] = useState("");
	const [author, setAuthor] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<PreviewData | null>(null);
	const [expandedChapter, setExpandedChapter] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);

	const totalWords =
		preview?.chapters.reduce((sum, ch) => sum + ch.word_count, 0) ?? 0;
	const estMinutes = Math.round((totalWords / 150) * 60) / 60; // ~150 wpm speech rate

	function reset() {
		setStep("pick");
		setBusy(false);
		setTitle("");
		setAuthor("");
		setFile(null);
		setPreview(null);
		setExpandedChapter(null);
		setError(null);
	}

	async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
		const f = e.target.files?.[0];
		if (!f) {
			return;
		}
		e.target.value = "";
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
	}

	async function handleConfirm() {
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
			setTimeout(reset, 1500);
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	}

	// -- Done state --
	if (step === "done") {
		return (
			<div className="border rounded-lg p-3 mb-3 bg-card space-y-1">
				<div className="flex items-center gap-2 text-sm text-emerald-500">
					<CheckCircleIcon className="h-4 w-4" />
					Imported successfully
				</div>
			</div>
		);
	}

	// -- Preview state --
	if (step === "preview" && preview) {
		return (
			<div className="border rounded-lg p-3 mb-3 bg-card space-y-3">
				<div className="flex items-center justify-between">
					<div className="text-sm font-medium">Import Preview</div>
					<button
						type="button"
						onClick={reset}
						className="text-xs text-muted-foreground hover:text-foreground transition-colors"
					>
						Cancel
					</button>
				</div>

				{/* Editable title/author */}
				<input
					placeholder="Title"
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					className="w-full px-2 py-1 rounded border bg-background text-sm"
				/>
				<input
					placeholder="Author (optional)"
					value={author}
					onChange={(e) => setAuthor(e.target.value)}
					className="w-full px-2 py-1 rounded border bg-background text-sm"
				/>

				{/* Stats */}
				<div className="flex gap-3 text-xs text-muted-foreground">
					<span>{preview.chapters.length} chapters</span>
					<span>{totalWords.toLocaleString()} words</span>
					<span>~{estMinutes.toFixed(0)} min speech</span>
					{preview.has_cover && <span>Cover detected</span>}
				</div>

				{/* Chapter list */}
				<div className="max-h-[240px] overflow-y-auto space-y-1">
					{preview.chapters.map((ch) => {
						const isExpanded = expandedChapter === ch.index;
						return (
							<div key={ch.index} className="border rounded px-2 py-1 text-xs">
								<button
									type="button"
									onClick={() =>
										setExpandedChapter(isExpanded ? null : ch.index)
									}
									className="flex items-center gap-2 w-full text-left hover:bg-muted/50 rounded px-1 py-0.5 transition-colors"
								>
									<FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
									<span className="truncate flex-1">{ch.title}</span>
									<span className="text-muted-foreground shrink-0">
										{ch.word_count.toLocaleString()} w
									</span>
									{isExpanded ? (
										<ChevronUpIcon className="h-3 w-3 shrink-0" />
									) : (
										<ChevronDownIcon className="h-3 w-3 shrink-0" />
									)}
								</button>
								{isExpanded && ch.preview && (
									<div className="mt-1 px-4 text-muted-foreground leading-relaxed">
										{ch.preview}
										{(ch.word_count > 200 || ch.preview.length >= 200) && "…"}
									</div>
								)}
							</div>
						);
					})}
				</div>

				{error && <div className="text-xs text-destructive">{error}</div>}

				<Button
					size="sm"
					onClick={handleConfirm}
					disabled={busy}
					className="w-full"
				>
					{busy ? (
						<span className="flex items-center gap-2">
							<Spinner className="h-3 w-3" />
							Importing…
						</span>
					) : (
						`Import ${preview.chapters.length} Chapters`
					)}
				</Button>
			</div>
		);
	}

	// -- Pick state (initial) --
	return (
		<div className="border rounded-lg p-3 mb-3 bg-card space-y-2">
			<div className="text-sm font-medium">Import EPUB / PDF</div>
			<input
				placeholder="Title override (optional)"
				value={title}
				onChange={(e) => setTitle(e.target.value)}
				className="w-full px-2 py-1 rounded border bg-background text-sm"
			/>
			<input
				placeholder="Author (optional)"
				value={author}
				onChange={(e) => setAuthor(e.target.value)}
				className="w-full px-2 py-1 rounded border bg-background text-sm"
			/>
			<label className="block">
				<input
					type="file"
					accept=".pdf,.epub"
					onChange={handleFileSelect}
					disabled={busy}
					className="block w-full text-sm"
				/>
			</label>
			{busy && (
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<Spinner className="h-3 w-3" />
					Parsing file…
				</div>
			)}
			{error && <div className="text-xs text-destructive">{error}</div>}
			<div className="text-xs text-muted-foreground">
				Preview chapters before importing. PyMuPDF handles both formats offline.
			</div>
		</div>
	);
}
