import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { RecordTakeButton } from "@/features/capture/RecordTakeButton";
import { apiClient } from "@/lib/api/client";
import {
	ERR_DESC_PLAYBACK_FAILED,
	ERR_DESC_SFX_FAILED,
	ERR_TITLE_PLAYBACK,
	ERR_TITLE_SFX,
} from "@/lib/errorMessages";
import { Button } from "@/ui/button";
import { Input, Textarea } from "@/ui/input";
import { Label, Spinner } from "@/ui/primitives";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { Slider } from "@/ui/slider";
import { ScreenHeader } from "@/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import { useToast } from "@/ui/use-toast";
import { playPreviewBlob } from "./playBlob";

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

const WAVEFORMS = ["sine", "sawtooth", "square", "triangle", "noise"];
const NOISE_TYPES = ["white", "pink", "brown", "blue", "violet"];
const OCTAVE_KEYS = [60, 62, 64, 65, 67, 69, 71, 72];

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="space-y-3 rounded-md border border-border bg-card p-3">
			<h2 className="text-xs font-medium text-muted-foreground">{title}</h2>
			{children}
		</section>
	);
}

function SliderRow({
	label,
	display,
	min,
	max,
	step,
	value,
	onChange,
}: {
	label: string;
	display: string;
	min: number;
	max: number;
	step: number;
	value: number;
	onChange: (v: number) => void;
}) {
	return (
		<div className="space-y-1">
			<div className="flex items-center justify-between gap-2">
				<Label>{label}</Label>
				<span className="text-xs tabular-nums text-muted-foreground">
					{display}
				</span>
			</div>
			<Slider
				min={min}
				max={max}
				step={step}
				value={[value]}
				onValueChange={([v]) => onChange(v ?? value)}
				aria-label={label}
			/>
		</div>
	);
}

function InstrumentsPanel() {
	const { toast } = useToast();
	const [waveform, setWaveform] = useState("sine");
	const [adsr, setAdsr] = useState({
		attack: 0.1,
		decay: 0.2,
		sustain: 0.7,
		release: 0.3,
	});
	const [gmProgram, setGmProgram] = useState(0);

	function playbackError() {
		toast({
			title: ERR_TITLE_PLAYBACK,
			description: ERR_DESC_PLAYBACK_FAILED,
			variant: "destructive",
		});
	}

	const pianoMut = useMutation({
		mutationFn: (note: number) =>
			apiClient.playPianoNote({ note, duration: 1.0, velocity: 0.8 }),
		onSuccess: (blob) => playPreviewBlob(blob),
		onError: playbackError,
	});
	const drumMut = useMutation({
		mutationFn: (drumType: string) =>
			apiClient.playDrumPad({
				drum_type: drumType,
				duration: 0.5,
				velocity: 0.8,
			}),
		onSuccess: (blob) => playPreviewBlob(blob),
		onError: playbackError,
	});
	const synthMut = useMutation({
		mutationFn: (note: number) =>
			apiClient.playSynthNote({ note, duration: 1.0, waveform, velocity: 0.8 }),
		onSuccess: (blob) => playPreviewBlob(blob),
		onError: playbackError,
	});
	const gmMut = useMutation({
		mutationFn: (note: number) =>
			apiClient.playGMInstrument({
				program: gmProgram,
				note,
				duration: 1.0,
				velocity: 0.8,
			}),
		onSuccess: (blob) => playPreviewBlob(blob),
		onError: () =>
			toast({
				title: "GM instrument needs a SoundFont",
				variant: "destructive",
			}),
	});
	const drumMachineMut = useMutation({
		mutationFn: () =>
			apiClient.playDrumMachine({
				pattern: ["kick", "hihat", "snare", "hihat"],
				step_duration: 0.125,
				bars: 1,
				velocity: 0.8,
			}),
		onSuccess: (blob) => playPreviewBlob(blob),
		onError: () =>
			toast({
				title: ERR_TITLE_SFX,
				description: ERR_DESC_SFX_FAILED,
				variant: "destructive",
			}),
	});

	return (
		<div className="space-y-4">
			<Section title="Piano Keyboard">
				<div className="flex flex-wrap gap-2">
					{OCTAVE_KEYS.map((midi) => (
						<Button
							key={midi}
							type="button"
							variant="outline"
							className="h-16 w-11 flex-col gap-1 text-xs"
							disabled={pianoMut.isPending}
							title={`Play note ${midi}`}
							aria-label={`Play note ${midi}`}
							onClick={() => pianoMut.mutate(midi)}
						>
							<span
								aria-hidden="true"
								className="text-[10px] text-muted-foreground"
							>
								{midi}
							</span>
						</Button>
					))}
				</div>
			</Section>

			<Section title="Drum Pads">
				<div className="grid grid-cols-4 gap-2">
					{DRUM_PADS.map((pad) => (
						<Button
							key={pad}
							type="button"
							variant="outline"
							className="h-12 text-xs"
							disabled={drumMut.isPending}
							title={`Play ${pad}`}
							aria-label={`Play ${pad}`}
							onClick={() => drumMut.mutate(pad.toLowerCase())}
						>
							{pad}
						</Button>
					))}
				</div>
			</Section>

			<Section title="Synth Controls">
				<Select value={waveform} onValueChange={setWaveform}>
					<SelectTrigger className="h-8 w-36 text-xs" aria-label="Waveform">
						<SelectValue placeholder="Waveform" />
					</SelectTrigger>
					<SelectContent>
						{WAVEFORMS.map((w) => (
							<SelectItem key={w} value={w}>
								{w.charAt(0).toUpperCase() + w.slice(1)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{(["attack", "decay", "sustain", "release"] as const).map((param) => (
					<SliderRow
						key={param}
						label={param.charAt(0).toUpperCase() + param.slice(1)}
						display={adsr[param].toFixed(2)}
						min={0}
						max={param === "attack" || param === "decay" ? 2 : 1}
						step={0.01}
						value={adsr[param]}
						onChange={(v) => setAdsr({ ...adsr, [param]: v })}
					/>
				))}
				<Button
					type="button"
					size="sm"
					disabled={synthMut.isPending}
					title="Play synth note"
					aria-label="Play synth note"
					onClick={() => synthMut.mutate(OCTAVE_KEYS[3] ?? 65)}
				>
					{synthMut.isPending ? <Spinner size="xs" className="mr-1" /> : null}
					Play Synth
				</Button>
			</Section>

			<Section title="General MIDI Instrument">
				<div className="flex flex-wrap items-center gap-2">
					<Label htmlFor="gm-program">Program</Label>
					<Input
						id="gm-program"
						type="number"
						min={0}
						max={127}
						value={gmProgram}
						onChange={(e) => setGmProgram(Number(e.target.value) || 0)}
						className="h-8 w-20 text-xs"
					/>
					<span className="text-xs text-muted-foreground">
						0 piano · 32 bass · 40 strings · 56 trumpet · 73 pad
					</span>
				</div>
				<div className="flex flex-wrap gap-2">
					{OCTAVE_KEYS.map((midi) => (
						<Button
							key={midi}
							type="button"
							variant="outline"
							className="size-9 text-xs"
							disabled={gmMut.isPending}
							title={`Play GM note ${midi}`}
							aria-label={`Play GM note ${midi}`}
							onClick={() => gmMut.mutate(midi)}
						>
							{midi}
						</Button>
					))}
				</div>
			</Section>

			<Section title="Drum Machine Loop">
				<Button
					type="button"
					size="sm"
					disabled={drumMachineMut.isPending}
					title="Render a 1-bar drum loop"
					aria-label="Render drum machine loop"
					onClick={() => drumMachineMut.mutate()}
				>
					{drumMachineMut.isPending ? (
						<Spinner size="xs" className="mr-1" />
					) : null}
					Play 1-Bar Loop
				</Button>
			</Section>

			<Section title="Record a take">
				<p className="text-xs text-muted-foreground">
					Play along with anything above, or record a line to keep.
				</p>
				<RecordTakeButton filenameBase="studio-take" />
			</Section>
		</div>
	);
}

function SfxPanel() {
	const { toast } = useToast();
	const [prompt, setPrompt] = useState("");
	const mut = useMutation({
		mutationFn: () => apiClient.generateSFX({ prompt, duration_seconds: 5 }),
		onSuccess: (blob) => playPreviewBlob(blob),
		onError: () =>
			toast({
				title: ERR_TITLE_SFX,
				description: ERR_DESC_SFX_FAILED,
				variant: "destructive",
			}),
	});

	return (
		<div className="max-w-xl space-y-3">
			<Label htmlFor="sfx-prompt">Describe the sound effect</Label>
			<Textarea
				id="sfx-prompt"
				placeholder="Rain on a tin roof, distant thunder"
				value={prompt}
				onChange={(e) => setPrompt(e.target.value)}
				className="min-h-24 text-sm"
			/>
			<Button
				type="button"
				size="sm"
				disabled={!prompt.trim() || mut.isPending}
				title="Generate sound effect"
				aria-label="Generate sound effect"
				onClick={() => mut.mutate()}
			>
				{mut.isPending ? <Spinner size="xs" className="mr-1" /> : null}
				{mut.isPending ? "Generating…" : "Generate with Stable Audio Open"}
			</Button>
		</div>
	);
}

function NoisePanel() {
	const { toast } = useToast();
	const [type, setType] = useState("white");
	const mut = useMutation({
		mutationFn: () =>
			apiClient.generateNoise({
				noise_type: type,
				duration: 3,
				amplitude: 0.5,
			}),
		onSuccess: (blob) => playPreviewBlob(blob),
		onError: () =>
			toast({ title: "Noise generation failed", variant: "destructive" }),
	});

	return (
		<div className="max-w-xl space-y-3">
			<Label htmlFor="noise-type">Noise color</Label>
			<Select value={type} onValueChange={setType}>
				<SelectTrigger id="noise-type" className="h-8 w-44 text-xs">
					<SelectValue placeholder="Noise type" />
				</SelectTrigger>
				<SelectContent>
					{NOISE_TYPES.map((n) => (
						<SelectItem key={n} value={n}>
							{n.charAt(0).toUpperCase() + n.slice(1)} noise
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Button
				type="button"
				size="sm"
				disabled={mut.isPending}
				title="Generate noise"
				aria-label="Generate noise"
				onClick={() => mut.mutate()}
			>
				{mut.isPending ? <Spinner size="xs" className="mr-1" /> : null}
				{mut.isPending ? "Generating…" : "Generate"}
			</Button>
		</div>
	);
}

export function StudioView() {
	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader
				title="Studio"
				description="Synthesize, sequence, and design sound"
			/>
			<Tabs defaultValue="instruments">
				<TabsList aria-label="Studio sections">
					<TabsTrigger value="instruments">Instruments</TabsTrigger>
					<TabsTrigger value="sfx">SFX</TabsTrigger>
					<TabsTrigger value="noise">Noise</TabsTrigger>
				</TabsList>
				<TabsContent value="instruments">
					<InstrumentsPanel />
				</TabsContent>
				<TabsContent value="sfx">
					<SfxPanel />
				</TabsContent>
				<TabsContent value="noise">
					<NoisePanel />
				</TabsContent>
			</Tabs>
		</div>
	);
}
