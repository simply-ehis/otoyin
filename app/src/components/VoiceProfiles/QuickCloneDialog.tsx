import {
	CheckCircleIcon,
	CloudArrowUpIcon,
	ExclamationTriangleIcon,
	MusicalNoteIcon,
	PauseIcon,
	PlayIcon,
} from "@heroicons/react/24/outline";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import type { ModelStatusListResponse } from "@/lib/api/types";
import { useAddSample, useCreateProfile } from "@/lib/hooks/useProfiles";
import { cn } from "@/lib/utils/cn";

const MAX_DURATION_SECONDS = 60;
const MIN_DURATION_SECONDS = 5;

interface QuickCloneDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Called after clone is complete — receive the new profile id */
	onComplete?: (profileId: string) => void;
}

type Step = "upload" | "naming" | "creating" | "done";

/**
 * One-click voice clone dialog.
 *
 * Drop an audio file → auto-create a cloned voice profile → ready to use.
 * No complex settings, no full-screen form — just upload and go.
 */
export function QuickCloneDialog({
	open,
	onOpenChange,
	onComplete,
}: QuickCloneDialogProps) {
	const { t } = useTranslation();
	const { toast } = useToast();
	const queryClient = useQueryClient();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	// -- auto-detect best cloning engine --
	const bestCloneEngine = useCallback((): string => {
		const data = queryClient.getQueryData<ModelStatusListResponse>([
			"modelStatus",
		]);
		const models = data?.models ?? [];

		// Prefer loaded engines, then downloaded, then any with clone_voice
		const cloneModels = models.filter((m) => m.clone_voice);
		const loaded = cloneModels.filter((m) => m.loaded);
		if (loaded.length > 0) {
			return loaded[0].engine ?? loaded[0].model_name;
		}

		const downloaded = cloneModels.filter((m) => m.downloaded);
		if (downloaded.length > 0) {
			return downloaded[0].engine ?? downloaded[0].model_name;
		}

		if (cloneModels.length > 0) {
			return cloneModels[0].engine ?? cloneModels[0].model_name;
		}

		return "fish_speech"; // fallback
	}, [queryClient]);

	// -- state --
	const [step, setStep] = useState<Step>("upload");
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [profileName, setProfileName] = useState("");
	const [referenceText, setReferenceText] = useState("");
	const [dragOver, setDragOver] = useState(false);
	const [audioDuration, setAudioDuration] = useState<number | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [transcribing, setTranscribing] = useState(false);

	// -- mutations --
	const createProfile = useCreateProfile();
	const addSample = useAddSample();

	// -- cleanup audio on unmount / step change --
	useEffect(() => {
		return () => {
			audioRef.current?.pause();
			audioRef.current = null;
			setIsPlaying(false);
		};
	}, []);

	// Stop playback when leaving naming step
	useEffect(() => {
		if (step !== "naming") {
			audioRef.current?.pause();
			audioRef.current = null;
			setIsPlaying(false);
		}
	}, [step]);

	// -- reset on close --
	const handleOpenChange = useCallback(
		(next: boolean) => {
			if (!next) {
				audioRef.current?.pause();
				audioRef.current = null;
				setIsPlaying(false);
				setStep("upload");
				setSelectedFile(null);
				setProfileName("");
				setReferenceText("");
				setDragOver(false);
				setAudioDuration(null);
				setTranscribing(false);
			}
			onOpenChange(next);
		},
		[onOpenChange],
	);

	// -- play / pause preview --
	const togglePlayback = useCallback(() => {
		if (!selectedFile) {
			return;
		}

		if (audioRef.current && isPlaying) {
			audioRef.current.pause();
			setIsPlaying(false);
			return;
		}

		if (!audioRef.current) {
			const audio = new Audio(URL.createObjectURL(selectedFile));
			audio.onended = () => setIsPlaying(false);
			audioRef.current = audio;
		}

		audioRef.current.play();
		setIsPlaying(true);
	}, [selectedFile, isPlaying]);

	// -- auto-transcribe on file select --
	const autoTranscribe = useCallback(async (file: File) => {
		setTranscribing(true);
		try {
			const result = await apiClient.transcribeAudio(file);
			if (result.text?.trim()) {
				setReferenceText(result.text.trim());
			}
		} catch {
			// Transcription failed — leave field empty for manual entry
		} finally {
			setTranscribing(false);
		}
	}, []);

	// -- file handling --
	const handleFile = useCallback(
		(file: File) => {
			// Auto-name from filename
			const name = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
			setProfileName(name.charAt(0).toUpperCase() + name.slice(1));
			setSelectedFile(file);
			setReferenceText(""); // clear previous transcription

			// Check duration
			const audio = new Audio(URL.createObjectURL(file));
			audio.onloadedmetadata = () => {
				setAudioDuration(audio.duration);
				if (audio.duration >= MIN_DURATION_SECONDS) {
					setStep("naming");
					autoTranscribe(file);
				}
			};
		},
		[autoTranscribe],
	);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setDragOver(false);
			const file = e.dataTransfer.files[0];
			if (file?.type.startsWith("audio/")) {
				handleFile(file);
			}
		},
		[handleFile],
	);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setDragOver(true);
	}, []);

	const handleDragLeave = useCallback(() => {
		setDragOver(false);
	}, []);

	const handleFileInput = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (file) {
				handleFile(file);
			}
		},
		[handleFile],
	);

	// -- clone flow --
	const handleClone = useCallback(async () => {
		if (!selectedFile || !profileName.trim()) {
			return;
		}

		setStep("creating");
		try {
			// 1. Create profile with cloning defaults
			const profile = await createProfile.mutateAsync({
				name: profileName.trim(),
				language: "en",
				voice_type: "cloned",
				default_engine: bestCloneEngine(),
			});

			// 2. Add the audio sample
			await addSample.mutateAsync({
				profileId: profile.id,
				file: selectedFile,
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
		} catch (err) {
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
		selectedFile,
		profileName,
		referenceText,
		createProfile,
		addSample,
		toast,
		t,
		onComplete,
		bestCloneEngine,
	]);

	const isTooShort =
		audioDuration !== null && audioDuration < MIN_DURATION_SECONDS;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="max-w-md max-h-[85vh] overflow-y-auto p-0 gap-0 overflow-hidden">
				<DialogHeader className="px-6 pt-6 pb-0">
					<DialogTitle className="flex items-center gap-2">
						<MusicalNoteIcon className="size-5 text-accent" />
						{t("quickClone.title", "Clone a Voice")}
					</DialogTitle>
				</DialogHeader>

				{/* -- Step: Upload -- */}
				{step === "upload" && (
					<div className="p-6 space-y-4 animate-slide-up">
						<p className="text-sm text-muted-foreground">
							{t(
								"quickClone.description",
								"Upload 5–60 seconds of clear speech to create a voice clone.",
							)}
						</p>

						{/* biome-ignore lint/a11y/useSemanticElements: drop zone needs drag handlers that buttons don't support */}
						<div
							role="button"
							tabIndex={0}
							onDrop={handleDrop}
							onDragOver={handleDragOver}
							onDragLeave={handleDragLeave}
							onClick={() => fileInputRef.current?.click()}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									fileInputRef.current?.click();
								}
							}}
							className={cn(
								"flex flex-col items-center justify-center gap-3 p-8 rounded-lg border-2 border-dashed cursor-pointer transition-colors",
								dragOver
									? "border-accent bg-accent-muted"
									: "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30",
							)}
						>
							<CloudArrowUpIcon
								className={cn(
									"size-10 transition-colors",
									dragOver ? "text-accent" : "text-muted-foreground/40",
								)}
							/>
							<div className="text-center">
								<p className="text-sm font-medium">
									{dragOver
										? t("quickClone.dropHere", "Drop audio here")
										: t(
												"quickClone.dragOrClick",
												"Drag audio or click to browse",
											)}
								</p>
								<p className="text-xs text-muted-foreground mt-1">
									WAV, MP3, OGG, FLAC · {MIN_DURATION_SECONDS}–
									{MAX_DURATION_SECONDS}s
								</p>
							</div>
						</div>

						{isTooShort && (
							<div className="flex items-center gap-2 text-xs text-amber-500">
								<ExclamationTriangleIcon className="size-3.5" />
								{t(
									"quickClone.tooShort",
									"Audio is too short. At least 5 seconds of speech is needed for a good clone.",
								)}
							</div>
						)}

						<input
							ref={fileInputRef}
							type="file"
							accept="audio/*"
							className="hidden"
							onChange={handleFileInput}
						/>
					</div>
				)}

				{/* -- Step: Naming -- */}
				{step === "naming" && (
					<div className="p-6 space-y-4 animate-slide-up">
						{/* Audio preview with play/pause */}
						<div className="flex items-center gap-3 p-3 rounded-md bg-secondary">
							<Button
								variant="ghost"
								size="icon"
								className="size-8 shrink-0 rounded-full"
								onClick={togglePlayback}
								aria-label={
									isPlaying
										? t("quickClone.pause", "Pause preview")
										: t("quickClone.play", "Play preview")
								}
							>
								{isPlaying ? (
									<PauseIcon className="size-4" />
								) : (
									<PlayIcon className="size-4" />
								)}
							</Button>
							<div className="flex-1 min-w-0">
								<p className="text-xs font-medium truncate">
									{selectedFile?.name}
								</p>
								<p className="text-xs text-muted-foreground">
									{audioDuration !== null ? `${audioDuration.toFixed(1)}s` : ""}
									{profileName && ` · ${profileName}`}
								</p>
							</div>
						</div>

						{/* Profile name */}
						<div className="space-y-1.5">
							<label
								htmlFor="clone-name"
								className="text-xs font-medium text-muted-foreground"
							>
								{t("quickClone.nameLabel", "Voice name")}
							</label>
							<Input
								id="clone-name"
								value={profileName}
								onChange={(e) => setProfileName(e.target.value)}
								placeholder={t("quickClone.namePlaceholder", "e.g. My Voice")}
								className="h-8 text-sm"
								autoFocus
							/>
						</div>

						{/* Reference text (optional) */}
						<div className="space-y-1.5">
							<label
								htmlFor="clone-text"
								className="text-xs font-medium text-muted-foreground"
							>
								{" "}
								{t("quickClone.refTextLabel", "What is being said?")}{" "}
								<span className="text-muted-foreground/50">
									({t("common.optional", "optional")})
								</span>
								{transcribing && (
									<Spinner className="inline-block size-3 ml-1" />
								)}
							</label>
							<Input
								id="clone-text"
								value={referenceText}
								onChange={(e) => setReferenceText(e.target.value)}
								placeholder={t(
									"quickClone.refTextPlaceholder",
									"The spoken words improve clone quality",
								)}
								className="h-8 text-sm"
							/>
						</div>

						<div className="flex justify-end gap-2 pt-2">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => {
									setStep("upload");
									setSelectedFile(null);
									setAudioDuration(null);
								}}
							>
								{t("common.back", "Back")}
							</Button>
							<Button
								size="sm"
								onClick={handleClone}
								disabled={!profileName.trim() || createProfile.isPending}
							>
								{t("quickClone.cloneButton", "Clone Voice")}
							</Button>
						</div>
					</div>
				)}

				{/* -- Step: Creating -- */}
				{step === "creating" && (
					<div className="p-6 flex flex-col items-center gap-4 animate-slide-up">
						<Spinner size="lg" />
						<div className="text-center space-y-1">
							<p className="text-sm font-medium">
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
				)}

				{/* -- Step: Done -- */}
				{step === "done" && (
					<div className="p-6 flex flex-col items-center gap-4 animate-slide-up">
						<CheckCircleIcon className="size-12 text-emerald-500" />
						<div className="text-center space-y-1">
							<p className="text-sm font-medium">
								{t("quickClone.doneTitle", "Voice cloned!")}
							</p>
							<p className="text-xs text-muted-foreground">
								{t(
									"quickClone.doneDesc",
									'"{{name}}" is ready. You can now use it for TTS generation.',
									{ name: profileName },
								)}
							</p>
						</div>
						<Button size="sm" onClick={() => handleOpenChange(false)}>
							{t("quickClone.doneButton", "Start Generating")}
						</Button>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
