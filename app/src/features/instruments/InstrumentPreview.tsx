/**
 * Studio instrument preview — 2-octave piano keyboard + drum pads with
 * client-side playback via the instrument engine.
 *
 * Optimizations vs v1:
 * - SoundFont ArrayBuffer cached by pack ID (no re-fetch on remount)
 * - SpessaSynthProcessor cached per SoundFont (no 100-500ms reload per note)
 * - Stable useEffect deps (ref-based instrument selection)
 * - Computer keyboard mapping + copy/paste patterns
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { InstrumentPackInstrument } from "@/lib/api/types";
import { showStudioErrorToast } from "@/lib/errors";
import { Button } from "@/ui/button";
import { Label } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { Slider } from "@/ui/slider";
import {
	audioBufferFromChannels,
	type PreparedInstrument,
	type PreparedSampler,
	prepareInstrument,
	renderSoundFontNote,
	scheduleSamplerNote,
} from "./instrumentPlayback";
import type { InstrumentRef } from "./types";
import { useInstrumentPacks } from "./useInstrumentPacks";

// ─── Constants ───────────────────────────────────────────────────────────────

const WHITE_KEYS = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76];
const BLACK_KEYS = [61, 63, -1, 66, 68, 70, -1, 73, 75];
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
const KEYBOARD_MAP: Record<string, number> = {
	z: 60,
	s: 61,
	x: 62,
	d: 63,
	c: 64,
	v: 65,
	g: 66,
	b: 67,
	h: 68,
	n: 69,
	j: 70,
	m: 71,
	q: 72,
	2: 73,
	w: 74,
	3: 75,
	e: 76,
};
const DRUM_MAP: Record<string, string> = {
	"1": "Kick",
	"2": "Snare",
	"3": "Hi-Hat",
	"4": "Clap",
	q: "Kick",
	w: "Snare",
	e: "Hi-Hat",
	r: "Clap",
};
const DRUM_MIDI: Record<string, number> = {
	Kick: 36,
	Snare: 38,
	"Hi-Hat": 42,
	Clap: 39,
	Tom: 45,
	Rim: 37,
	Crash: 49,
	Ride: 51,
	Shaker: 70,
	Tambourine: 54,
	Cowbell: 56,
	Claves: 75,
	Conga: 64,
	Bongo: 60,
	Triangle: 81,
	Splash: 55,
};
const DRUM_PADS = [
	"Kick",
	"Snare",
	"Hi-Hat",
	"Clap",
	"Tom",
	"Rim",
	"Crash",
	"Ride",
	"Shaker",
	"Tambourine",
	"Cowbell",
	"Claves",
	"Conga",
	"Bongo",
	"Triangle",
	"Splash",
];

function noteName(midi: number) {
	return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

// ─── SoundFont data cache (module-level) ─────────────────────────────────────
// Avoids re-fetching the same SoundFont ArrayBuffer from the server on remount.

const sfDataCache = new Map<string, ArrayBuffer>();

async function fetchSoundFontData(packId: string): Promise<ArrayBuffer> {
	const cached = sfDataCache.get(packId);
	if (cached) {
		return cached;
	}
	const data = await apiClient.getInstrumentPackFile(packId);
	sfDataCache.set(packId, data);
	return data;
}

// ─── Hook: shared AudioContext ───────────────────────────────────────────────

function useSharedAudioContext() {
	const ctxRef = useRef<AudioContext | null>(null);
	const getCtx = useCallback(() => {
		if (!ctxRef.current || ctxRef.current.state === "closed") {
			ctxRef.current = new AudioContext();
		}
		if (ctxRef.current.state === "suspended") {
			ctxRef.current.resume();
		}
		return ctxRef.current;
	}, []);
	useEffect(() => {
		return () => {
			ctxRef.current?.close();
			ctxRef.current = null;
		};
	}, []);
	return getCtx;
}

// ─── Piano Key component ─────────────────────────────────────────────────────

function PianoKey({
	midi,
	isBlack,
	onDown,
	onUp,
	isActive,
	velocity,
	style,
}: {
	midi: number;
	isBlack: boolean;
	onDown: (midi: number) => void;
	onUp: (midi: number) => void;
	isActive: boolean;
	velocity: number;
	style?: React.CSSProperties;
}) {
	const held = useRef(false);
	const base = isBlack
		? "h-10 w-7 -mx-3.5 z-10 rounded-b-md"
		: "h-16 w-9 rounded-b-md";
	const color = isBlack
		? isActive
			? "bg-accent text-accent-foreground"
			: "bg-foreground text-background"
		: isActive
			? "bg-accent text-accent-foreground border-accent"
			: "bg-background text-foreground border-border";
	const opacity = isActive ? 1 : 0.7 + 0.3 * velocity;

	return (
		<button
			type="button"
			className={`${base} ${color} border select-none transition-opacity active:scale-95`}
			style={{ opacity, ...style }}
			onPointerDown={(e) => {
				e.preventDefault();
				held.current = true;
				onDown(midi);
			}}
			onPointerUp={() => {
				if (held.current) {
					held.current = false;
					onUp(midi);
				}
			}}
			onPointerLeave={() => {
				if (held.current) {
					held.current = false;
					onUp(midi);
				}
			}}
			aria-label={`Play ${noteName(midi)}`}
			title={`${noteName(midi)} (${midi})`}
		>
			<span className="pointer-events-none absolute bottom-1 left-0 right-0 text-center text-[8px] opacity-50">
				{noteName(midi)}
			</span>
		</button>
	);
}

// ─── Main component ──────────────────────────────────────────────────────────

export function InstrumentPreview() {
	const getCtx = useSharedAudioContext();
	const { data: packs } = useInstrumentPacks();
	const [velocity, setVelocity] = useState(0.8);
	const [selectedPackId, setSelectedPackId] = useState<string>("builtin");
	const [selectedInstrument, setSelectedInstrument] =
		useState<InstrumentPackInstrument | null>(null);
	const [prepared, setPrepared] = useState<PreparedInstrument | null>(null);
	const [activeKeys, setActiveKeys] = useState<Set<number>>(new Set());
	const preparingRef = useRef(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Refs for stable effect deps (avoid re-triggering preparation)
	const selectedInstRef = useRef(selectedInstrument);
	selectedInstRef.current = selectedInstrument;
	const selectedPackRef = useRef(selectedPackId);
	selectedPackRef.current = selectedPackId;

	// Flatten instruments from all packs
	const allInstruments = useMemo(() => {
		const instruments: Array<
			InstrumentPackInstrument & { packName: string; packId: string }
		> = [];
		for (const pack of packs ?? []) {
			for (const inst of pack.instruments) {
				instruments.push({
					...inst,
					packName: pack.name,
					packId: pack.id,
				});
			}
		}
		return instruments;
	}, [packs]);

	// Prepare instrument when selection changes (ref-stable deps)
	useEffect(() => {
		const inst = selectedInstRef.current;
		const packId = selectedPackRef.current;
		if (!inst || packId === "builtin") {
			setPrepared(null);
			return;
		}
		if (preparingRef.current) {
			return;
		}
		preparingRef.current = true;

		const pack = (packs ?? []).find((p) => p.id === packId);
		if (!pack) {
			preparingRef.current = false;
			return;
		}

		let cancelled = false;
		(async () => {
			try {
				const ctx = getCtx();
				const data = await fetchSoundFontData(pack.id);
				if (cancelled) {
					return;
				}
				const resolved = {
					instrument: {
						id: inst.id,
						name: inst.name,
						format: "soundfont" as const,
						program: inst.program,
						bankMSB: inst.bankMSB,
						bankLSB: inst.bankLSB,
						percussion: inst.percussion,
						packId: pack.id,
						family: inst.family,
						installed: true,
					},
					data,
				};
				const prepared_ = await prepareInstrument(ctx, resolved);
				if (!cancelled) {
					setPrepared(prepared_);
				}
			} catch {
				if (!cancelled) {
					setSelectedPackId("builtin");
				}
			} finally {
				preparingRef.current = false;
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [packs, getCtx]);

	// ─── Note playback ──────────────────────────────────────────────────────

	const playNote = useCallback(
		(midi: number) => {
			setActiveKeys((prev) => new Set(prev).add(midi));
			const ctx = getCtx();

			if (prepared?.kind === "sampler") {
				scheduleSamplerNote(
					ctx,
					prepared as PreparedSampler,
					midi,
					velocity,
					ctx.currentTime,
					1.0,
					ctx.destination,
					0.3,
				);
			} else if (prepared?.kind === "soundfont") {
				renderSoundFontNote(
					prepared.data,
					prepared.instrument,
					midi,
					1.0,
					ctx.sampleRate,
				).then((rendered) => {
					const buffer = audioBufferFromChannels(ctx, rendered);
					const source = ctx.createBufferSource();
					source.buffer = buffer;
					source.connect(ctx.destination);
					source.start();
				});
			} else {
				apiClient
					.playPianoNote({ note: midi, duration: 1.0, velocity })
					.then((blob) => {
						const url = URL.createObjectURL(blob);
						const audio = new Audio(url);
						audio.onended = () => URL.revokeObjectURL(url);
						audio.play();
					})
					.catch(showStudioErrorToast);
			}
		},
		[prepared, velocity, getCtx],
	);

	const stopNote = useCallback((midi: number) => {
		setActiveKeys((prev) => {
			const next = new Set(prev);
			next.delete(midi);
			return next;
		});
	}, []);

	// ─── Drum playback ──────────────────────────────────────────────────────

	const playDrum = useCallback(
		(drumType: string) => {
			if (selectedPackId !== "builtin" && prepared?.kind === "soundfont") {
				const ctx = getCtx();
				const percInstrument: InstrumentRef = {
					...prepared.instrument,
					percussion: true,
					bankMSB: 0,
					bankLSB: 0,
					program: 0,
				};
				const drumNote = DRUM_MIDI[drumType] ?? 36;
				renderSoundFontNote(
					prepared.data,
					percInstrument,
					drumNote,
					0.5,
					ctx.sampleRate,
				).then((rendered) => {
					const buffer = audioBufferFromChannels(ctx, rendered);
					const source = ctx.createBufferSource();
					source.buffer = buffer;
					source.connect(ctx.destination);
					source.start();
				});
			} else {
				apiClient
					.playDrumPad({ drum_type: drumType, duration: 0.5, velocity })
					.then((blob) => {
						const url = URL.createObjectURL(blob);
						const audio = new Audio(url);
						audio.onended = () => URL.revokeObjectURL(url);
						audio.play();
					})
					.catch(showStudioErrorToast);
			}
		},
		[selectedPackId, prepared, velocity, getCtx],
	);

	// ─── Copy / paste note patterns ─────────────────────────────────────────

	const copyActiveNotes = useCallback(() => {
		const notes = Array.from(activeKeys)
			.sort((a, b) => a - b)
			.map((midi) => ({ midi, name: noteName(midi), velocity }));
		const pattern = {
			instrument: selectedInstrument?.name ?? "builtin",
			packId: selectedPackId,
			velocity,
			notes,
		};
		navigator.clipboard
			.writeText(JSON.stringify(pattern, null, 2))
			.catch(showStudioErrorToast);
	}, [activeKeys, velocity, selectedInstrument, selectedPackId]);

	const pasteAndPlay = useCallback(async () => {
		try {
			const text = await navigator.clipboard.readText();
			const pattern = JSON.parse(text) as {
				notes?: Array<{ midi: number }>;
			};
			if (pattern.notes) {
				for (const note of pattern.notes) {
					playNote(note.midi);
					await new Promise((r) => setTimeout(r, 80));
					stopNote(note.midi);
				}
			}
		} catch {
			// Clipboard read failed — ignore
		}
	}, [playNote, stopNote]);

	// ─── Computer keyboard mapping ──────────────────────────────────────────

	useEffect(() => {
		const held = new Set<string>();

		function onKeyDown(e: KeyboardEvent) {
			if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) {
				return;
			}
			const key = e.key.toLowerCase();
			if (held.has(key)) {
				return;
			}
			held.add(key);

			const midi = KEYBOARD_MAP[key];
			if (midi !== undefined) {
				e.preventDefault();
				playNote(midi);
				return;
			}
			const drumType = DRUM_MAP[key];
			if (drumType) {
				e.preventDefault();
				playDrum(drumType);
			}
		}

		function onKeyUp(e: KeyboardEvent) {
			const key = e.key.toLowerCase();
			held.delete(key);
			const midi = KEYBOARD_MAP[key];
			if (midi !== undefined) {
				stopNote(midi);
			}
		}

		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
		};
	}, [playNote, stopNote, playDrum]);

	// ─── Import handler ─────────────────────────────────────────────────────

	const handleImport = useCallback(
		async (e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) {
				return;
			}
			try {
				await apiClient.uploadInstrumentPack(
					file,
					file.name.replace(/\.[^.]+$/, ""),
				);
			} catch (err: unknown) {
				showStudioErrorToast(err);
			} finally {
				if (fileInputRef.current) {
					fileInputRef.current.value = "";
				}
			}
		},
		[],
	);

	return (
		<div className="space-y-4">
			<input
				ref={fileInputRef}
				type="file"
				accept=".sf2,.sf3,.sfz,.wav,.ogg,.mp3,.flac,.m4a"
				className="hidden"
				onChange={handleImport}
			/>

			{/* Instrument picker + velocity + actions */}
			<div className="flex flex-wrap items-center gap-3">
				<div className="flex items-center gap-2">
					<Label htmlFor="inst-select" className="text-xs">
						Instrument
					</Label>
					<Select value={selectedPackId} onValueChange={setSelectedPackId}>
						<SelectTrigger
							id="inst-select"
							className="h-8 w-48 text-xs"
							aria-label="Select instrument pack"
						>
							<SelectValue placeholder="Builtin piano" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="builtin">Builtin Piano</SelectItem>
							{(packs ?? []).map((pack) => (
								<SelectItem key={pack.id} value={pack.id}>
									{pack.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				{allInstruments.length > 0 && selectedPackId !== "builtin" && (
					<div className="flex items-center gap-2">
						<Label htmlFor="inst-preset" className="text-xs">
							Preset
						</Label>
						<Select
							value={selectedInstrument?.id ?? ""}
							onValueChange={(val) => {
								const inst = allInstruments.find((i) => i.id === val);
								setSelectedInstrument(inst ?? null);
							}}
						>
							<SelectTrigger
								id="inst-preset"
								className="h-8 w-48 text-xs"
								aria-label="Select instrument preset"
							>
								<SelectValue placeholder="Select preset" />
							</SelectTrigger>
							<SelectContent>
								{allInstruments.map((inst) => (
									<SelectItem key={inst.id} value={inst.id}>
										{inst.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				)}
				<div className="flex items-center gap-2">
					<Label className="text-xs">Velocity</Label>
					<Slider
						min={0.1}
						max={1}
						step={0.01}
						value={[velocity]}
						onValueChange={([v]) => setVelocity(v ?? 0.8)}
						className="w-24"
						aria-label="Note velocity"
					/>
					<span className="w-8 text-xs tabular-nums text-muted-foreground">
						{Math.round(velocity * 127)}
					</span>
				</div>
				<div className="flex items-center gap-1">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-7 px-2 text-xs"
						title="Import instrument pack"
						aria-label="Import instrument pack"
						onClick={() => fileInputRef.current?.click()}
					>
						Import
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-7 px-2 text-xs"
						disabled={activeKeys.size === 0}
						title="Copy active notes to clipboard"
						aria-label="Copy active notes"
						onClick={copyActiveNotes}
					>
						Copy
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-7 px-2 text-xs"
						title="Paste and play note pattern"
						aria-label="Paste and play notes"
						onClick={pasteAndPlay}
					>
						Paste
					</Button>
				</div>
			</div>

			{/* Piano keyboard */}
			<div className="relative flex">
				{WHITE_KEYS.map((midi) => (
					<PianoKey
						key={midi}
						midi={midi}
						isBlack={false}
						onDown={playNote}
						onUp={stopNote}
						isActive={activeKeys.has(midi)}
						velocity={velocity}
					/>
				))}
				{BLACK_KEYS.map((midi, i) => {
					if (midi === -1) {
						return null;
					}
					const whiteIndex =
						i < 2
							? i
							: i === 3
								? 3
								: i === 4
									? 4
									: i === 5
										? 5
										: i === 7
											? 7
											: i === 8
												? 8
												: 9;
					const leftPx = whiteIndex * 36 + 27;
					return (
						<PianoKey
							key={midi}
							midi={midi}
							isBlack
							onDown={playNote}
							onUp={stopNote}
							isActive={activeKeys.has(midi)}
							velocity={velocity}
							style={{ position: "absolute", left: leftPx }}
						/>
					);
				})}
			</div>
			<p className="text-[10px] text-muted-foreground">
				Keyboard: Z-M = C4-B4, Q/E = C5-E5 · Drums: 1-4 / Q-R · Copy/Paste =
				note patterns
			</p>

			{/* Drum pads */}
			<div className="grid grid-cols-4 gap-2">
				{DRUM_PADS.map((pad) => (
					<DrumPadComponent
						key={pad}
						label={pad}
						onTrigger={() => playDrum(pad.toLowerCase())}
					/>
				))}
			</div>
		</div>
	);
}

// ─── Drum Pad component ──────────────────────────────────────────────────────

function DrumPadComponent({
	label,
	onTrigger,
}: {
	label: string;
	onTrigger: () => void;
}) {
	return (
		<button
			type="button"
			className="h-10 rounded-md border border-border bg-card text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground active:scale-95"
			title={`Play ${label}`}
			aria-label={`Play ${label}`}
			onClick={onTrigger}
		>
			{label}
		</button>
	);
}
