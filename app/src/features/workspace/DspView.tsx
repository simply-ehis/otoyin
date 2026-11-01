import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { copyClip, resolveAudioDurationMs } from "@/lib/clip";
import { showStudioErrorToast } from "@/lib/errors";
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
import { ErrorState, ScreenHeader } from "@/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import { useToast } from "@/ui/use-toast";
import { playPreviewBlob } from "./playBlob";

const FALLBACK_SYNTHS = [
	"subtractive",
	"fm",
	"drum",
	"chiptone",
	"pluck",
	"dialup",
	"robot_speech",
];
const FALLBACK_EFFECTS = [
	"vocoder",
	"bitcrush",
	"distortion",
	"tape",
	"filter",
	"delay",
	"phaser",
	"pitch",
	"ringmod",
	"reverb",
	"robotize",
];
const SYNTH_LABELS: Record<string, string> = {
	subtractive: "Subtractive",
	fm: "FM (DX7)",
	drum: "Drum",
	chiptone: "Chip Tone",
	pluck: "Pluck (Karplus)",
	dialup: "Dial-up Modem",
	robot_speech: "Robot Speech",
};
const WAVES = ["sine", "square", "saw", "triangle", "pwm"];
const DRUM_KINDS = ["kick", "snare", "hihat", "clap", "tom", "cymbal"];

function labelOf(id: string) {
	return (
		SYNTH_LABELS[id] ??
		id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, " ")
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

function useCopyClip() {
	const { toast } = useToast();
	return useCallback(
		async (blob: Blob, id: string, name: string) => {
			const url = URL.createObjectURL(blob);
			try {
				const durationMs = await resolveAudioDurationMs(url);
				await copyClip({ kind: "dsp", id, audioUrl: url, name, durationMs });
				toast({ title: "Copied to clipboard" });
			} finally {
				URL.revokeObjectURL(url);
			}
		},
		[toast],
	);
}

function SynthPanel({ synths }: { synths: string[] }) {
	const [type, setType] = useState("subtractive");
	const [freq, setFreq] = useState(220);
	const [duration, setDuration] = useState(1.0);
	const [note, setNote] = useState("C4");
	const [wave, setWave] = useState("saw");
	const [cutoff, setCutoff] = useState(1200);
	const [resonance, setResonance] = useState(1.5);
	const [attack, setAttack] = useState(0.02);
	const [decay, setDecay] = useState(0.1);
	const [sustain, setSustain] = useState(0.7);
	const [release, setRelease] = useState(0.2);
	const [kind, setKind] = useState("kick");
	const [text, setText] = useState("hello world");
	const [algorithm, setAlgorithm] = useState(1);
	const [feedback, setFeedback] = useState(0.0);
	const [lastBlob, setLastBlob] = useState<Blob | null>(null);
	const copyAsClip = useCopyClip();

	const synthMut = useMutation({
		mutationFn: () =>
			apiClient.dspSynth({
				type,
				freq,
				duration,
				note,
				wave,
				cutoff,
				resonance,
				attack,
				decay,
				sustain,
				release,
				kind,
				text,
				algorithm,
				feedback,
			}),
		onSuccess: (blob) => {
			setLastBlob(blob);
			playPreviewBlob(blob);
		},
		onError: (err: unknown) => showStudioErrorToast(err),
	});

	const isRobot = type === "robot_speech";
	const isDrum = type === "drum";
	const isChip = type === "chiptone";
	const isDial = type === "dialup";
	const isPluck = type === "pluck" || type === "fm";
	const showOscillator = !isRobot && !isDrum && !isChip && !isDial;

	return (
		<div className="max-w-xl space-y-3 rounded-md border border-border bg-card p-3">
			<Label htmlFor="dsp-synth">Synthesizer</Label>
			<Select value={type} onValueChange={setType}>
				<SelectTrigger id="dsp-synth" className="h-8 w-full text-xs">
					<SelectValue placeholder="Synth" />
				</SelectTrigger>
				<SelectContent>
					{synths.map((s) => (
						<SelectItem key={s} value={s}>
							{labelOf(s)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			{isRobot ? (
				<div className="space-y-1">
					<Label htmlFor="dsp-robot-text">Text</Label>
					<Textarea
						id="dsp-robot-text"
						className="text-xs"
						rows={2}
						value={text}
						maxLength={200}
						onChange={(e) => setText(e.target.value)}
					/>
				</div>
			) : null}

			{isDrum ? (
				<div className="space-y-1">
					<Label htmlFor="dsp-drum">Drum</Label>
					<Select value={kind} onValueChange={setKind}>
						<SelectTrigger id="dsp-drum" className="h-8 w-full text-xs">
							<SelectValue placeholder="Drum" />
						</SelectTrigger>
						<SelectContent>
							{DRUM_KINDS.map((k) => (
								<SelectItem key={k} value={k}>
									{k}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			) : null}

			{isChip ? (
				<div className="space-y-1">
					<Label htmlFor="dsp-note">Note</Label>
					<Input
						id="dsp-note"
						className="h-8 text-xs"
						value={note}
						onChange={(e) => setNote(e.target.value)}
					/>
				</div>
			) : null}

			{showOscillator ? (
				<SliderRow
					label="Freq (Hz)"
					display={String(freq)}
					min={20}
					max={2000}
					step={1}
					value={freq}
					onChange={setFreq}
				/>
			) : null}
			{showOscillator && !isPluck ? (
				<div className="space-y-1">
					<Label htmlFor="dsp-wave">Wave</Label>
					<Select value={wave} onValueChange={setWave}>
						<SelectTrigger id="dsp-wave" className="h-8 w-full text-xs">
							<SelectValue placeholder="Wave" />
						</SelectTrigger>
						<SelectContent>
							{WAVES.map((w) => (
								<SelectItem key={w} value={w}>
									{w}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			) : null}

			{type === "subtractive" ? (
				<>
					<SliderRow
						label="Cutoff"
						display={String(cutoff)}
						min={50}
						max={12000}
						step={10}
						value={cutoff}
						onChange={setCutoff}
					/>
					<SliderRow
						label="Resonance"
						display={resonance.toFixed(1)}
						min={0}
						max={10}
						step={0.1}
						value={resonance}
						onChange={setResonance}
					/>
					<SliderRow
						label="Attack"
						display={attack.toFixed(2)}
						min={0}
						max={2}
						step={0.01}
						value={attack}
						onChange={setAttack}
					/>
					<SliderRow
						label="Decay"
						display={decay.toFixed(2)}
						min={0}
						max={2}
						step={0.01}
						value={decay}
						onChange={setDecay}
					/>
					<SliderRow
						label="Sustain"
						display={sustain.toFixed(2)}
						min={0}
						max={1}
						step={0.01}
						value={sustain}
						onChange={setSustain}
					/>
					<SliderRow
						label="Release"
						display={release.toFixed(2)}
						min={0}
						max={3}
						step={0.01}
						value={release}
						onChange={setRelease}
					/>
				</>
			) : null}

			{type === "fm" ? (
				<>
					<SliderRow
						label="Algorithm"
						display={String(algorithm)}
						min={1}
						max={5}
						step={1}
						value={algorithm}
						onChange={setAlgorithm}
					/>
					<SliderRow
						label="Feedback"
						display={feedback.toFixed(1)}
						min={0}
						max={5}
						step={0.1}
						value={feedback}
						onChange={setFeedback}
					/>
				</>
			) : null}

			<SliderRow
				label="Duration (s)"
				display={duration.toFixed(2)}
				min={0.05}
				max={5}
				step={0.05}
				value={duration}
				onChange={setDuration}
			/>

			<div className="flex flex-wrap gap-2">
				<Button
					type="button"
					size="sm"
					disabled={synthMut.isPending}
					title="Synthesize and preview"
					aria-label="Synthesize and preview"
					onClick={() => synthMut.mutate()}
				>
					{synthMut.isPending ? <Spinner size="xs" className="mr-1" /> : null}
					Synth & Play
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={!lastBlob}
					title="Copy last result to clipboard"
					aria-label="Copy last result to clipboard"
					onClick={() =>
						lastBlob &&
						void copyAsClip(
							lastBlob,
							`synth-${type}-${Date.now()}`,
							`DSP ${type} ${freq}Hz`,
						)
					}
				>
					Copy as Clip
				</Button>
			</div>
		</div>
	);
}

function EffectsPanel({ effects }: { effects: string[] }) {
	const [type, setType] = useState("robotize");
	const [audioPath, setAudioPath] = useState<string | null>(null);
	const [fileName, setFileName] = useState("");
	const [carrierFreq, setCarrierFreq] = useState(120);
	const [bits, setBits] = useState(8);
	const [drive, setDrive] = useState(3.0);
	const [kind, setKind] = useState("fuzz");
	const [cutoff, setCutoff] = useState(1500);
	const [ftype, setFtype] = useState("lowpass");
	const [time, setTime] = useState(0.25);
	const [feedback, setFeedback] = useState(0.5);
	const [rate, setRate] = useState(0.5);
	const [depth, setDepth] = useState(0.8);
	const [decay, setDecay] = useState(1.2);
	const [wet, setWet] = useState(0.3);
	const [modFreq, setModFreq] = useState(100);
	const [lastBlob, setLastBlob] = useState<Blob | null>(null);
	const copyAsClip = useCopyClip();

	const uploadMut = useMutation({
		mutationFn: (file: Blob) =>
			apiClient.dspUpload(file, fileName || "upload.wav"),
		onSuccess: (res) => setAudioPath(res.audio_path),
		onError: (err: unknown) => showStudioErrorToast(err),
	});

	const effectMut = useMutation({
		mutationFn: () =>
			apiClient.dspEffect({
				type,
				audio_path: audioPath as string,
				carrier_freq: carrierFreq,
				bits,
				drive,
				kind,
				cutoff,
				ftype,
				time,
				feedback,
				rate,
				depth,
				decay,
				wet,
				mod_freq: modFreq,
			}),
		onSuccess: (blob) => {
			setLastBlob(blob);
			playPreviewBlob(blob);
		},
		onError: (err: unknown) => showStudioErrorToast(err),
	});

	const onFile = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const f = e.target.files?.[0];
			if (!f) {
				return;
			}
			setFileName(f.name);
			uploadMut.mutate(f);
		},
		[uploadMut],
	);

	return (
		<div className="max-w-xl space-y-3 rounded-md border border-border bg-card p-3">
			<label
				htmlFor="dsp-upload"
				className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-strong p-4 text-center transition-colors hover:border-muted-foreground focus-within:outline-none focus-within:ring-2 focus-within:ring-ring"
			>
				<input
					id="dsp-upload"
					type="file"
					accept="audio/*"
					className="hidden"
					onChange={onFile}
				/>
				<span className="text-sm font-medium text-foreground">
					{fileName ? `Replace: ${fileName}` : "Upload audio to process"}
				</span>
				<span className="text-xs text-muted-foreground">
					{uploadMut.isPending
						? "Uploading…"
						: audioPath
							? `Ready: ${fileName}`
							: "WAV, MP3, OGG, FLAC"}
				</span>
			</label>

			<div className="space-y-1">
				<Label htmlFor="dsp-effect">Effect</Label>
				<Select value={type} onValueChange={setType}>
					<SelectTrigger id="dsp-effect" className="h-8 w-full text-xs">
						<SelectValue placeholder="Effect" />
					</SelectTrigger>
					<SelectContent>
						{effects.map((ef) => (
							<SelectItem key={ef} value={ef}>
								{ef}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{type === "vocoder" || type === "robotize" ? (
				<SliderRow
					label="Carrier Freq (Hz)"
					display={String(carrierFreq)}
					min={20}
					max={4000}
					step={1}
					value={carrierFreq}
					onChange={setCarrierFreq}
				/>
			) : null}
			{type === "bitcrush" || type === "robotize" ? (
				<SliderRow
					label="Bits"
					display={String(bits)}
					min={1}
					max={16}
					step={1}
					value={bits}
					onChange={setBits}
				/>
			) : null}
			{type === "distortion" ? (
				<div className="space-y-1">
					<Label htmlFor="dsp-dist-kind">Kind</Label>
					<Select value={kind} onValueChange={setKind}>
						<SelectTrigger id="dsp-dist-kind" className="h-8 w-full text-xs">
							<SelectValue placeholder="Kind" />
						</SelectTrigger>
						<SelectContent>
							{["fuzz", "soft", "hard", "tube"].map((k) => (
								<SelectItem key={k} value={k}>
									{k}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<SliderRow
						label="Drive"
						display={drive.toFixed(1)}
						min={1}
						max={20}
						step={0.1}
						value={drive}
						onChange={setDrive}
					/>
				</div>
			) : null}
			{type === "tape" ? (
				<SliderRow
					label="Drive"
					display={drive.toFixed(1)}
					min={1}
					max={20}
					step={0.1}
					value={drive}
					onChange={setDrive}
				/>
			) : null}
			{type === "filter" ? (
				<div className="space-y-1">
					<Label htmlFor="dsp-filter-type">Type</Label>
					<Select value={ftype} onValueChange={setFtype}>
						<SelectTrigger id="dsp-filter-type" className="h-8 w-full text-xs">
							<SelectValue placeholder="Type" />
						</SelectTrigger>
						<SelectContent>
							{["lowpass", "highpass", "bandpass"].map((k) => (
								<SelectItem key={k} value={k}>
									{k}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<SliderRow
						label="Cutoff"
						display={String(cutoff)}
						min={20}
						max={12000}
						step={10}
						value={cutoff}
						onChange={setCutoff}
					/>
				</div>
			) : null}
			{type === "delay" ? (
				<>
					<SliderRow
						label="Time (s)"
						display={time.toFixed(2)}
						min={0}
						max={2}
						step={0.01}
						value={time}
						onChange={setTime}
					/>
					<SliderRow
						label="Feedback"
						display={feedback.toFixed(2)}
						min={0}
						max={0.95}
						step={0.01}
						value={feedback}
						onChange={setFeedback}
					/>
				</>
			) : null}
			{type === "phaser" || type === "pitch" ? (
				<>
					<SliderRow
						label="Rate (Hz)"
						display={rate.toFixed(2)}
						min={0.01}
						max={10}
						step={0.01}
						value={rate}
						onChange={setRate}
					/>
					<SliderRow
						label="Depth"
						display={depth.toFixed(2)}
						min={0}
						max={1}
						step={0.01}
						value={depth}
						onChange={setDepth}
					/>
				</>
			) : null}
			{type === "ringmod" ? (
				<SliderRow
					label="Mod Freq (Hz)"
					display={String(modFreq)}
					min={10}
					max={4000}
					step={1}
					value={modFreq}
					onChange={setModFreq}
				/>
			) : null}
			{type === "reverb" ? (
				<>
					<SliderRow
						label="Decay (s)"
						display={decay.toFixed(1)}
						min={0.1}
						max={6}
						step={0.1}
						value={decay}
						onChange={setDecay}
					/>
					<SliderRow
						label="Wet"
						display={wet.toFixed(2)}
						min={0}
						max={1}
						step={0.01}
						value={wet}
						onChange={setWet}
					/>
				</>
			) : null}

			<div className="flex flex-wrap gap-2">
				<Button
					type="button"
					size="sm"
					disabled={effectMut.isPending || !audioPath}
					title="Apply effect and preview"
					aria-label="Apply effect and preview"
					onClick={() => effectMut.mutate()}
				>
					{effectMut.isPending ? <Spinner size="xs" className="mr-1" /> : null}
					Apply & Play
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={!lastBlob}
					title="Copy last result to clipboard"
					aria-label="Copy last result to clipboard"
					onClick={() =>
						lastBlob &&
						void copyAsClip(
							lastBlob,
							`effect-${type}-${Date.now()}`,
							`DSP ${type}`,
						)
					}
				>
					Copy as Clip
				</Button>
			</div>
		</div>
	);
}

export function DspView() {
	const capsQuery = useQuery({
		queryKey: ["dsp-capabilities"],
		queryFn: () => apiClient.dspCapabilities(),
		staleTime: 5 * 60 * 1000,
	});
	const synths = capsQuery.data?.synthesizers.length
		? capsQuery.data.synthesizers
		: FALLBACK_SYNTHS;
	const effects = capsQuery.data?.effects.length
		? capsQuery.data.effects
		: FALLBACK_EFFECTS;

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader title="Synth / DSP" />
			{capsQuery.isError ? (
				<ErrorState
					title="Engine list couldn't load"
					body="Showing the built-in synth and effect list instead."
					onRetry={() => void capsQuery.refetch()}
				/>
			) : null}
			<Tabs defaultValue="synth" className="w-full max-w-4xl">
				<TabsList aria-label="DSP sections">
					<TabsTrigger value="synth">Synth</TabsTrigger>
					<TabsTrigger value="effects">Effects</TabsTrigger>
				</TabsList>
				<TabsContent value="synth">
					<SynthPanel synths={synths} />
				</TabsContent>
				<TabsContent value="effects">
					<EffectsPanel effects={effects} />
				</TabsContent>
			</Tabs>
		</div>
	);
}
