import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Badge, Separator, Spinner } from "@/ui/primitives";
import { EmptyState, LoadingState, ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";

interface Word {
	index: number;
	word: string;
	start_ms: number;
	end_ms: number;
	confidence: number;
}

const FILLERS = new Set([
	"um",
	"uh",
	"er",
	"ah",
	"like",
	"you",
	"know",
	"i",
	"mean",
	"well",
	"so",
	"actually",
	"basically",
]);

function isFiller(word: string) {
	const clean = word.toLowerCase().replace(/[^a-z']/g, "");
	return FILLERS.has(clean);
}

export function TranscriptEditView() {
	const { toast } = useToast();
	const [generationId, setGenerationId] = useState("");
	const [activeId, setActiveId] = useState<string | null>(null);
	const [words, setWords] = useState<Word[]>([]);
	const [selected, setSelected] = useState<Set<number>>(new Set());
	const [playheadMs, setPlayheadMs] = useState<number | null>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	useEffect(() => {
		return () => {
			if (audioRef.current) {
				audioRef.current.pause();
			}
		};
	}, []);

	const loadMut = useMutation({
		mutationFn: (id: string) => apiClient.getWordTimestamps(id),
		onSuccess: (data, id) => {
			setWords(data.words);
			setSelected(new Set());
			setPlayheadMs(null);
			setActiveId(id);
		},
		onError: (err: unknown) => showStudioErrorToast(err),
	});

	const deleteMut = useMutation({
		mutationFn: () => {
			if (!activeId) {
				throw new Error("Load a transcript first");
			}
			return apiClient.deleteWords(activeId, [...selected]);
		},
		onSuccess: (res) => {
			toast({ title: "Words removed — new take created" });
			setGenerationId(res.new_generation_id);
			setActiveId(res.new_generation_id);
			setSelected(new Set());
			setPlayheadMs(null);
			loadMut.mutate(res.new_generation_id);
		},
		onError: (err: unknown) => showStudioErrorToast(err),
	});

	function playFrom(ms: number) {
		if (!activeId) {
			return;
		}
		const el = audioRef.current;
		if (!el) {
			return;
		}
		if (el.src !== apiClient.getAudioUrl(activeId)) {
			el.src = apiClient.getAudioUrl(activeId);
		}
		el.currentTime = ms / 1000;
		el.play().catch((err: unknown) => showStudioErrorToast(err));
	}

	async function clickWord(w: Word) {
		if (!activeId) {
			return;
		}
		try {
			const res = await apiClient.clickWord(activeId, {
				index: w.index,
				word: w.word,
				start_ms: w.start_ms,
				end_ms: w.end_ms,
			});
			setPlayheadMs(res.playhead_ms);
			playFrom(res.playhead_ms);
		} catch (err) {
			showStudioErrorToast(err);
		}
	}

	function toggleSelect(index: number) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(index)) {
				next.delete(index);
			} else {
				next.add(index);
			}
			return next;
		});
	}

	function selectFillers() {
		setSelected(
			new Set(words.filter((w) => isFiller(w.word)).map((w) => w.index)),
		);
	}

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader
				title="Transcript Edit"
				description="Click any word to play from it — select words to cut them"
			/>

			<div className="flex max-w-xl items-center gap-2">
				<Input
					placeholder="Generation ID"
					value={generationId}
					onChange={(e) => setGenerationId(e.target.value)}
					className="h-8 flex-1 font-mono text-xs"
					aria-label="Generation ID"
					onKeyDown={(e) => {
						if (e.key === "Enter" && generationId.trim()) {
							loadMut.mutate(generationId.trim());
						}
					}}
				/>
				<Button
					type="button"
					size="sm"
					className="h-8 text-xs"
					disabled={!generationId.trim() || loadMut.isPending}
					onClick={() => loadMut.mutate(generationId.trim())}
				>
					{loadMut.isPending ? <Spinner size="xs" className="mr-1" /> : null}
					Load
				</Button>
			</div>

			<Separator />

			{loadMut.isPending && words.length === 0 ? (
				<LoadingState label="Loading transcript" />
			) : words.length === 0 ? (
				<EmptyState
					title="No transcript loaded"
					body="Enter a generation ID above. Generate audio first, then edit its words here."
				/>
			) : (
				<>
					<div className="flex flex-wrap items-center gap-2">
						<Badge tone="neutral">
							{words.length} words
							{playheadMs !== null
								? ` · playhead ${(playheadMs / 1000).toFixed(1)}s`
								: ""}
						</Badge>
						<span className="flex-1" />
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="h-7 text-xs"
							title="Select filler words (um, uh, like…)"
							aria-label="Select filler words"
							onClick={selectFillers}
						>
							Select fillers
						</Button>
						{selected.size > 0 ? (
							<Button
								type="button"
								size="sm"
								variant="ghost"
								className="h-7 text-xs"
								onClick={() => setSelected(new Set())}
							>
								Clear ({selected.size})
							</Button>
						) : null}
						<Button
							type="button"
							size="sm"
							variant="destructive"
							className="h-7 text-xs"
							disabled={selected.size === 0 || deleteMut.isPending}
							title="Cut the selected words and render a new take"
							aria-label={`Cut ${selected.size} selected words`}
							onClick={() => deleteMut.mutate()}
						>
							{deleteMut.isPending ? (
								<Spinner size="xs" className="mr-1" />
							) : null}
							Cut{" "}
							{selected.size > 0
								? `${selected.size} word${selected.size === 1 ? "" : "s"}`
								: "words"}
						</Button>
					</div>

					<div className="rounded-md border border-border bg-card p-4">
						<p className="text-sm leading-loose">
							{words.map((w) => {
								const isSel = selected.has(w.index);
								const lowConf = w.confidence < 0.5;
								return (
									<span key={w.index} className="mr-1 inline-block">
										<button
											type="button"
											aria-pressed={isSel}
											className={cn(
												"rounded-sm px-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
												isSel
													? "bg-destructive text-destructive-foreground line-through"
													: "text-foreground hover:bg-accent-muted",
												lowConf && !isSel && "underline decoration-dotted",
											)}
											title={`${w.word} · ${(w.start_ms / 1000).toFixed(1)}s · confidence ${(w.confidence * 100).toFixed(0)}% — click to play, shift-click to select`}
											aria-label={`${w.word}, ${isSel ? "selected for cutting" : "click to play from here"}`}
											onClick={(e) => {
												if (e.shiftKey) {
													toggleSelect(w.index);
												} else {
													void clickWord(w);
												}
											}}
										>
											{w.word}
										</button>
									</span>
								);
							})}
						</p>
						<p className="mt-2 text-xs text-muted-foreground">
							Click a word to play from it · Shift-click to mark for cutting ·
							dotted words are low-confidence
						</p>
					</div>
				</>
			)}

			{/* biome-ignore lint/a11y/useMediaCaption: word-level playback element */}
			<audio ref={audioRef} className="hidden" />
		</div>
	);
}
