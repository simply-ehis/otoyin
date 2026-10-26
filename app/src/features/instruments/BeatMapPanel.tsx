/**
 * BeatMapPanel — map GM instruments to beats inside the Instruments tab
 * (in place, no new route or tab).
 *
 * Rows are instruments (GM program + MIDI note), columns are 16 steps, and
 * each cell triggers its row's note at that step's velocity. Rendering goes
 * through the backend's mixed GM pattern endpoint (`POST /instruments/gm-pattern`):
 * one call synthesizes every active row into a looped WAV, and the playhead
 * reads the audio clock over rAF to light `data-current` cells without
 * re-rendering React per step. Loops until stopped.
 */

import { createSource } from "@audio-ui/react";
import {
	MinusIcon,
	PauseIcon,
	PlayIcon,
	PlusIcon,
} from "@heroicons/react/24/outline";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";
import { Button } from "@/ui/button";
import { Spinner } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { Sequencer } from "@/ui/sequencer";

const STEPS = 16;
const STEP_DURATION = 0.25; // 120 BPM eighth notes
const MAX_ROWS = 16; // the renderer gives each program one MIDI channel

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

const noteName = (midi: number) =>
	`${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

type GmProgram = { program: number; name: string; family: string };

type BeatRow = {
	id: string;
	program: number;
	note: number; // MIDI 21-108
	velocities: number[];
};

type GmPatternPayload = {
	steps: Array<{ program: number; note: number; velocity: number }[]>;
	step_duration: number;
	bars?: number;
};

const emptyVelocities = () => Array.from({ length: STEPS }, () => 0);

export function BeatMapPanel() {
	const {
		data,
		isPending: loading,
		isError,
		error,
	} = useQuery({
		queryKey: ["gm-types"],
		queryFn: () => apiClient.listGMTypes(),
	});
	const programs: GmProgram[] = (data?.programs ?? [])
		.slice()
		.sort((a, b) => a.program - b.program);
	const programByNumber = useMemo(
		() => new Map(programs.map((p) => [p.program, p])),
		[programs],
	);
	const programLabel = (program: number) => {
		const p = programByNumber.get(program);
		return p
			? `${String(p.program).padStart(3, "0")} — ${p.name}`
			: String(program);
	};
	const [rows, setRows] = useState<BeatRow[]>([
		{ id: "row-1", program: 0, note: 60, velocities: emptyVelocities() },
	]);
	const [step] = useState(() => createSource(-1));
	const [isPlaying, setIsPlaying] = useState(false);
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const urlRef = useRef<string | null>(null);

	const grid = useMemo(
		() => rows.map((row) => row.velocities.map((v) => v > 0)),
		[rows],
	);
	const hasNotes = grid.some((stepOn) => stepOn.some(Boolean));

	const stop = useCallback(() => {
		audioRef.current?.pause();
		if (urlRef.current) {
			URL.revokeObjectURL(urlRef.current);
		}
		urlRef.current = null;
		audioRef.current = null;
		setIsPlaying(false);
		step.set(-1);
	}, [step]);

	// Unmount (or tab switch) must not leave a looping map behind.
	useEffect(() => stop, [stop]);

	const renderPayload = useCallback(
		() => ({
			steps: Array.from({ length: STEPS }, (_, stepIndex) =>
				rows
					.map((row, rowIndex) =>
						grid[rowIndex]?.[stepIndex]
							? {
									program: row.program,
									note: row.note,
									velocity: row.velocities[stepIndex],
								}
							: null,
					)
					.filter(
						(
							note,
						): note is {
							program: number;
							note: number;
							velocity: number;
						} => note !== null,
					),
			),
			step_duration: STEP_DURATION,
		}),
		[grid, rows],
	);

	const render = useMutation({
		mutationFn: (data: GmPatternPayload) => apiClient.playGmPattern(data),
		onSuccess: (blob) => {
			if (audioRef.current) {
				return; // stopped while rendering
			}
			const url = URL.createObjectURL(blob);
			const audio = new Audio(url);
			audio.loop = true;
			urlRef.current = url;
			audioRef.current = audio;
			// The playhead reads the audio clock; when stop() swaps the ref out,
			// this check ends the rAF chain on its own.
			const tick = () => {
				if (audioRef.current !== audio) {
					return;
				}
				step.set(Math.floor(audio.currentTime / STEP_DURATION) % STEPS);
				requestAnimationFrame(tick);
			};
			setIsPlaying(true);
			void audio.play().then(tick, stop);
		},
		onError: showStudioErrorToast,
	});

	const toggle = () => {
		if (audioRef.current) {
			stop();
		} else {
			render.mutate(renderPayload());
		}
	};

	const clear = () => {
		stop();
		setRows((current) =>
			current.map((row) => ({ ...row, velocities: emptyVelocities() })),
		);
	};

	const addRow = () => {
		stop();
		const id = `row-${rows.length + 1}`;
		setRows((current) => [
			...current,
			{ id, program: 0, note: 60, velocities: emptyVelocities() },
		]);
	};

	const removeRow = (id: string) => {
		stop();
		setRows((current) => current.filter((row) => row.id !== id));
	};

	const setProgram = (id: string, program: number) => {
		setRows((current) =>
			current.map((row) => (row.id === id ? { ...row, program } : row)),
		);
	};

	const setNote = (id: string, note: number) => {
		setRows((current) =>
			current.map((row) => (row.id === id ? { ...row, note } : row)),
		);
	};

	// Flip a cell: painting on keeps its velocity, painting off silences it.
	const onValueChange = useCallback((next: boolean[][]) => {
		setRows((current) =>
			current.map((row, rowIndex) => ({
				...row,
				velocities: row.velocities.map((velocity, stepIndex) => {
					const on = next[rowIndex]?.[stepIndex] ?? false;
					return on ? (velocity > 0 ? velocity : 0.5) : 0;
				}),
			})),
		);
	}, []);

	const onVelocityChange = useCallback((next: number[][]) => {
		setRows((current) =>
			current.map((row, rowIndex) => ({
				...row,
				velocities: next[rowIndex] ?? row.velocities,
			})),
		);
	}, []);

	const rowLabel = (row: BeatRow) =>
		`${programLabel(row.program)} · ${noteName(row.note)}`;

	return (
		<div className="flex w-full flex-col gap-3">
			{loading ? (
				<Spinner size="sm" />
			) : (
				<>
					{isError ? (
						<div
							className="rounded-md border border-destructive/40 bg-danger-soft px-3 py-2 text-xs text-danger-text"
							role="alert"
						>
							{error instanceof Error ? error.message : String(error)}
						</div>
					) : null}
					<fieldset
						aria-label="Instruments"
						className="border-none flex flex-col gap-1 sm:flex-row sm:items-end sm:gap-2 p-0"
					>
						<legend className="sr-only">Instruments</legend>
						{rows.map((row) => (
							<div
								key={row.id}
								className="flex flex-col sm:flex-row sm:items-end gap-1"
							>
								<Select
									disabled={isPlaying}
									value={String(row.program)}
									onValueChange={(value) => setProgram(row.id, Number(value))}
								>
									<SelectTrigger className="w-[160px]">
										<SelectValue>{programLabel(row.program)}</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{programs.flatMap((program, index) =>
											index > 0 && programs[index - 1].family !== program.family
												? [
														<SelectSeparator key={`fam-${program.family}`}>
															{program.family}
														</SelectSeparator>,
														<SelectItem
															key={program.program}
															value={String(program.program)}
														>
															{programLabel(program.program)}
														</SelectItem>,
													]
												: [
														<SelectItem
															key={program.program}
															value={String(program.program)}
														>
															{programLabel(program.program)}
														</SelectItem>,
													],
										)}
									</SelectContent>
								</Select>
								<label className="text-xs text-muted-foreground">
									Note
									<input
										aria-label={`Note ${noteName(row.note)}`}
										className="w-16"
										disabled={isPlaying}
										max={108}
										min={21}
										onChange={(event) =>
											setNote(row.id, Number(event.target.value))
										}
										type="number"
										value={row.note}
									/>
								</label>
								<span className="text-xs text-muted-foreground">
									{noteName(row.note)}
								</span>
								<Button
									aria-label={`Remove ${noteName(row.note)} row`}
									disabled={isPlaying}
									size="icon-sm"
									type="button"
									variant="ghost"
									onClick={() => removeRow(row.id)}
								>
									<MinusIcon className="size-4" />
								</Button>
							</div>
						))}
						<Button
							disabled={isPlaying || rows.length >= MAX_ROWS}
							onClick={addRow}
							type="button"
						>
							<PlusIcon className="mr-1 size-4" />
							Add instrument
						</Button>
					</fieldset>
					<Sequencer
						aria-label="Beat map"
						disabled={isPlaying}
						onValueChange={onValueChange}
						onVelocityChange={onVelocityChange}
						rowLabels={rows.map(rowLabel)}
						source={step}
						value={grid}
						velocities={rows.map((row) => row.velocities)}
					/>
					<div className="flex items-center gap-2">
						<Button
							disabled={render.isPending || !hasNotes}
							onClick={toggle}
							type="button"
						>
							{render.isPending ? <Spinner size="xs" className="mr-1" /> : null}
							{isPlaying ? (
								<PauseIcon className="mr-1 size-4" aria-hidden="true" />
							) : (
								<PlayIcon className="mr-1 size-4" aria-hidden="true" />
							)}
							{render.isPending
								? "Rendering…"
								: isPlaying
									? "Stop"
									: "Play map"}
						</Button>
						<Button
							disabled={render.isPending || !hasNotes}
							onClick={clear}
							type="button"
							variant="ghost"
						>
							Clear
						</Button>
						<p className="text-muted-foreground text-xs">
							16 steps at 120 BPM — click a cell to trigger its note, drag the
							bars for velocity.
						</p>
					</div>
				</>
			)}
		</div>
	);
}
