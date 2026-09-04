import {
	CommandLineIcon as Cpu,
	MusicalNoteIcon as Music,
	DocumentArrowUpIcon as Upload,
	SpeakerWaveIcon as Volume2,
} from "@heroicons/react/24/outline";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
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
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import { copyClip, resolveAudioDurationMs } from "@/lib/clip";

const SYNTHS = [
	{ id: "subtractive", name: "Subtractive" },
	{ id: "fm", name: "FM (DX7)" },
	{ id: "drum", name: "Drum" },
	{ id: "chiptone", name: "Chip Tone" },
	{ id: "pluck", name: "Pluck (Karplus)" },
	{ id: "dialup", name: "Dial-up Modem" },
	{ id: "robot_speech", name: "Robot Speech" },
];

const WAVES = ["sine", "square", "saw", "triangle", "pwm"];
const DRUM_KINDS = ["kick", "snare", "hihat", "clap", "tom", "cymbal"];
const EFFECTS = [
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

import { showStudioErrorToast } from "@/lib/errors";

function playAudio(blob: Blob) {
	const url = URL.createObjectURL(blob);
	const audio = new Audio(url);
	audio.play().catch((err) => {
		URL.revokeObjectURL(url);
		showStudioErrorToast(err);
	});
	audio.onended = () => URL.revokeObjectURL(url);
}

function SliderRow({
	label,
	value,
	min,
	max,
	step,
	onChange,
	fmt,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	onChange: (v: number) => void;
	fmt?: (v: number) => string;
}) {
	return (
		<div className="space-y-1">
			<div className="flex items-center justify-between">
				<Label className="text-xs text-muted-foreground capitalize">
					{label}
				</Label>
				<span className="text-xs tabular-nums text-muted-foreground">
					{fmt ? fmt(value) : value}
				</span>
			</div>
			<Slider
				min={min}
				max={max}
				step={step}
				value={[value]}
				onValueChange={([v]) => onChange(v)}
			/>
		</div>
	);
}

function SynthTab() {
	const { toast } = useToast();
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
			playAudio(blob);
		},
		onError: (err: unknown) => showStudioErrorToast(err),
	});

	const copyAsClip = useCallback(async () => {
		if (!lastBlob) {
			return;
		}
		const url = URL.createObjectURL(lastBlob);
		try {
			const durationMs = await resolveAudioDurationMs(url);
			await copyClip({
				kind: "dsp",
				id: `synth-${type}-${Date.now()}`,
				audioUrl: url,
				name: `DSP ${type} ${freq}Hz`,
				durationMs,
			});
			toast({ title: "Copied to clipboard" });
		} finally {
			URL.revokeObjectURL(url);
		}
	}, [lastBlob, type, freq, toast]);

	const isRobot = type === "robot_speech";
	const isDrum = type === "drum";
	const isChip = type === "chiptone";
	const isDial = type === "dialup";
	const isPluck = type === "pluck" || type === "fm";

	return (
		<div className="space-y-4">
			<div className="rounded-lg border border-border bg-card p-3 space-y-3">
				<Select value={type} onValueChange={setType}>
					<SelectTrigger className="h-8 text-xs w-full">
						<SelectValue placeholder="Synth" />
					</SelectTrigger>
					<SelectContent>
						{SYNTHS.map((s) => (
							<SelectItem key={s.id} value={s.id}>
								{s.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				{isRobot ? (
					<div className="space-y-1">
						<Label className="text-xs text-muted-foreground">Text</Label>
						<textarea
							className="w-full rounded-md border border-border bg-background p-2 text-xs text-foreground"
							rows={2}
							value={text}
							maxLength={200}
							onChange={(e) => setText(e.target.value)}
						/>
					</div>
				) : null}

				{isDrum ? (
					<Select value={kind} onValueChange={setKind}>
						<SelectTrigger className="h-8 text-xs w-full">
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
				) : null}

				{isChip ? (
					<div className="space-y-1">
						<Label className="text-xs text-muted-foreground">Note</Label>
						<Input
							className="h-8 text-xs"
							value={note}
							onChange={(e) => setNote(e.target.value)}
						/>
					</div>
				) : null}

				{!isRobot && !isDrum && !isChip && !isDial ? (
					<SliderRow
						label="Freq (Hz)"
						value={freq}
						min={20}
						max={2000}
						step={1}
						onChange={setFreq}
					/>
				) : null}
				{!isRobot && !isDrum && !isChip && !isDial && !isPluck ? (
					<Select value={wave} onValueChange={setWave}>
						<SelectTrigger className="h-8 text-xs w-full">
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
				) : null}

				{type === "subtractive" ? (
					<>
						<SliderRow
							label="Cutoff"
							value={cutoff}
							min={50}
							max={12000}
							step={10}
							onChange={setCutoff}
						/>
						<SliderRow
							label="Resonance"
							value={resonance}
							min={0}
							max={10}
							step={0.1}
							onChange={setResonance}
						/>
						<SliderRow
							label="Attack"
							value={attack}
							min={0}
							max={2}
							step={0.01}
							onChange={setAttack}
						/>
						<SliderRow
							label="Decay"
							value={decay}
							min={0}
							max={2}
							step={0.01}
							onChange={setDecay}
						/>
						<SliderRow
							label="Sustain"
							value={sustain}
							min={0}
							max={1}
							step={0.01}
							onChange={setSustain}
						/>
						<SliderRow
							label="Release"
							value={release}
							min={0}
							max={3}
							step={0.01}
							onChange={setRelease}
						/>
					</>
				) : null}

				{type === "fm" ? (
					<>
						<SliderRow
							label="Algorithm"
							value={algorithm}
							min={1}
							max={5}
							step={1}
							onChange={setAlgorithm}
						/>
						<SliderRow
							label="Feedback"
							value={feedback}
							min={0}
							max={5}
							step={0.1}
							onChange={setFeedback}
						/>
					</>
				) : null}

				<SliderRow
					label="Duration (s)"
					value={duration}
					min={0.05}
					max={5}
					step={0.05}
					onChange={setDuration}
					fmt={(v) => v.toFixed(2)}
				/>

				<div className="flex gap-2">
					<Button
						size="sm"
						onClick={() => synthMut.mutate()}
						disabled={synthMut.isPending}
						title="Synthesize & preview"
						aria-label="Synthesize and preview"
					>
						{synthMut.isPending ? (
							<Spinner size="md" className="mr-1" />
						) : (
							<Music className="size-4 mr-1" />
						)}
						Synth & Play
					</Button>
					<Button
						size="sm"
						variant="outline"
						onClick={copyAsClip}
						disabled={!lastBlob}
						title="Copy last result to clipboard"
						aria-label="Copy last result to clipboard"
					>
						Copy as Clip
					</Button>
				</div>
			</div>
		</div>
	);
}

function EffectsTab() {
	const { toast } = useToast();
	const fileRef = useRef<HTMLInputElement>(null);
	const [type, setType] = useState("robotize");
	const [audioPath, setAudioPath] = useState<string | null>(null);
	const [fileName, setFileName] = useState<string>("");
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

	const uploadMut = useMutation({
		mutationFn: (file: Blob) =>
			apiClient.dspUpload(file, fileName || "upload.wav"),
		onSuccess: (res) => {
			setAudioPath(res.audio_path);
			toast({ title: "Audio uploaded" });
		},
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
			playAudio(blob);
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

	const copyAsClip = useCallback(async () => {
		if (!lastBlob) {
			return;
		}
		const url = URL.createObjectURL(lastBlob);
		try {
			const durationMs = await resolveAudioDurationMs(url);
			await copyClip({
				kind: "dsp",
				id: `effect-${type}-${Date.now()}`,
				audioUrl: url,
				name: `DSP ${type}`,
				durationMs,
			});
			toast({ title: "Copied to clipboard" });
		} finally {
			URL.revokeObjectURL(url);
		}
	}, [lastBlob, type, toast]);

	return (
		<div className="space-y-4">
			<div className="rounded-lg border border-border bg-card p-3 space-y-3">
				<input
					ref={fileRef}
					type="file"
					accept="audio/*"
					className="hidden"
					onChange={onFile}
				/>
				<Button
					size="sm"
					variant="outline"
					onClick={() => fileRef.current?.click()}
					title="Upload audio to process"
					aria-label="Upload audio to process"
				>
					<Upload className="size-4 mr-1" />
					{fileName ? `Replace: ${fileName}` : "Upload Audio"}
				</Button>
				{uploadMut.isPending ? <Spinner size="md" /> : null}
				{audioPath ? (
					<p className="text-xs text-emerald-500">
						Audio ready: {fileName}
					</p>
				) : (
					<p className="text-xs text-muted-foreground">
						Upload a clip, then apply an offline DSP effect.
					</p>
				)}

				<Select value={type} onValueChange={setType}>
					<SelectTrigger className="h-8 text-xs w-full">
						<SelectValue placeholder="Effect" />
					</SelectTrigger>
					<SelectContent>
						{EFFECTS.map((ef) => (
							<SelectItem key={ef} value={ef}>
								{ef}
							</SelectItem>
						))}
					</SelectContent>
				</Select>

				{type === "vocoder" || type === "robotize" ? (
					<SliderRow
						label="Carrier Freq (Hz)"
						value={carrierFreq}
						min={20}
						max={4000}
						step={1}
						onChange={setCarrierFreq}
					/>
				) : null}
				{type === "bitcrush" || type === "robotize" ? (
					<SliderRow
						label="Bits"
						value={bits}
						min={1}
						max={16}
						step={1}
						onChange={setBits}
					/>
				) : null}
				{type === "distortion" ? (
					<>
						<Select value={kind} onValueChange={setKind}>
							<SelectTrigger className="h-8 text-xs w-full">
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
							value={drive}
							min={1}
							max={20}
							step={0.1}
							onChange={setDrive}
						/>
					</>
				) : null}
				{type === "tape" ? (
					<SliderRow
						label="Drive"
						value={drive}
						min={1}
						max={20}
						step={0.1}
						onChange={setDrive}
					/>
				) : null}
				{type === "filter" ? (
					<>
						<Select value={ftype} onValueChange={setFtype}>
							<SelectTrigger className="h-8 text-xs w-full">
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
							value={cutoff}
							min={20}
							max={12000}
							step={10}
							onChange={setCutoff}
						/>
					</>
				) : null}
				{type === "delay" ? (
					<>
						<SliderRow
							label="Time (s)"
							value={time}
							min={0}
							max={2}
							step={0.01}
							onChange={setTime}
							fmt={(v) => v.toFixed(2)}
						/>
						<SliderRow
							label="Feedback"
							value={feedback}
							min={0}
							max={0.95}
							step={0.01}
							onChange={setFeedback}
						/>
					</>
				) : null}
				{type === "phaser" || type === "pitch" ? (
					<>
						<SliderRow
							label="Rate (Hz)"
							value={rate}
							min={0.01}
							max={10}
							step={0.01}
							onChange={setRate}
							fmt={(v) => v.toFixed(2)}
						/>
						<SliderRow
							label="Depth"
							value={depth}
							min={0}
							max={1}
							step={0.01}
							onChange={setDepth}
						/>
					</>
				) : null}
				{type === "ringmod" ? (
					<SliderRow
						label="Mod Freq (Hz)"
						value={modFreq}
						min={10}
						max={4000}
						step={1}
						onChange={setModFreq}
					/>
				) : null}
				{type === "reverb" ? (
					<>
						<SliderRow
							label="Decay (s)"
							value={decay}
							min={0.1}
							max={6}
							step={0.1}
							onChange={setDecay}
							fmt={(v) => v.toFixed(1)}
						/>
						<SliderRow
							label="Wet"
							value={wet}
							min={0}
							max={1}
							step={0.01}
							onChange={setWet}
						/>
					</>
				) : null}

				<div className="flex gap-2">
					<Button
						size="sm"
						onClick={() => effectMut.mutate()}
						disabled={effectMut.isPending || !audioPath}
						title="Apply effect & preview"
						aria-label="Apply effect and preview"
					>
						{effectMut.isPending ? (
							<Spinner size="md" className="mr-1" />
						) : (
							<Volume2 className="size-4 mr-1" />
						)}
						Apply & Play
					</Button>
					<Button
						size="sm"
						variant="outline"
						onClick={copyAsClip}
						disabled={!lastBlob}
						title="Copy last result to clipboard"
						aria-label="Copy last result to clipboard"
					>
						Copy as Clip
					</Button>
				</div>
			</div>
		</div>
	);
}

export function DspView() {
	return (
		<div className="h-full flex flex-col">
			<ScreenHeader
				title="Synth / DSP"
				description="Offline synthesis & classical DSP — no AI, no API, fully on-device"
				icon={<Cpu className="size-4" />}
				actions={
					<span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
						Offline · No AI · No API
					</span>
				}
			/>
			<div className="p-4">
				<Tabs defaultValue="synth" className="w-full">
					<TabsList className="mb-3">
						<TabsTrigger value="synth">Synth</TabsTrigger>
						<TabsTrigger value="effects">Effects</TabsTrigger>
					</TabsList>
					<TabsContent value="synth">
						<SynthTab />
					</TabsContent>
					<TabsContent value="effects">
						<EffectsTab />
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
}
