import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { DiarizationResponse } from "@/lib/api/clientDiarize";
import {
	ERR_DESC_ADR_FAILED,
	ERR_TITLE_ADR,
	ERR_TITLE_VALIDATION,
} from "@/lib/errorMessages";
import { showStudioErrorToast } from "@/lib/errors";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Badge, Label, Separator, Spinner } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { LoadingState, ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";
import { hueText } from "./hueIdentity";
import { UploadField } from "./UploadField";

// Hue lives in the text only — solid surfaces everywhere (design tokens).
// Canonical hue-identity slots from hueIdentity.ts (the documented pattern).
const SPEAKER_TEXT = Array.from({ length: 6 }, (_, i) => hueText(i));

function speakerText(speaker: string): string {
	const idx = Number.parseInt(speaker.replace("SPEAKER_", ""), 10) || 0;
	return SPEAKER_TEXT[idx % SPEAKER_TEXT.length] ?? "text-foreground";
}

function formatTime(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds - m * 60;
	return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

export function DiarizationView() {
	const { toast } = useToast();
	const navigate = useNavigate();
	const [file, setFile] = useState<File | null>(null);
	const [numSpeakers, setNumSpeakers] = useState(0);
	const [result, setResult] = useState<DiarizationResponse | null>(null);

	const diarizeMut = useMutation({
		mutationFn: async (target: File) => {
			return apiClient.diarizeAudio(target, {
				numSpeakers: numSpeakers > 0 ? numSpeakers : undefined,
			});
		},
		onSuccess: (data: DiarizationResponse) => {
			setResult(data);
			toast({ title: "Diarization complete" });
		},
		onError: (err: unknown) => showStudioErrorToast(err),
	});

	const sendToAdrMut = useMutation({
		mutationFn: async () => {
			if (!result) {
				throw new Error("No diarization result");
			}
			const lines = result.segments.map((seg, i) => ({
				line_id: `diarized-${i}`,
				original_text: seg.text,
				character: seg.speaker,
				target_duration_ms: Math.round((seg.end - seg.start) * 1000),
			}));
			const sessionName = file
				? `Diarization: ${file.name}`
				: `Diarization: ${new Date().toLocaleString()}`;
			return apiClient.createADRSession(sessionName, lines);
		},
		onSuccess: (data: { id: string }) => {
			toast({ title: "ADR session created from diarization" });
			void navigate({
				to: "/workspace/adr",
				search: { session: data.id },
			});
		},
		onError: () =>
			toast({
				title: ERR_TITLE_ADR,
				description: ERR_DESC_ADR_FAILED,
				variant: "destructive",
			}),
	});

	function handleFile(f: File) {
		setFile(f);
		setResult(null);
	}

	function handleDiarize() {
		if (!file) {
			toast({
				title: ERR_TITLE_VALIDATION,
				description: "Select a recording first",
				variant: "destructive",
			});
			return;
		}
		diarizeMut.mutate(file);
	}

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader title="Diarization" />

			<Separator />

			<UploadField
				id="diar-upload"
				label="Select Audio"
				fileName={
					file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : ""
				}
				uploading={diarizeMut.isPending}
				onFile={handleFile}
			/>

			<div className="flex max-w-xl flex-wrap items-center gap-2">
				<Label htmlFor="diar-speakers">Speakers</Label>
				<Select
					value={String(numSpeakers)}
					onValueChange={(v) => setNumSpeakers(Number(v))}
				>
					<SelectTrigger
						id="diar-speakers"
						className="h-8 w-36 text-xs"
						title="Known speaker count (auto-detect by default)"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="0">Auto-detect</SelectItem>
						{[1, 2, 3, 4, 5, 6].map((n) => (
							<SelectItem key={n} value={String(n)}>
								{n}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<span className="text-xs text-muted-foreground">
					Leave on auto-detect to let the model pick the count.
				</span>
			</div>

			<div>
				<Button
					type="button"
					size="sm"
					disabled={!file || diarizeMut.isPending}
					title="Run speaker diarization"
					aria-label="Run speaker diarization"
					onClick={handleDiarize}
				>
					{diarizeMut.isPending ? <Spinner size="xs" className="mr-1" /> : null}
					{diarizeMut.isPending ? "Diarizing…" : "Run Diarization"}
				</Button>
			</div>

			{diarizeMut.isPending ? <LoadingState label="Diarizing audio" /> : null}

			{result ? (
				<div className="space-y-3">
					<div className="flex flex-wrap items-center gap-2">
						{result.diarized ? (
							result.speakers.map((s) => (
								<Badge
									key={s}
									tone="neutral"
									className={cn("font-semibold", speakerText(s))}
								>
									{s}
								</Badge>
							))
						) : (
							<Badge tone="neutral">Single speaker detected</Badge>
						)}
						<span className="text-xs tabular-nums text-muted-foreground">
							{result.duration.toFixed(1)}s · {result.segments.length} segments
						</span>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="ml-auto h-7 text-xs"
							disabled={sendToAdrMut.isPending}
							title="Create ADR session from diarized segments"
							aria-label="Send diarization to ADR"
							onClick={() => sendToAdrMut.mutate()}
						>
							{sendToAdrMut.isPending ? (
								<Spinner size="xs" className="mr-1" />
							) : (
								<ArrowRightIcon className="mr-1 size-3" aria-hidden="true" />
							)}
							Send to ADR
						</Button>
					</div>

					<ul className="divide-y divide-border rounded-md border border-border bg-card">
						{result.segments.map((seg, i) => (
							<li
								// biome-ignore lint/suspicious/noArrayIndexKey: diarized segments are static display items
								key={`seg-${i}`}
								className="flex items-start gap-3 p-3"
							>
								<Badge
									tone="neutral"
									className={cn(
										"mt-0.5 min-w-22 shrink-0 justify-center font-semibold",
										speakerText(seg.speaker),
									)}
								>
									{seg.speaker}
								</Badge>
								<div className="min-w-0 flex-1">
									<p className="text-sm text-foreground">{seg.text}</p>
									<p className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
										{formatTime(seg.start)} · {formatTime(seg.end)}
									</p>
								</div>
							</li>
						))}
					</ul>
				</div>
			) : null}
		</div>
	);
}
