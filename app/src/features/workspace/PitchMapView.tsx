import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { PitchSegment } from "@/lib/api/types";
import {
	SCALE_CHROMATIC,
	SCALE_MAJOR,
	SCALE_MINOR,
	SCALE_PENTATONIC,
} from "@/lib/api/types";
import { ERR_TITLE_ENHANCE } from "@/lib/errorMessages";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
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
import { hueLine } from "./hueIdentity";

const NOTE_NAMES = [
	"C",
	"C#",
	"D",
	"D#",
	"E",
	"F",
	"F#",
	"G",
	"G#",
	"A",
	"A#",
	"B",
];
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
const START_MIDI = 48;
const END_MIDI = 84;
const KEY_COUNT = END_MIDI - START_MIDI;
const KEY_HEIGHT = 14;
const SCALES: { value: string; label: string; intervals: number[] }[] = [
	{ value: "major", label: "Major", intervals: SCALE_MAJOR },
	{ value: "minor", label: "Minor", intervals: SCALE_MINOR },
	{ value: "pentatonic", label: "Pentatonic", intervals: SCALE_PENTATONIC },
	{ value: "chromatic", label: "Chromatic", intervals: SCALE_CHROMATIC },
];

function isBlackKey(midi: number) {
	return BLACK_KEYS.has(midi % 12);
}

function noteName(midi: number) {
	return `${NOTE_NAMES[midi % 12] ?? "?"}${Math.floor(midi / 12) - 1}`;
}

/** Nearest scale degree to a MIDI note, assuming a C root. */
function snapToScale(midi: number, intervals: number[]) {
	const pitch = ((midi % 12) + 12) % 12;
	const octave = Math.floor(midi / 12);
	let best = intervals[0] ?? 0;
	let bestDist = 12;
	for (const iv of intervals) {
		const dist = Math.min(Math.abs(pitch - iv), 12 - Math.abs(pitch - iv));
		if (dist < bestDist) {
			bestDist = dist;
			best = iv;
		}
	}
	return octave * 12 + best;
}

function AnalyzeBar({
	audioPath,
	onPath,
	pending,
	onAnalyze,
	compact,
}: {
	audioPath: string;
	onPath: (v: string) => void;
	pending: boolean;
	onAnalyze: () => void;
	compact?: boolean;
}) {
	return (
		<div className="flex items-center gap-2">
			<Input
				placeholder="/path/to/audio.wav"
				value={audioPath}
				onChange={(e) => onPath(e.target.value)}
				className={cn("flex-1 text-xs", compact ? "h-7" : "h-8")}
				aria-label="Audio file path"
			/>
			<Button
				type="button"
				size="sm"
				className={cn("text-xs", compact && "h-7")}
				disabled={!audioPath.trim() || pending}
				title="Analyze audio pitch"
				aria-label="Analyze audio pitch"
				onClick={onAnalyze}
			>
				{pending ? <Spinner size="xs" className="mr-1" /> : null}
				Analyze
			</Button>
		</div>
	);
}

export function PitchMapView() {
	const { toast } = useToast();
	const [scale, setScale] = useState("chromatic");
	const [snapEnabled, setSnapEnabled] = useState(true);
	const [audioPath, setAudioPath] = useState("");
	const [segments, setSegments] = useState<PitchSegment[]>([]);

	const analyzeMut = useMutation({
		mutationFn: (path: string) => apiClient.analyzePitch(path, 48000),
		onSuccess: (data) => {
			setSegments(data);
			toast({
				title: "Analysis complete",
				description: `Found ${data.length} pitch segments`,
			});
		},
		onError: () =>
			toast({
				title: ERR_TITLE_ENHANCE,
				description: "Pitch analysis couldn't read the audio",
				variant: "destructive",
			}),
	});

	function handleAnalyze() {
		if (!audioPath.trim()) {
			toast({
				title: "No audio path",
				description: "Enter a path to an audio file",
				variant: "destructive",
			});
			return;
		}
		analyzeMut.mutate(audioPath.trim());
	}

	const activeScale =
		SCALES.find((s) => s.value === scale) ??
		({
			value: "chromatic",
			label: "Chromatic",
			intervals: SCALE_CHROMATIC,
		} as const);
	const shown = snapEnabled
		? segments.map((seg) => ({
				...seg,
				midi_note: snapToScale(seg.midi_note, activeScale.intervals),
			}))
		: segments;
	const totalDuration =
		(segments[segments.length - 1]?.end_sample ?? 1) / 48000;

	if (segments.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-4 p-8">
				<ScreenHeader
					title="Pitch Map"
					description="Visualize detected pitch against a piano roll"
				/>
				<EmptyState
					title="Analyze audio to view the pitch map"
					body="Provide an audio file path and run the analyzer."
				/>
				<div className="w-full max-w-md">
					<AnalyzeBar
						audioPath={audioPath}
						onPath={setAudioPath}
						pending={analyzeMut.isPending}
						onAnalyze={handleAnalyze}
					/>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col gap-3 overflow-hidden p-4">
			<ScreenHeader
				title="Pitch Map"
				description="Detected pitch on a piano roll"
			/>
			<div className="flex flex-wrap items-center gap-2">
				<Select value={scale} onValueChange={setScale}>
					<SelectTrigger className="h-8 w-32 text-xs" aria-label="Scale">
						<SelectValue placeholder="Scale" />
					</SelectTrigger>
					<SelectContent>
						{SCALES.map((s) => (
							<SelectItem key={s.value} value={s.value}>
								{s.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button
					type="button"
					variant={snapEnabled ? "default" : "outline"}
					size="sm"
					className="h-8 text-xs"
					aria-pressed={snapEnabled}
					title="Snap detected notes to the selected scale (C root)"
					aria-label="Toggle snap to scale"
					onClick={() => setSnapEnabled(!snapEnabled)}
				>
					Snap {snapEnabled ? "ON" : "OFF"}
				</Button>
				<span className="flex-1" />
				<span className="text-xs text-muted-foreground">
					{segments.length} segments
					{snapEnabled && scale !== "chromatic"
						? ` · snapped to C ${activeScale.label}`
						: ""}
				</span>
			</div>

			<div className="flex min-h-0 flex-1 gap-2">
				<div
					className="flex flex-col overflow-y-auto rounded-md border border-border bg-card"
					aria-hidden="true"
				>
					{Array.from({ length: KEY_COUNT }, (_, i) => {
						const midi = END_MIDI - i;
						const black = isBlackKey(midi);
						return (
							<div
								key={midi}
								className={cn(
									"flex shrink-0 items-center border-b border-border",
									black ? "bg-sunken" : "bg-card",
								)}
								style={{ height: KEY_HEIGHT }}
							>
								<span className="w-9 px-1 text-right text-[8px] text-muted-foreground">
									{black ? "" : noteName(midi)}
								</span>
								<div
									className={cn(
										"flex-1",
										black && "mx-0.5 h-full rounded-sm bg-strong",
									)}
								/>
							</div>
						);
					})}
				</div>

				<div className="relative min-w-0 flex-1 overflow-hidden rounded-md border border-border bg-card">
					{Array.from({ length: KEY_COUNT }, (_, i) => {
						const midi = END_MIDI - i;
						if (isBlackKey(midi)) {
							return null;
						}
						return (
							<div
								key={midi}
								aria-hidden="true"
								className="absolute inset-x-0 border-t border-border"
								style={{ top: i * KEY_HEIGHT, height: KEY_HEIGHT }}
							/>
						);
					})}
					{shown.map((seg) => {
						const yPos = (END_MIDI - seg.midi_note) * KEY_HEIGHT;
						const leftPct =
							totalDuration > 0
								? (seg.start_sample / 48000 / totalDuration) * 100
								: 0;
						const widthPct =
							totalDuration > 0
								? ((seg.end_sample - seg.start_sample) /
										48000 /
										totalDuration) *
									100
								: 0;
						return (
							<button
								key={`${seg.start_sample}-${seg.end_sample}`}
								type="button"
								className={cn(
									"absolute h-2.5 rounded-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
									// DiarizationView pattern: solid token surface, pitch-class
									// hue carried by the left identity line + tooltip text.
									hueLine(seg.midi_note % 12),
									"border-l-2 bg-card",
									"text-foreground",
								)}
								style={{
									left: `${leftPct}%`,
									width: `${Math.max(widthPct, 0.3)}%`,
									top: yPos + 2,
								}}
								title={`${seg.note_name} (confidence ${(seg.confidence * 100).toFixed(0)}%)`}
								aria-label={`${seg.note_name}, confidence ${(seg.confidence * 100).toFixed(0)} percent`}
								onClick={() =>
									toast({
										title: seg.note_name,
										description: `Confidence ${(seg.confidence * 100).toFixed(0)}% · ${seg.frequency.toFixed(1)} Hz`,
									})
								}
							/>
						);
					})}
				</div>
			</div>

			<AnalyzeBar
				audioPath={audioPath}
				onPath={setAudioPath}
				pending={analyzeMut.isPending}
				onAnalyze={handleAnalyze}
				compact
			/>
		</div>
	);
}
