import {
	PlayIcon,
	ArrowRightIcon as SendTo,
	ArrowUpTrayIcon as Upload,
	UsersIcon,
} from "@heroicons/react/24/outline";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Spinner } from "@/components/ui/Spinner";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import type { DiarizationResponse } from "@/lib/api/clientDiarize";
import {
	ERR_DESC_ADR_FAILED,
	ERR_TITLE_ADR,
	ERR_TITLE_VALIDATION,
} from "@/lib/errorMessages";
import { showStudioErrorToast } from "@/lib/errors";
import { cn } from "@/lib/utils/cn";

const SPEAKER_COLORS = [
	"text-sky-400 bg-sky-400/10 border-sky-400/30",
	"text-amber-400 bg-amber-400/10 border-amber-400/30",
	"text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
	"text-fuchsia-400 bg-fuchsia-400/10 border-fuchsia-400/30",
	"text-rose-400 bg-rose-400/10 border-rose-400/30",
	"text-cyan-400 bg-cyan-400/10 border-cyan-400/30",
];

function speakerColor(speaker: string): string {
	const idx = parseInt(speaker.replace("SPEAKER_", ""), 10) || 0;
	return SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
}

function formatTime(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = seconds - m * 60;
	return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

export function DiarizationView() {
	const { toast } = useToast();
	const navigate = useNavigate();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [file, setFile] = useState<File | null>(null);
	const [numSpeakers, setNumSpeakers] = useState<number>(0);
	const [result, setResult] = useState<DiarizationResponse | null>(null);

	const diarizeMut = useMutation({
		mutationFn: async () => {
			if (!file) {
				throw new Error("No audio file selected");
			}
			return apiClient.diarizeAudio(file, {
				numSpeakers: numSpeakers > 0 ? numSpeakers : undefined,
			});
		},
	});

	// Group diarized segments into ADR lines (one line per speaker-segment)
	const sendToAdrMut = useMutation({
		mutationFn: async () => {
			if (!result) {
				return;
			}

			// Build ADR lines: each diarized segment becomes one line
			const lines = result.segments.map((seg, i) => ({
				line_id: `diarized-${i}`,
				original_text: seg.text,
				character: seg.speaker,
				target_duration_ms: Math.round((seg.end - seg.start) * 1000),
			}));

			const sessionName = file
				? `Diarization: ${file.name}`
				: `Diarization: ${new Date().toLocaleString()}`;

			const session = await apiClient.createADRSession(sessionName, lines);
			return session;
		},
		onSuccess: (data: { id: string }) => {
			toast({ title: "ADR session created from diarization" });
			navigate({
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

	function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
		const f = e.target.files?.[0];
		if (f) {
			setFile(f);
			setResult(null);
		}
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
		diarizeMut.mutate(undefined, {
			onSuccess: (data: DiarizationResponse) => {
				setResult(data);
				toast({ title: "Diarization complete" });
			},
			onError: (err: unknown) => showStudioErrorToast(err),
		});
	}

	return (
		<div className="flex flex-col h-full p-4 gap-4 overflow-y-auto">
			<ScreenHeader
				icon={<UsersIcon className="size-5" />}
				title="Diarization"
				description="Auto-detect speakers in audio (podcast / interview / multi-voice clips)"
			/>

			<Separator />

			{/* File selection */}
			<div className="flex items-center gap-3">
				<Button
					variant="outline"
					size="sm"
					onClick={() => fileInputRef.current?.click()}
					title="Select an audio file"
					aria-label="Select an audio file"
				>
					<Upload className="h-3.5 w-3.5 mr-1.5" />
					Select Audio
				</Button>
				<input
					ref={fileInputRef}
					type="file"
					accept="audio/*"
					className="hidden"
					onChange={handleFileSelect}
				/>
				{file && (
					<Badge variant="secondary" className="text-xs">
						{file.name} ({Math.round(file.size / 1024)} KB)
					</Badge>
				)}
			</div>

			{/* Options */}
			<div className="flex items-center gap-3">
				<Label htmlFor="num-speakers" className="text-xs shrink-0">
					Speakers
				</Label>
				<select
					id="num-speakers"
					value={numSpeakers}
					onChange={(e) => setNumSpeakers(Number(e.target.value))}
					className="rounded-md border border-border bg-background px-2 py-1 text-xs"
					title="Known speaker count (0 = auto-detect)"
					aria-label="Known speaker count"
				>
					<option value={0}>Auto-detect</option>
					{Array.from({ length: 6 }, (_, i) => i + 1).map((n) => (
						<option key={n} value={n}>
							{n}
						</option>
					))}
				</select>
				<p className="text-xs text-muted-foreground/60">
					Leave on Auto-detect to let the model pick the count
				</p>
			</div>

			{/* Run */}
			<Button
				size="sm"
				disabled={!file || diarizeMut.isPending}
				onClick={handleDiarize}
				className="self-start"
				title="Run speaker diarization"
				aria-label="Run speaker diarization"
			>
				{diarizeMut.isPending ? (
					<Spinner size="sm" className="mr-1.5" />
				) : (
					<PlayIcon className="h-3.5 w-3.5 mr-1.5" />
				)}
				{diarizeMut.isPending ? "Diarizing…" : "Run Diarization"}
			</Button>

			{/* Result */}
			{result && (
				<div className="space-y-3">
					<div className="flex items-center gap-2 flex-wrap">
						{result.diarized ? (
							result.speakers.map((s) => (
								<Badge key={s} className={cn("text-xs", speakerColor(s))}>
									{s}
								</Badge>
							))
						) : (
							<Badge variant="secondary" className="text-xs">
								Single speaker detected
							</Badge>
						)}
						<span className="text-xs text-muted-foreground/60">
							{result.duration.toFixed(1)}s · {result.segments.length} segments
						</span>
						<Button
							variant="outline"
							size="sm"
							className="h-7 text-xs ml-auto"
							disabled={sendToAdrMut.isPending}
							onClick={() => sendToAdrMut.mutate()}
							title="Create ADR session from diarized segments"
							aria-label="Send diarization to ADR"
						>
							{sendToAdrMut.isPending ? (
								<Spinner size="sm" className="mr-1" />
							) : (
								<SendTo className="h-3 w-3 mr-1" />
							)}
							Send to ADR
						</Button>
					</div>

					<div className="rounded-lg border border-border bg-card divide-y divide-border">
						{result.segments.map((seg, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: Diarization segments are static display items
							<div key={`seg-${i}`} className="flex items-start gap-3 p-3">
								<Badge
									className={cn(
										"text-xs shrink-0 mt-0.5 min-w-[5.5rem] justify-center",
										speakerColor(seg.speaker),
									)}
								>
									{seg.speaker}
								</Badge>
								<div className="flex-1">
									<p className="text-sm text-foreground">{seg.text}</p>
									<p className="text-xs font-mono text-muted-foreground/60 mt-0.5">
										{formatTime(seg.start)} · {formatTime(seg.end)}
									</p>
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
