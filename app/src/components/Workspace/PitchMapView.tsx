import { MusicalNoteIcon as Music } from "@heroicons/react/24/outline";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";
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
import { apiClient } from "@/lib/api/client";
import type { PitchSegment } from "@/lib/api/types";
import { ERR_TITLE_ENHANCE } from "@/lib/errorMessages";
import { cn } from "@/lib/utils/cn";

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
const WHITE_KEY_HEIGHT = KEY_HEIGHT;
const SCALES = [
	{ value: "major", label: "Major" },
	{ value: "minor", label: "Minor" },
	{ value: "pentatonic", label: "Pentatonic" },
	{ value: "chromatic", label: "Chromatic" },
];

function isBlackKey(midi: number) {
	return BLACK_KEYS.has(midi % 12);
}

function noteName(midi: number) {
	return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function PitchMapView() {
	const { toast } = useToast();
	const [scale, setScale] = useState("chromatic");
	const [snapEnabled, setSnapEnabled] = useState(true);
	const [audioPath, setAudioPath] = useState("");
	const [segments, setSegments] = useState<PitchSegment[]>([]);

	const analyzeMut = useMutation({
		mutationFn: (path: string) => apiClient.analyzePitch(path, 48000),
	});

	const handleAnalyze = useCallback(() => {
		if (!audioPath.trim()) {
			toast({
				title: "No audio path",
				description: "Enter a path to an audio file",
				variant: "destructive",
			});
			return;
		}
		analyzeMut.mutate(audioPath.trim(), {
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
	}, [audioPath, analyzeMut, toast]);

	const hasAnalysis = segments.length > 0;

	if (!hasAnalysis) {
		return (
			<div className="flex flex-col items-center justify-center h-full gap-4 p-8">
				<EmptyState
					icon={<Music />}
					title="Analyze audio to view pitch map"
					description="Provide an audio file path and run the analyzer to visualize detected pitch segments."
				/>
				<div className="flex items-center gap-2 w-full max-w-md">
					<Input
						placeholder="/path/to/audio.wav"
						value={audioPath}
						onChange={(e) => setAudioPath(e.target.value)}
						className="text-xs h-8 flex-1"
						aria-label="Audio file path"
					/>
					<Button
						size="sm"
						disabled={!audioPath.trim() || analyzeMut.isPending}
						onClick={handleAnalyze}
						title="Analyze audio pitch"
						aria-label="Analyze"
					>
						{analyzeMut.isPending ? (
							<Spinner size="md" />
						) : (
							<Music className="size-4" />
						)}
						{analyzeMut.isPending ? "…" : "Analyze"}
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full p-4 gap-4">
			<ScreenHeader
				icon={<Music className="size-5" />}
				title="Pitch Map"
				description="Visualize and snap pitch to scale"
			/>
			{/* Scale selector & snap */}
			<div className="flex items-center gap-3">
				<Select value={scale} onValueChange={setScale}>
					<SelectTrigger className="w-32 h-8 text-xs">
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
					variant={snapEnabled ? "default" : "ghost"}
					size="sm"
					className="h-8 text-xs"
					title="Toggle snap to scale"
					aria-label="Toggle snap to scale"
					onClick={() => setSnapEnabled(!snapEnabled)}
				>
					Snap {snapEnabled ? "ON" : "OFF"}
				</Button>
				<div className="flex-1" />
				<span className="text-xs text-muted-foreground">
					{segments.length} segments
				</span>
			</div>

			{/* Piano roll + contour */}
			<div className="flex flex-1 gap-2 overflow-hidden">
				{/* Piano keys */}
				<div className="flex flex-col overflow-y-auto border border-border rounded-lg bg-card">
					{Array.from({ length: KEY_COUNT }, (_, i) => {
						const midi = END_MIDI - i;
						const black = isBlackKey(midi);
						return (
							<div
								key={midi}
								className={cn(
									"flex items-center border-b border-border/30 shrink-0",
									black ? "bg-zinc-800/60" : "bg-card",
								)}
								style={{ height: WHITE_KEY_HEIGHT }}
							>
								{!black && (
									<span className="text-[8px] text-muted-foreground px-1 w-8 text-right">
										{noteName(midi)}
									</span>
								)}
								{black && <div className="w-8" />}
								<div
									className={cn(
										"flex-1",
										black && "h-full bg-zinc-800/40 mx-0.5 rounded-sm",
									)}
								/>
							</div>
						);
					})}
				</div>

				{/* Pitch contour area */}
				<div className="flex-1 rounded-lg border border-border bg-card relative overflow-hidden">
					{/* Grid lines */}
					{Array.from({ length: KEY_COUNT }, (_, i) => {
						const midi = END_MIDI - i;
						const black = isBlackKey(midi);
						if (black) {
							return null;
						}
						return (
							<div
								key={midi}
								className="absolute left-0 right-0 border-t border-border/20"
								style={{ top: i * WHITE_KEY_HEIGHT, height: WHITE_KEY_HEIGHT }}
							/>
						);
					})}

					{/* Pitch contour */}
					{segments
						.map((seg, idx) => ({ seg, k: idx }))
						.map(({ seg, k }) => {
							const yPos = (END_MIDI - seg.midi_note) * WHITE_KEY_HEIGHT;
							const xStart = seg.start_sample / 48000;
							const xEnd = seg.end_sample / 48000;
							const totalDuration =
								(segments[segments.length - 1]?.end_sample ?? 1) / 48000;
							const leftPct =
								totalDuration > 0 ? (xStart / totalDuration) * 100 : 0;
							const widthPct =
								totalDuration > 0 ? ((xEnd - xStart) / totalDuration) * 100 : 0;
							return (
								<div
									key={k}
									className="absolute h-[10px] rounded-sm bg-accent/40 hover:bg-accent/60 transition-colors"
									style={{
										left: `${leftPct}%`,
										width: `${Math.max(widthPct, 0.3)}%`,
										top: yPos + 2,
									}}
									title={`${seg.note_name} (conf: ${(seg.confidence * 100).toFixed(0)}%)`}
								/>
							);
						})}

					{segments.length === 0 && (
						<div className="absolute inset-0 flex items-center justify-center p-4">
							<EmptyState
								title="Pitch contour will appear here"
								className="border-transparent bg-transparent"
							/>
						</div>
					)}
				</div>
			</div>

			{/* Re-analyze */}
			<div className="flex items-center gap-2">
				<Input
					placeholder="/path/to/audio.wav"
					value={audioPath}
					onChange={(e) => setAudioPath(e.target.value)}
					className="text-xs h-7 flex-1"
					aria-label="Audio file path"
				/>
				<Button
					size="sm"
					className="h-7 text-xs"
					disabled={!audioPath.trim() || analyzeMut.isPending}
					onClick={handleAnalyze}
					title="Re-analyze"
					aria-label="Re-analyze"
				>
					{analyzeMut.isPending ? <Spinner size="xs" /> : null}
					Analyze
				</Button>
			</div>
		</div>
	);
}
