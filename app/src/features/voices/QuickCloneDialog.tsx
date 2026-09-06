import {
	CheckCircleIcon,
	CloudArrowUpIcon,
	MusicalNoteIcon,
	PauseIcon,
	PlayIcon,
} from "@heroicons/react/24/outline";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/lib/api/client";
import type { ModelStatusListResponse } from "@/lib/api/types";
import { useAddSample, useCreateProfile } from "@/lib/hooks/useProfiles";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/ui/dialog";
import { Field, Input } from "@/ui/input";
import { Spinner } from "@/ui/primitives";
import { useToast } from "@/ui/use-toast";

const MAX_SECONDS = 60;
const MIN_SECONDS = 5;

type Step = "upload" | "naming" | "creating" | "done";

/**
 * One-click clone: drop audio → auto-name + auto-transcribe → clone.
 * Picks the best cloning engine (loaded → downloaded → any clone_voice).
 */
export function QuickCloneDialog({
	open,
	onOpenChange,
	onComplete,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onComplete?: (profileId: string) => void;
}) {
	const { t } = useTranslation();
	const { toast } = useToast();
	const queryClient = useQueryClient();
	const audioRef = useRef<HTMLAudioElement | null>(null);

	const [step, setStep] = useState<Step>("upload");
	const [file, setFile] = useState<File | null>(null);
	const [name, setName] = useState("");
	const [referenceText, setReferenceText] = useState("");
	const [dragOver, setDragOver] = useState(false);
	const [duration, setDuration] = useState<number | null>(null);
	const [playing, setPlaying] = useState(false);
	const [transcribing, setTranscribing] = useState(false);

	const createProfile = useCreateProfile();
	const addSample = useAddSample();

	const bestEngine = useCallback((): string => {
		const data = queryClient.getQueryData<ModelStatusListResponse>([
			"modelStatus",
		]);
		const models = data?.models ?? [];
		const clones = models.filter((m) => m.clone_voice);
		const loaded = clones.filter((m) => m.loaded);
		if (loaded[0]) {
			return loaded[0].engine ?? loaded[0].model_name;
		}
		const downloaded = clones.filter((m) => m.downloaded);
		if (downloaded[0]) {
			return downloaded[0].engine ?? downloaded[0].model_name;
		}
		if (clones[0]) {
			return clones[0].engine ?? clones[0].model_name;
		}
		return "zonos";
	}, [queryClient]);

	useEffect(
		() => () => {
			audioRef.current?.pause();
			audioRef.current = null;
		},
		[],
	);
	useEffect(() => {
		if (step !== "naming") {
			audioRef.current?.pause();
			audioRef.current = null;
			setPlaying(false);
		}
	}, [step]);

	const close = useCallback(
		(next: boolean) => {
			if (!next) {
				audioRef.current?.pause();
				audioRef.current = null;
				setPlaying(false);
				setStep("upload");
				setFile(null);
				setName("");
				setReferenceText("");
				setDragOver(false);
				setDuration(null);
				setTranscribing(false);
			}
			onOpenChange(next);
		},
		[onOpenChange],
	);

	const transcribe = useCallback(async (f: File) => {
		setTranscribing(true);
		try {
			const result = await apiClient.transcribeAudio(f);
			if (result.text?.trim()) {
				setReferenceText(result.text.trim());
			}
		} catch {
			// Leave the field for manual entry.
		} finally {
			setTranscribing(false);
		}
	}, []);

	const handleFile = useCallback(
		(f: File) => {
			const base = f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
			setName(base.charAt(0).toUpperCase() + base.slice(1));
			setFile(f);
			setReferenceText("");
			const audio = new Audio(URL.createObjectURL(f));
			audio.onloadedmetadata = () => {
				setDuration(audio.duration);
				if (audio.duration >= MIN_SECONDS) {
					setStep("naming");
					void transcribe(f);
				}
			};
		},
		[transcribe],
	);

	const togglePreview = useCallback(() => {
		if (!file) {
			return;
		}
		if (audioRef.current && playing) {
			audioRef.current.pause();
			setPlaying(false);
			return;
		}
		if (!audioRef.current) {
			const audio = new Audio(URL.createObjectURL(file));
			audio.onended = () => setPlaying(false);
			audioRef.current = audio;
		}
		void audioRef.current.play();
		setPlaying(true);
	}, [file, playing]);

	const clone = useCallback(async () => {
		if (!file || !name.trim()) {
			return;
		}
		setStep("creating");
		try {
			const profile = await createProfile.mutateAsync({
				name: name.trim(),
				language: "en",
				voice_type: "cloned",
				default_engine: bestEngine(),
			});
			await addSample.mutateAsync({
				profileId: profile.id,
				file,
				referenceText: referenceText.trim() || "Voice sample",
			});
			setStep("done");
			toast({
				title: t("quickClone.success", "Voice cloned!"),
				description: t(
					"quickClone.successDesc",
					"Your voice profile is ready to use.",
				),
			});
			onComplete?.(profile.id);
		} catch (err: unknown) {
			toast({
				title: t("quickClone.failed", "Clone failed"),
				description:
					err instanceof Error
						? err.message
						: t("quickClone.failedDesc", "Could not create voice profile."),
				variant: "destructive",
			});
			setStep("naming");
		}
	}, [
		file,
		name,
		referenceText,
		createProfile,
		addSample,
		toast,
		t,
		onComplete,
		bestEngine,
	]);

	return (
		<Dialog open={open} onOpenChange={close}>
			<DialogContent className="max-h-[85vh] overflow-y-auto p-0">
				<div className="px-6 pb-6 pt-6">
					<DialogTitle className="flex items-center gap-2">
						<MusicalNoteIcon
							className="size-5 text-accent"
							aria-hidden="true"
						/>
						{t("quickClone.title", "Clone a Voice")}
					</DialogTitle>

					{step === "upload" ? (
						<div className="mt-4 flex flex-col gap-4">
							<p className="text-sm text-muted-foreground">
								{t(
									"quickClone.description",
									"Upload 5–60 seconds of clear speech to create a voice clone.",
								)}
							</p>
							<label
								onDrop={(e) => {
									e.preventDefault();
									setDragOver(false);
									const f = e.dataTransfer.files[0];
									if (f?.type.startsWith("audio/")) {
										handleFile(f);
									}
								}}
								onDragOver={(e) => {
									e.preventDefault();
									setDragOver(true);
								}}
								onDragLeave={() => setDragOver(false)}
								className={cn(
									"flex cursor-pointer flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed p-8 transition-colors",
									"focus-within:outline-none focus-within:ring-2 focus-within:ring-ring",
									dragOver
										? "border-accent bg-accent-muted"
										: "border-strong hover:border-muted-foreground hover:bg-secondary",
								)}
							>
								<input
									type="file"
									accept="audio/*"
									className="hidden"
									aria-label="Reference audio file"
									onChange={(e) => {
										const f = e.target.files?.[0];
										if (f) {
											handleFile(f);
										}
									}}
								/>
								<CloudArrowUpIcon
									className={cn(
										"size-10 transition-colors",
										dragOver ? "text-accent" : "text-muted-foreground/60",
									)}
									aria-hidden="true"
								/>
								<span className="text-center">
									<span className="block text-sm font-medium text-foreground">
										{dragOver
											? t("quickClone.dropHere", "Drop audio here")
											: t(
													"quickClone.dragOrClick",
													"Drag audio or click to browse",
												)}
									</span>
									<span className="mt-1 block text-xs text-muted-foreground">
										WAV, MP3, OGG, FLAC · {MIN_SECONDS}–{MAX_SECONDS}s
									</span>
								</span>
							</label>
						</div>
					) : null}

					{step === "naming" ? (
						<div className="mt-4 flex flex-col gap-4">
							<div className="flex items-center gap-3 rounded-sm bg-secondary p-3">
								<Button
									variant="ghost"
									size="icon"
									className="size-8 shrink-0"
									onClick={togglePreview}
									aria-label={
										playing
											? t("quickClone.pause", "Pause preview")
											: t("quickClone.play", "Play preview")
									}
								>
									{playing ? (
										<PauseIcon className="size-4" aria-hidden="true" />
									) : (
										<PlayIcon className="size-4" aria-hidden="true" />
									)}
								</Button>
								<div className="min-w-0 flex-1">
									<p className="truncate text-xs font-medium text-foreground">
										{file?.name}
									</p>
									<p className="text-xs tabular-nums text-muted-foreground">
										{duration !== null ? `${duration.toFixed(1)}s` : ""}
										{name ? ` · ${name}` : ""}
									</p>
								</div>
							</div>
							<Field
								label={t("quickClone.nameLabel", "Voice name")}
								htmlFor="clone-name"
							>
								<Input
									id="clone-name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder={t("quickClone.namePlaceholder", "e.g. My Voice")}
									autoFocus
								/>
							</Field>
							<Field
								label={`${t("quickClone.refTextLabel", "What is being said?")} (${t("common.optional", "optional")})`}
								htmlFor="clone-text"
							>
								<Input
									id="clone-text"
									value={referenceText}
									onChange={(e) => setReferenceText(e.target.value)}
									placeholder={t(
										"quickClone.refTextPlaceholder",
										"The spoken words improve clone quality",
									)}
								/>
								{transcribing ? (
									<span className="mt-1 block text-xs text-muted-foreground">
										Transcribing…
									</span>
								) : null}
							</Field>
							<div className="flex justify-end gap-2 pt-2">
								<Button
									variant="ghost"
									size="sm"
									onClick={() => {
										setStep("upload");
										setFile(null);
										setDuration(null);
									}}
								>
									{t("common.back", "Back")}
								</Button>
								<Button
									size="sm"
									onClick={clone}
									disabled={!name.trim() || createProfile.isPending}
									loading={createProfile.isPending}
								>
									{t("quickClone.cloneButton", "Clone Voice")}
								</Button>
							</div>
						</div>
					) : null}

					{step === "creating" ? (
						<div className="mt-4 flex flex-col items-center gap-4 py-6">
							<Spinner size="lg" />
							<div className="space-y-1 text-center">
								<p className="text-sm font-medium text-foreground">
									{t("quickClone.creating", "Cloning voice…")}
								</p>
								<p className="text-xs text-muted-foreground">
									{t(
										"quickClone.creatingDesc",
										"Creating profile and processing audio",
									)}
								</p>
							</div>
						</div>
					) : null}

					{step === "done" ? (
						<div className="mt-4 flex flex-col items-center gap-4 py-6">
							<CheckCircleIcon
								className="size-12 text-success"
								aria-hidden="true"
							/>
							<div className="space-y-1 text-center">
								<p className="text-sm font-medium text-foreground">
									{t("quickClone.doneTitle", "Voice cloned!")}
								</p>
								<p className="text-xs text-muted-foreground">
									{t(
										"quickClone.doneDesc",
										'"{{name}}" is ready. You can now use it for TTS generation.',
										{ name },
									)}
								</p>
							</div>
							<Button size="sm" onClick={() => close(false)}>
								{t("quickClone.doneButton", "Start Generating")}
							</Button>
						</div>
					) : null}
				</div>
			</DialogContent>
		</Dialog>
	);
}
