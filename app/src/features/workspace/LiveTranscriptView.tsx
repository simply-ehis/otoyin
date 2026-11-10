import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { WhisperModelSize } from "@/lib/api/types";
import type { LanguageCode } from "@/lib/constants/languages";
import { ALL_LANGUAGES } from "@/lib/constants/languages";
import {
	ERR_DESC_CLIPBOARD_EMPTY,
	ERR_TITLE_CLIPBOARD,
} from "@/lib/errorMessages";
import { showStudioErrorToast } from "@/lib/errors";
import { useStreamingSTT } from "@/lib/hooks/useStreamingSTT";
import { Button } from "@/ui/button";
import { Spinner } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { EmptyState, ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";

const MODEL_OPTIONS: { value: WhisperModelSize; label: string }[] = [
	{ value: "tiny.en", label: "Tiny EN (75MB)" },
	{ value: "base.en", label: "Base EN (142MB)" },
	{ value: "moonshine-tiny", label: "Moonshine Tiny (35MB)" },
	{ value: "moonshine-base", label: "Moonshine Base (74MB)" },
	{
		value: "moonshine-streaming-small",
		label: "Moonshine Streaming Small (189MB)",
	},
	{ value: "cloud", label: "Cloud (BYOK)" },
];

const LANG_OPTIONS = Object.entries(ALL_LANGUAGES).map(([code, name]) => ({
	value: code as LanguageCode,
	label: name,
}));

export function LiveTranscriptView() {
	const [model, setModel] = useState<WhisperModelSize | undefined>(undefined);
	const [lang, setLang] = useState<LanguageCode>("en");
	const [useLang, setUseLang] = useState(true);
	const { toast } = useToast();

	// STT model install state, shared with the Store. Cloud (BYOK) has no Store
	// artifact, so it is always treated as available.
	const sttModelsQuery = useQuery({
		queryKey: ["modelStatus"],
		queryFn: () => apiClient.getModelStatus(),
		staleTime: 30_000,
	});
	const sttModels = sttModelsQuery.data?.models ?? [];
	const sttInstalled = (id: string) => {
		if (id === "cloud") return true;
		return !!sttModels.find(
			(m) => m.engine === "whisper" && m.model_size === id,
		)?.downloaded;
	};
	const sttDownloading = (id: string) =>
		!!sttModels.find((m) => m.engine === "whisper" && m.model_size === id)
			?.downloading;

	const stt = useStreamingSTT({
		modelId: model,
		language: useLang ? lang : undefined,
	});

	async function handleStart() {
		if (!model) {
			toast({
				title: "No STT model selected",
				description: "Please select an STT model before recording.",
				variant: "destructive",
			});
			return;
		}
		try {
			await stt.start();
		} catch (err: unknown) {
			showStudioErrorToast(err);
		}
	}

	async function handleStop() {
		await stt.stop();
	}

	function handleCopy() {
		const text = stt.transcript || stt.segments.map((s) => s.text).join(" ");
		if (!text) {
			return;
		}
		navigator.clipboard
			.writeText(text)
			.then(() => {
				toast({ title: "Transcript copied" });
			})
			.catch(() => {
				toast({
					title: ERR_TITLE_CLIPBOARD,
					description: ERR_DESC_CLIPBOARD_EMPTY,
					variant: "destructive",
				});
			});
	}

	return (
		<div className="flex h-full min-h-0 flex-col gap-4 p-4 overflow-hidden">
			<ScreenHeader
				title="Live Transcript"
				actions={
					<div className="flex flex-wrap items-center gap-2">
						<Select
							value={model ?? ""}
							onValueChange={(v) => setModel(v as WhisperModelSize)}
							disabled={model && sttDownloading(model)}
						>
							<SelectTrigger
								className="h-8 w-36 text-xs"
								aria-label="STT model"
							>
								<SelectValue>{model ?? "Select a model"}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{MODEL_OPTIONS.map((m) => {
									const installed = sttInstalled(m.value);
									const downloading = sttDownloading(m.value);
									return (
										<SelectItem
											key={m.value}
											value={m.value}
											disabled={!installed && !downloading}
										>
											{m.label}
											{!installed && !downloading ? " — not installed" : ""}
										</SelectItem>
									);
								})}
							</SelectContent>
						</Select>
						{model && !sttInstalled(model) && (
							<div className="flex items-center gap-2 text-xs">
								<span className="text-muted-foreground">
									Model not installed
								</span>
								<Link
									to="/store"
									className="rounded-sm underline transition-colors hover:text-foreground hover:underline"
								>
									Get from Store
								</Link>
							</div>
						)}
						<Select
							value={useLang ? lang : "_auto"}
							onValueChange={(v) => {
								if (v === "_auto") {
									setUseLang(false);
								} else {
									setUseLang(true);
									setLang(v as LanguageCode);
								}
							}}
						>
							<SelectTrigger className="h-8 w-36 text-xs" aria-label="Language">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="_auto">Auto-detect</SelectItem>
								{LANG_OPTIONS.map((l) => (
									<SelectItem key={l.value} value={l.value}>
										{l.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Button
							type="button"
							size="sm"
							variant={stt.isListening ? "destructive" : "default"}
							title={stt.isListening ? "Stop recording" : "Start recording"}
							aria-label={
								stt.isListening ? "Stop recording" : "Start recording"
							}
							aria-pressed={stt.isListening}
							onClick={() =>
								void (stt.isListening ? handleStop() : handleStart())
							}
						>
							{stt.isListening ? <Spinner size="xs" className="mr-1" /> : null}
							{stt.isListening ? "Stop" : "Record"}
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={!stt.transcript && stt.segments.length === 0}
							title="Copy transcript"
							aria-label="Copy transcript"
							onClick={handleCopy}
						>
							Copy
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={!stt.isListening && stt.segments.length === 0}
							title="Clear transcript"
							aria-label="Clear transcript"
							onClick={() => void stt.stop()}
						>
							Clear
						</Button>
					</div>
				}
			/>

			{stt.error ? (
				<p
					role="alert"
					className="rounded-md border border-destructive bg-danger-soft px-3 py-2 text-xs text-danger-text"
				>
					{stt.error}
				</p>
			) : null}

			<div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-card p-4">
				{stt.segments.length === 0 && !stt.transcript ? (
					<EmptyState
						title={stt.isListening ? "Listening…" : "Press Record to start"}
						body="Speech appears here with timestamps as you talk."
					/>
				) : null}

				{stt.segments.map((seg, i) => (
					<p
						// biome-ignore lint/suspicious/noArrayIndexKey: streaming segments are append-only
						key={`seg-${i}`}
						className="mb-1 text-sm leading-relaxed"
					>
						<span className="mr-2 text-xs tabular-nums text-muted-foreground">
							{Math.round(seg.start_ms / 1000)}s
						</span>
						{seg.text}
					</p>
				))}

				{stt.transcript ? (
					<p className="text-sm leading-relaxed text-foreground">
						{stt.isListening ? (
							<span
								aria-hidden="true"
								className="mr-2 inline-block size-1.5 animate-pulse rounded-full bg-accent"
							/>
						) : null}
						{stt.transcript}
					</p>
				) : null}
			</div>
		</div>
	);
}
