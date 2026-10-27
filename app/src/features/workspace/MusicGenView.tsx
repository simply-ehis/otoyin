import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { MusicGenerateRequest } from "@/lib/api/types";
import { showStudioErrorToast } from "@/lib/errors";
import { Button } from "@/ui/button";
import { Input, Textarea } from "@/ui/input";
import { Label } from "@/ui/primitives";
import { ScreenHeader } from "@/ui/states";
import { useToast } from "@/ui/use-toast";

const GENRES = [
	"pop",
	"rock",
	"jazz",
	"classical",
	"electronic",
	"hip-hop",
	"r&b",
	"country",
	"folk",
	"metal",
	"blues",
	"reggae",
	"ambient",
	"lo-fi",
	"cinematic",
	"funk",
	"soul",
	"latin",
];
const MOODS = [
	"neutral",
	"happy",
	"sad",
	"energetic",
	"calm",
	"dark",
	"uplifting",
	"romantic",
	"epic",
	"mysterious",
	"aggressive",
	"dreamy",
];

export function MusicGenView() {
	const { toast } = useToast();
	const [engine, setEngine] = useState<string>("acestep_gguf");
	const MUSIC_ENGINES = [
		{ id: "acestep_gguf", label: "ACE-Step 1.5 GGUF" },
		{ id: "heartmula", label: "HeartMuLa 3B" },
		{ id: "stable_audio", label: "Stable Audio Open (SFX)" },
		{ id: "sa3_sfx", label: "Stable Audio 3 Small SFX" },
		{ id: "minimax_music3", label: "MiniMax Music 3" },
		{ id: "cloud", label: "Cloud (BYOK)" },
	];
	const [prompt, setPrompt] = useState("");
	const [genre, setGenre] = useState("pop");
	const [mood, setMood] = useState("neutral");
	const [duration, setDuration] = useState(30);
	const [tempo, setTempo] = useState<number | "">("");
	const [seed, setSeed] = useState<number | "">("");
	const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);
	const [saveTitle, setSaveTitle] = useState("");

	const generateMutation = useMutation({
		mutationFn: async (req: MusicGenerateRequest) => {
			const blob = await apiClient.generateMusic(req);
			return blob;
		},
		onSuccess: async (blob) => {
			setGeneratedBlob(blob);
			const url = URL.createObjectURL(blob);
			const audio = new Audio(url);
			audio.addEventListener("ended", () => URL.revokeObjectURL(url));
			audio.play();
			toast({ title: "Music generated", description: "Playing now." });
		},
		onError: (err: Error) => {
			showStudioErrorToast(err);
		},
	});

	const saveMutation = useMutation({
		mutationFn: async () => {
			if (!generatedBlob) {
				throw new Error("No audio to save");
			}
			const title =
				saveTitle.trim() || `Music ${new Date().toLocaleTimeString()}`;
			return apiClient.saveGeneratedAudio(
				generatedBlob,
				title,
				"capture",
				"file",
			);
		},
		onSuccess: () => {
			setGeneratedBlob(null);
			setSaveTitle("");
			toast({
				title: "Saved to Library",
				description: "Your music is now in the Library tab.",
			});
		},
		onError: (err: Error) => {
			showStudioErrorToast(err);
		},
	});

	const canGenerate = useMemo(() => prompt.trim().length > 0, [prompt]);
	const canSave = Boolean(generatedBlob);

	const handleGenerate = () => {
		if (!canGenerate) {
			return;
		}
		const req: MusicGenerateRequest = {
			engine,
			prompt: prompt.trim(),
			genre,
			mood,
			duration_seconds: duration,
		};
		if (tempo !== "") {
			req.tempo = tempo;
		}
		if (seed !== "") {
			req.seed = seed;
		}
		generateMutation.mutate(req);
	};

	const handleSave = () => {
		if (!canSave) {
			return;
		}
		saveMutation.mutate();
	};

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<ScreenHeader title="Music Generator" />

			<div className="max-w-lg space-y-1">
				<Label htmlFor="mg-engine">Model</Label>
				<select
					id="mg-engine"
					value={engine}
					onChange={(e) => setEngine(e.target.value)}
					className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm"
				>
					{MUSIC_ENGINES.map((m) => (
						<option key={m.id} value={m.id}>
							{m.label}
						</option>
					))}
				</select>
			</div>

			<div className="grid grid-cols-3 gap-3 max-w-lg">
				<div className="space-y-1">
					<Label htmlFor="mg-genre">Genre</Label>
					<select
						id="mg-genre"
						value={genre}
						onChange={(e) => setGenre(e.target.value)}
						className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm"
					>
						{GENRES.map((g) => (
							<option key={g} value={g}>
								{g}
							</option>
						))}
					</select>
				</div>
				<div className="space-y-1">
					<Label htmlFor="mg-mood">Mood</Label>
					<select
						id="mg-mood"
						value={mood}
						onChange={(e) => setMood(e.target.value)}
						className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm"
					>
						{MOODS.map((m) => (
							<option key={m} value={m}>
								{m}
							</option>
						))}
					</select>
				</div>
				<div className="space-y-1">
					<Label htmlFor="mg-duration">Duration (s)</Label>
					<Input
						id="mg-duration"
						type="number"
						min={1}
						max={300}
						value={duration}
						onChange={(e) => setDuration(Number(e.target.value) || 30)}
						className="h-9"
					/>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-3 max-w-lg">
				<div className="space-y-1">
					<Label htmlFor="mg-tempo">Tempo (BPM, optional)</Label>
					<Input
						id="mg-tempo"
						type="number"
						min={40}
						max={240}
						placeholder="auto"
						value={tempo}
						onChange={(e) =>
							setTempo(e.target.value ? Number(e.target.value) : "")
						}
						className="h-9"
					/>
				</div>
				<div className="space-y-1">
					<Label htmlFor="mg-seed">Seed (optional)</Label>
					<Input
						id="mg-seed"
						type="number"
						min={0}
						placeholder="random"
						value={seed}
						onChange={(e) =>
							setSeed(e.target.value ? Number(e.target.value) : "")
						}
						className="h-9"
					/>
				</div>
			</div>

			<div className="max-w-lg space-y-1">
				<Label htmlFor="mg-prompt">Prompt</Label>
				<Textarea
					id="mg-prompt"
					placeholder="Describe the music you want to generate..."
					value={prompt}
					onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
						setPrompt(e.target.value)
					}
					rows={3}
				/>
			</div>

			<div className="max-w-lg">
				<Button
					type="button"
					disabled={!canGenerate || generateMutation.isPending}
					onClick={handleGenerate}
					className="w-full"
				>
					{generateMutation.isPending ? "Generating..." : "Generate Music"}
				</Button>
			</div>

			{generatedBlob && (
				<div className="max-w-lg flex flex-col gap-2 pt-4 border-t border-border pt-4">
					<div className="flex items-center justify-between gap-2">
						<Label htmlFor="mg-save-title">Save to Library</Label>
						<Input
							id="mg-save-title"
							value={saveTitle}
							onChange={(e) => setSaveTitle(e.target.value)}
							placeholder="Title (optional)"
							className="h-9 flex-1"
						/>
					</div>
					<Button
						type="button"
						disabled={saveMutation.isPending}
						onClick={handleSave}
						className="w-full"
					>
						{saveMutation.isPending ? "Saving…" : "Save to Library"}
					</Button>
					<p className="text-xs text-muted-foreground">
						Saved audio appears in the Library tab and can be played, tagged,
						and exported from there.
					</p>
				</div>
			)}
		</div>
	);
}
