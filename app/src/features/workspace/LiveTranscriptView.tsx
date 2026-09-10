import { useState } from "react";
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
	{ value: "cloud", label: "Cloud (BYOK)" },
];

const LANG_OPTIONS = Object.entries(ALL_LANGUAGES).map(([code, name]) => ({
	value: code as LanguageCode,
	label: name,
}));

export function LiveTranscriptView() {
	const [model, setModel] = useState<WhisperModelSize>("tiny.en");
	const [lang, setLang] = useState<LanguageCode>("en");
	const [useLang, setUseLang] = useState(true);
	const { toast } = useToast();

	const stt = useStreamingSTT({
		modelId: model,
		language: useLang ? lang : undefined,
	});

	async function handleStart() {
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
							value={model}
							onValueChange={(v) => setModel(v as WhisperModelSize)}
						>
							<SelectTrigger
								className="h-8 w-36 text-xs"
								aria-label="STT model"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{MODEL_OPTIONS.map((m) => (
									<SelectItem key={m.value} value={m.value}>
										{m.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
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
