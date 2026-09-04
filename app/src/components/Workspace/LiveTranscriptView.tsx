import {
	ClipboardIcon as Copy,
	MicrophoneIcon as Mic,
	TrashIcon as Trash2,
} from "@heroicons/react/24/outline";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Spinner } from "@/components/ui/Spinner";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import type { WhisperModelSize } from "@/lib/api/types";
import type { LanguageCode } from "@/lib/constants/languages";
import { ALL_LANGUAGES } from "@/lib/constants/languages";
import {
	ERR_DESC_CLIPBOARD_EMPTY,
	ERR_TITLE_CLIPBOARD,
} from "@/lib/errorMessages";
import { showStudioErrorToast } from "@/lib/errors";
import { useStreamingSTT } from "@/lib/hooks/useStreamingSTT";
import { cn } from "@/lib/utils/cn";

const MODEL_OPTIONS: { value: WhisperModelSize; label: string }[] = [
	{ value: "tiny.en", label: "Tiny EN (75MB)" },
	{ value: "base.en", label: "Base EN (142MB)" },
];

const LANG_OPTIONS = Object.entries(ALL_LANGUAGES).map(([code, name]) => ({
	value: code as LanguageCode,
	label: name,
}));

export function LiveTranscriptView() {
	const [model, setModel] = useState<WhisperModelSize>("tiny.en");
	const [lang, setLang] = useState<LanguageCode>("en");
	const [useLang, setUseLang] = useState(true);
	const transcriptRef = useRef<HTMLDivElement>(null);
	const { toast } = useToast();

	const stt = useStreamingSTT({
		modelId: model,
		language: useLang ? lang : undefined,
	});

	const handleStart = useCallback(async () => {
		try {
			await stt.start();
		} catch (err: unknown) {
			showStudioErrorToast(err);
		}
	}, [stt]);

	const handleStop = useCallback(async () => {
		await stt.stop();
	}, [stt]);

	const handleCopy = useCallback(() => {
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
	}, [stt.transcript, stt.segments, toast]);

	const handleClear = useCallback(() => {
		stt.stop();
	}, [stt]);

	return (
		<div className="flex flex-col h-full p-4 gap-4">
			<ScreenHeader
				title="Live Transcript"
				actions={
					<>
						<Select
							value={model}
							onValueChange={(v) => setModel(v as WhisperModelSize)}
						>
							<SelectTrigger className="h-8 w-28 text-xs" title="STT model">
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
							<SelectTrigger className="h-8 w-32 text-xs" title="Language">
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
						<div className="ml-auto flex items-center gap-2">
							<Button
								size="sm"
								variant={stt.isListening ? "destructive" : "default"}
								onClick={stt.isListening ? handleStop : handleStart}
								disabled={false}
								title={stt.isListening ? "Stop recording" : "Start recording"}
								aria-label={
									stt.isListening ? "Stop recording" : "Start recording"
								}
							>
								{stt.isListening ? (
									<Spinner size="sm" className="mr-1" />
								) : (
									<Mic className="h-3.5 w-3.5 mr-1" />
								)}
								{stt.isListening ? "Stop" : "Record"}
							</Button>
							<Button
								size="sm"
								variant="outline"
								onClick={handleCopy}
								title="Copy transcript"
								aria-label="Copy transcript"
							>
								<Copy className="h-3.5 w-3.5" />
							</Button>
							<Button
								size="sm"
								variant="outline"
								onClick={handleClear}
								title="Clear transcript"
								aria-label="Clear transcript"
							>
								<Trash2 className="h-3.5 w-3.5" />
							</Button>
						</div>
					</>
				}
			/>

			{stt.error && (
				<div className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">
					{stt.error}
				</div>
			)}

			<div
				ref={transcriptRef}
				className="flex-1 overflow-y-auto rounded-lg border border-border bg-card p-4 min-h-0"
			>
				{stt.segments.length === 0 && !stt.transcript && (
					<EmptyState
						icon={<Mic />}
						title={
							stt.isListening
								? "Listening…"
								: "Press Record to start transcribing"
						}
						className="mt-8 border-0 bg-transparent"
					/>
				)}

				{stt.segments
					.map((seg, i) => ({ seg, k: i }))
					.map(({ seg, k }) => (
						<p key={k} className="text-sm leading-relaxed mb-1">
							<span className="text-muted-foreground text-xs mr-2 tabular-nums">
								{Math.round(seg.start_ms / 1000)}s
							</span>
							{seg.text}
						</p>
					))}

				{stt.transcript && (
					<p
						className={cn(
							"text-sm leading-relaxed",
							stt.isListening ? "text-foreground" : "text-muted-foreground",
						)}
					>
						<span className="text-muted-foreground text-xs mr-2 tabular-nums animate-pulse">
							{stt.isListening ? "?" : ""}
						</span>
						{stt.transcript}
					</p>
				)}
			</div>
		</div>
	);
}
