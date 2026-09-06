"use client";

import {
	ArrowDownTrayIcon,
	CheckBadgeIcon,
	PlayIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/lib/api/client";
import type { GenerationRequest } from "@/lib/api/types";
import { Button } from "@/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/ui/dialog";
import { Input } from "@/ui/input";
import { Label, Separator } from "@/ui/primitives";
import { Progress } from "@/ui/progress";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/ui/select";
import { useToast } from "@/ui/use-toast";
import {
	type ConversationLine,
	PodcastConversationBuilder,
	type VoiceProfile,
} from "./PodcastConversationBuilder";

interface PodcastProducerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	profiles: VoiceProfile[];
	engines: string[];
}

interface ProductionState {
	phase: "idle" | "conversation" | "recipe" | "export" | "complete" | "error";
	progress: number;
	message: string;
	conversationAudioPaths: string[];
	recipeOutputPath: string | null;
	exportBlob: Blob | null;
	error: string | null;
}

export function PodcastProducer({
	open,
	onOpenChange,
	profiles,
	engines,
}: PodcastProducerProps) {
	const { t } = useTranslation();
	const { toast } = useToast();
	const [lines, setLines] = useState<ConversationLine[]>([]);
	const [musicPath, setMusicPath] = useState("");
	const [musicPrompt, setMusicPrompt] = useState("");
	const [recipe, setRecipe] = useState("podcast");
	const [targetLufs, setTargetLufs] = useState(-16);
	const [state, setState] = useState<ProductionState>({
		phase: "idle",
		progress: 0,
		message: "",
		conversationAudioPaths: [],
		recipeOutputPath: null,
		exportBlob: null,
		error: null,
	});

	const recipes = [
		{ value: "podcast", label: "Podcast (-16 LUFS, stereo MP3)" },
		{ value: "audiobook", label: "Audiobook (-18 LUFS, mono MP3)" },
		{ value: "film-dialogue-adr", label: "Film/ADR (-24 LUFS, stereo WAV)" },
		{ value: "voiceover-ad", label: "Voiceover/Ad (-12 LUFS, stereo WAV)" },
		{ value: "social-short", label: "Social/Short (-14 LUFS, stereo MP3)" },
		{ value: "youtube", label: "YouTube (-14 LUFS, stereo MP3)" },
	];

	const handleLinesChange = useCallback((newLines: ConversationLine[]) => {
		setLines(newLines);
	}, []);

	const reset = useCallback(() => {
		setState({
			phase: "idle",
			progress: 0,
			message: "",
			conversationAudioPaths: [],
			recipeOutputPath: null,
			exportBlob: null,
			error: null,
		});
	}, []);

	const runProduction = useCallback(async () => {
		if (lines.length === 0) {
			toast({ title: t("podcast.producer.noLines"), variant: "destructive" });
			return;
		}

		reset();
		setState((s) => ({
			...s,
			phase: "conversation",
			progress: 0,
			message: t("podcast.producer.generatingConversation"),
		}));

		try {
			// Phase 1: Generate conversation audio
			const conversationPaths: string[] = [];

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				setState((s) => ({
					...s,
					progress: Math.round((i / lines.length) * 33),
					message: `${t("podcast.producer.generatingLine")} ${i + 1}/${lines.length}: ${line.speaker}`,
				}));

				const res = await apiClient.generateSpeech({
					text: line.text,
					engine: line.engine as GenerationRequest["engine"],
					profile_id: line.profileId ?? profiles[0]?.id ?? "",
					language: (profiles.find((p) => p.id === line.profileId)?.language ??
						"en") as GenerationRequest["language"],
				});

				if (!res.audio_path) {
					throw new Error(
						`${t("podcast.producer.generationFailed")}: ${line.speaker}`,
					);
				}

				conversationPaths.push(res.audio_path);
			}

			setState((s) => ({
				...s,
				phase: "recipe",
				progress: 33,
				message: t("podcast.producer.runningRecipe"),
				conversationAudioPaths: conversationPaths,
			}));

			// Phase 2: Run recipe (handles auto-duck music bed + mastering)
			const segments = conversationPaths.map((path) => ({
				audio_path: path,
				effects: [],
			}));

			const recipeResult = await apiClient.runRecipe(
				segments,
				recipe,
				musicPath || undefined,
				targetLufs,
				-1.0,
				250,
			);

			setState((s) => ({
				...s,
				phase: "export",
				progress: 66,
				message: t("podcast.producer.applyingExport"),
				recipeOutputPath: recipeResult.output_path,
			}));

			// Phase 3: Apply export preset (format conversion + final LUFS)
			const exportBlob = await apiClient.applyExportPreset(
				recipe,
				recipeResult.output_path,
			);

			setState((s) => ({
				...s,
				phase: "complete",
				progress: 100,
				message: t("podcast.producer.complete"),
				exportBlob,
			}));

			toast({
				title: t("podcast.producer.success"),
				description: t("podcast.producer.downloadReady"),
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			setState((s) => ({
				...s,
				phase: "error",
				error: msg,
				message: t("podcast.producer.failed"),
			}));
			toast({
				title: t("podcast.producer.failed"),
				description: msg,
				variant: "destructive",
			});
		}
	}, [lines, musicPath, recipe, targetLufs, profiles, reset, toast, t]);

	const downloadExport = () => {
		if (!state.exportBlob) {
			return;
		}
		const url = URL.createObjectURL(state.exportBlob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `podcast_${new Date().toISOString().slice(0, 10)}.mp3`;
		a.click();
		URL.revokeObjectURL(url);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg max-h-[85vh] overflow-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<PlayIcon className="size-5 text-primary" />
						{t("podcast.producer.title")}
					</DialogTitle>
					<DialogDescription>
						{t("podcast.producer.description")}
					</DialogDescription>
				</DialogHeader>

				<Separator />

				{state.phase === "idle" && (
					<div className="space-y-4">
						<PodcastConversationBuilder
							profiles={profiles}
							engines={engines}
							onLinesChange={handleLinesChange}
							initialLines={lines}
						/>

						<Separator />

						<div className="space-y-3">
							<h4 className="text-sm font-medium">
								{t("podcast.producer.musicBed")}
							</h4>
							<div className="flex items-center gap-2">
								<Label className="text-xs text-muted-foreground shrink-0 w-24">
									{t("podcast.producer.prompt")}
								</Label>
								<Input
									type="text"
									value={musicPrompt}
									onChange={(e) => setMusicPrompt(e.target.value)}
									placeholder={t("podcast.producer.promptPlaceholder")}
									className="flex-1 text-xs"
								/>
								<Button
									variant="outline"
									size="sm"
									onClick={async () => {
										try {
											const blob = await apiClient.generateSfx({
												prompt: musicPrompt,
												duration_seconds: 30,
												engine: "stable_audio",
											});
											const file = new File([blob], "sfx.wav", {
												type: "audio/wav",
											});
											const imported = await apiClient.importAudio(file);
											if (imported.audio_path) {
												setMusicPath(imported.audio_path);
											}
										} catch (_e) {
											toast({
												title: t("podcast.producer.sfxFailed"),
												variant: "destructive",
											});
										}
									}}
									disabled={!musicPrompt}
								>
									{t("podcast.producer.generateSfx")}
								</Button>
							</div>
							{musicPath && (
								<div className="flex items-center justify-between text-xs">
									<span className="text-muted-foreground truncate max-w-[200px]">
										{musicPath}
									</span>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => setMusicPath("")}
									>
										<XMarkIcon className="size-3.5" />
									</Button>
								</div>
							)}

							<Separator className="my-2" />

							<div className="flex items-center gap-2">
								<Label className="text-xs text-muted-foreground shrink-0 w-20">
									{t("podcast.producer.recipe")}
								</Label>
								<Select value={recipe} onValueChange={setRecipe}>
									<SelectTrigger className="flex-1 h-8 text-xs">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{recipes.map((r) => (
											<SelectItem key={r.value} value={r.value}>
												{r.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="flex items-center gap-2">
								<Label className="text-xs text-muted-foreground shrink-0 w-20">
									{t("podcast.producer.targetLufs")}
								</Label>
								<Input
									type="number"
									value={targetLufs}
									onChange={(e) => setTargetLufs(parseFloat(e.target.value))}
									className="w-24 text-xs"
									step={0.5}
									min={-24}
									max={0}
								/>
								<span className="text-xs text-muted-foreground">LUFS</span>
							</div>
						</div>

						<Button
							className="w-full py-3 text-base"
							onClick={runProduction}
							disabled={lines.length === 0}
						>
							<PlayIcon className="size-5 mr-2" />
							{t("podcast.producer.produceButton")}
						</Button>
					</div>
				)}

				{state.phase !== "idle" && state.phase !== "complete" && (
					<div className="space-y-4">
						<div className="flex items-center justify-between text-sm">
							<span>{state.message}</span>
							<span className="font-mono tabular-nums">{state.progress}%</span>
						</div>
						<Progress value={state.progress} className="h-2" />
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							{state.phase === "conversation" && (
								<span>{t("podcast.producer.phase1")}</span>
							)}
							{state.phase === "recipe" && (
								<span>{t("podcast.producer.phase2")}</span>
							)}
							{state.phase === "export" && (
								<span>{t("podcast.producer.phase3")}</span>
							)}
						</div>
					</div>
				)}

				{state.phase === "error" && (
					<div className="space-y-3 text-destructive">
						<p className="text-sm">{state.error}</p>
						<Button
							variant="outline"
							onClick={() => setState((s) => ({ ...s, phase: "idle" }))}
						>
							{t("podcast.producer.tryAgain")}
						</Button>
					</div>
				)}

				{state.phase === "complete" && (
					<div className="space-y-4">
						<div className="flex items-center justify-center gap-2 text-success-text">
							<CheckBadgeIcon className="size-6" />
							<span className="text-lg font-semibold">
								{t("podcast.producer.complete")}
							</span>
						</div>
						<p className="text-sm text-muted-foreground text-center">
							{t("podcast.producer.downloadDesc")}
						</p>
						<div className="flex gap-2">
							<Button
								variant="outline"
								className="flex-1"
								onClick={() => {
									setState((s) => ({ ...s, phase: "idle" }));
								}}
							>
								{t("podcast.producer.newPodcast")}
							</Button>
							<Button className="flex-1" onClick={downloadExport}>
								<ArrowDownTrayIcon className="size-4 mr-2" />
								{t("podcast.producer.download")}
							</Button>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
