import {
	MusicalNoteIcon as Music,
	SparklesIcon as Wand2,
	BoltIcon as Waves,
} from "@heroicons/react/24/outline";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Spinner } from "@/components/ui/Spinner";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import {
	ERR_DESC_PLAYBACK_FAILED,
	ERR_DESC_SFX_FAILED,
	ERR_TITLE_PLAYBACK,
	ERR_TITLE_SFX,
} from "@/lib/errorMessages";
import { showStudioErrorToast } from "@/lib/errors";
import { cn } from "@/lib/utils/cn";

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

function playAudio(blob: Blob) {
	const url = URL.createObjectURL(blob);
	const audio = new Audio(url);
	audio.play().catch((err) => {
		URL.revokeObjectURL(url);
		showStudioErrorToast(err);
	});
	audio.onended = () => URL.revokeObjectURL(url);
}

function InstrumentsTab() {
	const { toast } = useToast();
	const [waveform, setWaveform] = useState("sine");
	const [adsr, setAdsr] = useState({
		attack: 0.1,
		decay: 0.2,
		sustain: 0.7,
		release: 0.3,
	});
	const activeKeys = [60, 62, 64, 65, 67, 69, 71, 72];

	const pianoMut = useMutation({
		mutationFn: (note: number) =>
			apiClient.playPianoNote({ note, duration: 1.0, velocity: 0.8 }),
	});
	const drumMut = useMutation({
		mutationFn: (drumType: string) =>
			apiClient.playDrumPad({
				drum_type: drumType,
				duration: 0.5,
				velocity: 0.8,
			}),
	});
	const synthMut = useMutation({
		mutationFn: (note: number) =>
			apiClient.playSynthNote({ note, duration: 1.0, waveform, velocity: 0.8 }),
	});
	const [gmProgram, setGmProgram] = useState(0);
	const gmMut = useMutation({
		mutationFn: (note: number) =>
			apiClient.playGMInstrument({
				program: gmProgram,
				note,
				duration: 1.0,
				velocity: 0.8,
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
	});

	const playPiano = useCallback(
		(midi: number) => {
			pianoMut.mutate(midi, {
				onSuccess: playAudio,
				onError: () =>
					toast({
						title: ERR_TITLE_PLAYBACK,
						description: ERR_DESC_PLAYBACK_FAILED,
						variant: "destructive",
					}),
			});
		},
		[pianoMut, toast],
	);

	const playDrum = useCallback(
		(pad: string) => {
			drumMut.mutate(pad.toLowerCase(), {
				onSuccess: playAudio,
				onError: () =>
					toast({
						title: ERR_TITLE_PLAYBACK,
						description: ERR_DESC_PLAYBACK_FAILED,
						variant: "destructive",
					}),
			});
		},
		[drumMut, toast],
	);

	const playSynth = useCallback(
		(midi: number) => {
			synthMut.mutate(midi, {
				onSuccess: playAudio,
				onError: () =>
					toast({
						title: ERR_TITLE_PLAYBACK,
						description: ERR_DESC_PLAYBACK_FAILED,
						variant: "destructive",
					}),
			});
		},
		[synthMut, toast],
	);

	return (
		<div className="space-y-4">
			{/* Piano keys */}
			<div className="rounded-lg border border-border bg-card p-3">
				<p className="text-xs font-medium text-muted-foreground mb-2">
					Piano Keyboard
				</p>
				<div className="flex">
					{activeKeys.map((midi) => {
						const black = [61, 63, 66, 68, 70].includes(midi);
						return (
							<button
								type="button"
								key={midi}
								className={cn(
									"border border-border/50 transition-colors",
									black
										? "h-16 w-6 bg-zinc-800 -mx-3 z-10 rounded-b-md hover:bg-zinc-600"
										: "h-24 w-9 bg-card rounded-b-md hover:bg-accent/10",
								)}
								onClick={() => playPiano(midi)}
								title={`Note ${midi}`}
								aria-label={`Play note ${midi}`}
							/>
						);
					})}
				</div>
			</div>

			{/* Drum pads */}
			<div className="rounded-lg border border-border bg-card p-3">
				<p className="text-xs font-medium text-muted-foreground mb-2">
					Drum Pads
				</p>
				<div className="grid grid-cols-4 gap-2">
					{DRUM_PADS.map((pad) => (
						<button
							type="button"
							key={pad}
							className="h-12 rounded-md bg-muted text-xs font-medium text-foreground hover:bg-accent/20 active:bg-accent/40 transition-colors border border-border/50"
							onClick={() => playDrum(pad)}
							title={`Play ${pad}`}
							aria-label={`Play ${pad}`}
						>
							{pad}
						</button>
					))}
				</div>
			</div>

			{/* Synth controls */}
			<div className="rounded-lg border border-border bg-card p-3 space-y-3">
				<p className="text-xs font-medium text-muted-foreground">
					Synth Controls
				</p>
				<Select value={waveform} onValueChange={setWaveform}>
					<SelectTrigger className="h-8 text-xs w-32">
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
					<div key={param} className="space-y-1">
						<Label className="text-xs text-muted-foreground capitalize">
							{param}
						</Label>
						<Slider
							min={0}
							max={1}
							step={0.01}
							value={[adsr[param]]}
							onValueChange={([v]) => setAdsr({ ...adsr, [param]: v })}
						/>
					</div>
				))}
				<Button
					size="sm"
					onClick={() => playSynth(activeKeys[3])}
					title="Play synth note"
					aria-label="Play synth note"
				>
					{synthMut.isPending ? <Spinner size="md" className="mr-1" /> : null}
					Play Synth
				</Button>
			</div>

			{/* General MIDI instrument */}
			<div className="rounded-lg border border-border bg-card p-3 space-y-3">
				<p className="text-xs font-medium text-muted-foreground">
					General MIDI Instrument
				</p>
				<div className="flex items-center gap-2">
					<Label className="text-xs text-muted-foreground">Program</Label>
					<Input
						type="number"
						min={0}
						max={127}
						value={gmProgram}
						onChange={(e) => setGmProgram(Number(e.target.value) || 0)}
						className="h-8 w-20 text-xs"
					/>
					<span className="text-xs text-muted-foreground">
						(0 piano, 32 bass, 40 strings, 56 trumpet, 73 pad)
					</span>
				</div>
				<div className="flex flex-wrap gap-2">
					{activeKeys.map((midi) => (
						<button
							type="button"
							key={midi}
							className="size-9 rounded-md bg-muted text-xs font-medium hover:bg-accent/20 active:bg-accent/40 transition-colors border border-border/50"
							onClick={() =>
								gmMut.mutate(midi, {
									onSuccess: playAudio,
									onError: () =>
										toast({
											title: "GM instrument needs a SoundFont",
											variant: "destructive",
										}),
								})
							}
							title={`Play GM note ${midi}`}
							aria-label={`Play GM note ${midi}`}
						>
							{midi}
						</button>
					))}
				</div>
			</div>

			{/* Drum machine loop */}
			<div className="rounded-lg border border-border bg-card p-3 space-y-3">
				<p className="text-xs font-medium text-muted-foreground">
					Drum Machine Loop
				</p>
				<Button
					size="sm"
					onClick={() =>
						drumMachineMut.mutate(undefined, {
							onSuccess: playAudio,
							onError: () =>
								toast({
									title: ERR_TITLE_SFX,
									description: ERR_DESC_SFX_FAILED,
									variant: "destructive",
								}),
						})
					}
					title="Render a 1-bar drum loop"
					aria-label="Render drum machine loop"
				>
					{drumMachineMut.isPending ? (
						<Spinner size="md" className="mr-1" />
					) : null}
					Play 1-Bar Loop
				</Button>
			</div>
		</div>
	);
}

function SFXTab() {
	const { toast } = useToast();
	const [prompt, setPrompt] = useState("");
	const mut = useMutation({
		mutationFn: () => apiClient.generateSFX({ prompt, duration_seconds: 5 }),
	});

	return (
		<div className="space-y-3">
			<Textarea
				placeholder="Describe the sound effect"
				value={prompt}
				onChange={(e) => setPrompt(e.target.value)}
				className="min-h-[100px] text-sm"
			/>
			<Button
				size="sm"
				disabled={!prompt.trim() || mut.isPending}
				title="Generate sound effect"
				aria-label="Generate sound effect"
				onClick={() =>
					mut.mutate(undefined, {
						onSuccess: playAudio,
						onError: () =>
							toast({
								title: ERR_TITLE_SFX,
								description: ERR_DESC_SFX_FAILED,
								variant: "destructive",
							}),
					})
				}
			>
				{mut.isPending ? (
					<Spinner size="md" className="mr-1" />
				) : (
					<Wand2 className="size-4 mr-1" />
				)}
				{mut.isPending ? "Generating..." : "Generate with Stable Audio Open"}
			</Button>
		</div>
	);
}

function NoiseTab() {
	const { toast } = useToast();
	const [type, setType] = useState("white");
	const mut = useMutation({
		mutationFn: () =>
			apiClient.generateNoise({
				noise_type: type,
				duration: 3,
				amplitude: 0.5,
			}),
	});

	return (
		<div className="space-y-3">
			<Select value={type} onValueChange={setType}>
				<SelectTrigger className="h-8 text-xs w-32">
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
				size="sm"
				disabled={mut.isPending}
				title="Generate noise"
				aria-label="Generate noise"
				onClick={() =>
					mut.mutate(undefined, {
						onSuccess: playAudio,
						onError: () =>
							toast({
								title: "Noise generation failed",
								variant: "destructive",
							}),
					})
				}
			>
				{mut.isPending ? (
					<Spinner size="md" className="mr-1" />
				) : (
					<Waves className="size-4 mr-1" />
				)}
				{mut.isPending ? "Generating..." : "Generate"}
			</Button>
		</div>
	);
}

export function StudioView() {
	return (
		<div className="flex flex-col h-full p-4">
			<ScreenHeader
				icon={<Music className="size-5" />}
				title="Studio"
				description="Synthesize, sequence, and design sound"
			/>
			<Tabs defaultValue="instruments" className="flex flex-col h-full">
				<TabsList className="grid grid-cols-3 mb-4">
					<TabsTrigger
						value="instruments"
						title="Instruments"
						aria-label="Instruments tab"
					>
						<Music className="h-3.5 w-3.5 mr-1" />
						Instruments
					</TabsTrigger>
					<TabsTrigger value="sfx" title="SFX" aria-label="SFX tab">
						<Wand2 className="h-3.5 w-3.5 mr-1" />
						SFX
					</TabsTrigger>
					<TabsTrigger value="noise" title="Noise" aria-label="Noise tab">
						<Waves className="h-3.5 w-3.5 mr-1" />
						Noise
					</TabsTrigger>
				</TabsList>

				<TabsContent
					value="instruments"
					className="flex-1 overflow-y-auto mt-0"
				>
					<InstrumentsTab />
				</TabsContent>
				<TabsContent value="sfx" className="flex-1 mt-0">
					<SFXTab />
				</TabsContent>
				<TabsContent value="noise" className="flex-1 mt-0">
					<NoiseTab />
				</TabsContent>
			</Tabs>
		</div>
	);
}
