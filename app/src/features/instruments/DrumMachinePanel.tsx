/**
 * DrumMachinePanel — the Instruments tab's step grid (in place, no new tab).
 *
 * Draws a 5-voice x 16-step pattern with the audio/ui Sequencer, renders it
 * through the backend's lane-grid contract (`POST /instruments/drum-machine`
 * with per-step velocities + global step duration), and lights the playing
 * column from a clock read off the rendered audio element. Playback loops
 * until stopped.
 */

import { createSource } from "@audio-ui/react";
import { PauseIcon, PlayIcon } from "@heroicons/react/24/outline";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";
import { Button } from "@/ui/button";
import { Spinner } from "@/ui/primitives";
import { Sequencer } from "@/ui/sequencer";

const ROWS = ["Kick", "Snare", "Hi-Hat", "Clap", "Tom"];
const STEPS = 16;
const STEP_DURATION = 0.125; // 120 BPM sixteenths — the backend default.

const stepsRow = (onSteps: number[]) =>
	Array.from({ length: STEPS }, (_, step) => onSteps.includes(step));
const fullRow = () => Array.from({ length: STEPS }, () => 1);
const emptyGrid = () => ROWS.map(() => stepsRow([]));

// A starter four-on-the-floor beat so the grid is playable at first sight.
const INITIAL_PATTERN = [
	stepsRow([0, 4, 8, 12]),
	stepsRow([4, 12]),
	stepsRow([0, 2, 4, 6, 8, 10, 12, 14]),
	stepsRow([]),
	stepsRow([]),
];

/** Pad label -> backend drum voice: the backend is lowercase and hyphenless ("Hi-Hat" -> "hihat"). */
const voiceFor = (label: string) => label.toLowerCase().replace(/-/g, "");

/** Grid (booleans + velocities) -> the backend's lanes: voice -> per-step velocity, 0 = rest. */
export const toLanes = (pattern: boolean[][], velocities: number[][]) =>
	Object.fromEntries(
		ROWS.map((label, row) => [
			voiceFor(label),
			pattern[row].map((on, step) => (on ? (velocities[row]?.[step] ?? 1) : 0)),
		]),
	);

export function DrumMachinePanel() {
	const [pattern, setPattern] = useState<boolean[][]>(INITIAL_PATTERN);
	const [velocities, setVelocities] = useState<number[][]>(() =>
		ROWS.map(fullRow),
	);
	// The source object carries its own .set() — not React state.
	const [step] = useState(() => createSource(-1));
	const [isPlaying, setIsPlaying] = useState(false);
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const urlRef = useRef<string | null>(null);

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

	// Unmount (or tab switch) must not leave a looping beat behind.
	useEffect(() => stop, [stop]);

	const render = useMutation({
		mutationFn: () =>
			apiClient.playDrumMachine({
				lanes: toLanes(pattern, velocities),
				step_duration: STEP_DURATION,
			}),
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
			render.mutate();
		}
	};

	const clear = () => {
		stop();
		setPattern(emptyGrid());
		setVelocities(ROWS.map(fullRow));
	};

	return (
		<div className="flex w-full flex-col gap-3">
			<Sequencer
				aria-label="Drum pattern"
				onValueChange={setPattern}
				onVelocityChange={setVelocities}
				rowLabels={ROWS}
				showVelocity
				source={step}
				value={pattern}
				velocities={velocities}
			/>
			<div className="flex items-center gap-2">
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={render.isPending}
					onClick={toggle}
				>
					{render.isPending ? <Spinner size="xs" className="mr-1" /> : null}
					{isPlaying ? (
						<PauseIcon className="mr-1 size-4" aria-hidden="true" />
					) : (
						<PlayIcon className="mr-1 size-4" aria-hidden="true" />
					)}
					{render.isPending ? "Rendering…" : isPlaying ? "Stop" : "Play beat"}
				</Button>
				<Button
					type="button"
					size="sm"
					variant="ghost"
					disabled={render.isPending}
					onClick={clear}
				>
					Clear
				</Button>
				<p className="text-muted-foreground text-xs">
					16 steps at 120 BPM — click a step, drag to paint, drag the bars for
					velocity.
				</p>
			</div>
		</div>
	);
}
