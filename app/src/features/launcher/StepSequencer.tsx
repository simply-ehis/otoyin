/**
 * Step-sequencer grid editor for MIDI clips.
 * Rows = pitches (bottom = low, top = high), columns = time steps.
 * Click to toggle a note, drag to paint multiple notes.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import type { MidiClip, MidiNote } from "./types";

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

function pitchName(pitch: number): string {
	const octave = Math.floor(pitch / 12) - 1;
	const note = NOTE_NAMES[pitch % 12];
	return `${note}${octave}`;
}

function defaultVelocity(): number {
	return 80;
}

function generateId(): string {
	return `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface StepSequencerProps {
	clip: MidiClip;
	onChange: (notes: MidiNote[]) => void;
	/** Number of pitch rows visible (default 24 = 2 octaves). */
	visiblePitches?: number;
	/** Lowest pitch (default 48 = C3). */
	basePitch?: number;
	className?: string;
}

export function StepSequencer({
	clip,
	onChange,
	visiblePitches = 24,
	basePitch = 48,
	className,
}: StepSequencerProps) {
	const totalSteps = Math.max(16, clip.lengthBeats * 4);
	const pitches = useMemo(
		() =>
			Array.from(
				{ length: visiblePitches },
				(_, i) => basePitch + visiblePitches - 1 - i,
			),
		[basePitch, visiblePitches],
	);

	const noteSet = useMemo(() => {
		const map = new Map<string, MidiNote>();
		for (const n of clip.notes) {
			map.set(`${n.pitch}:${n.step}`, n);
		}
		return map;
	}, [clip.notes]);

	const [painting, setPainting] = useState<"add" | "remove">("add");
	const containerRef = useRef<HTMLDivElement>(null);

	const toggleNote = useCallback(
		(pitch: number, step: number) => {
			const key = `${pitch}:${step}`;
			const existing = noteSet.get(key);
			if (existing) {
				onChange(clip.notes.filter((n) => n.id !== existing.id));
			} else {
				const note: MidiNote = {
					id: generateId(),
					step,
					pitch,
					velocity: defaultVelocity(),
					durationSteps: 1,
				};
				onChange([...clip.notes, note]);
			}
		},
		[clip.notes, noteSet, onChange],
	);

	const handlePointerDown = useCallback(
		(pitch: number, step: number) => {
			const key = `${pitch}:${step}`;
			const exists = noteSet.has(key);
			setPainting(exists ? "remove" : "add");
			toggleNote(pitch, step);
		},
		[noteSet, toggleNote],
	);

	const handlePointerEnter = useCallback(
		(pitch: number, step: number) => {
			const key = `${pitch}:${step}`;
			const exists = noteSet.has(key);
			if (painting === "add" && !exists) {
				toggleNote(pitch, step);
			} else if (painting === "remove" && exists) {
				toggleNote(pitch, step);
			}
		},
		[painting, noteSet, toggleNote],
	);

	return (
		<div
			ref={containerRef}
			className={cn(
				"overflow-auto rounded-md border border-border bg-card",
				className,
			)}
			onPointerLeave={() => setPainting("add")}
		>
			<table className="border-collapse">
				<thead>
					<tr>
						<th className="sticky left-0 z-10 w-10 bg-card px-1 py-0.5 text-[10px] text-muted-foreground">
							#
						</th>
						{Array.from({ length: totalSteps }, (_, i) => (
							<th
								// biome-ignore lint/suspicious/noArrayIndexKey: static grid, columns never reorder
								key={i}
								className={cn(
									"h-5 w-5 px-0 py-0 text-center text-[9px] text-muted-foreground",
									i % 4 === 0 && "border-l border-border/50",
								)}
							>
								{i + 1}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{pitches.map((pitch) => (
						<tr key={pitch}>
							<td className="sticky left-0 z-10 w-10 bg-card px-1 py-0 text-right text-[10px] tabular-nums text-muted-foreground">
								{pitchName(pitch)}
							</td>
							{Array.from({ length: totalSteps }, (_, step) => {
								const hasNote = noteSet.has(`${pitch}:${step}`);
								const isBarline = step % 4 === 0;
								return (
									<td
										// biome-ignore lint/suspicious/noArrayIndexKey: static grid, columns never reorder
										key={step}
										className={cn(
											"h-5 w-5 cursor-pointer border border-border/30 p-0 transition-colors",
											isBarline && "border-l border-l-border/60",
											hasNote
												? "bg-primary/80 hover:bg-primary/60"
												: "bg-muted/20 hover:bg-muted/40",
										)}
										onPointerDown={() => handlePointerDown(pitch, step)}
										onPointerEnter={() => handlePointerEnter(pitch, step)}
										aria-label={`${pitchName(pitch)} step ${step + 1}${hasNote ? " (on)" : ""}`}
									/>
								);
							})}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
