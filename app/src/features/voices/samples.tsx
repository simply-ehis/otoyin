import {
	ArrowUpTrayIcon,
	ComputerDesktopIcon,
	MicrophoneIcon,
	PauseIcon,
	PlayIcon,
	XCircleIcon,
} from "@heroicons/react/24/outline";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	ACCEPTED_AUDIO_EXTENSIONS,
	ACCEPTED_AUDIO_FORMATS_LABEL,
	formatFileSize,
	isAcceptedAudioExtension,
	isAcceptedAudioMimeType,
	MAX_AUDIO_DURATION_SECONDS,
	PROFILE_SAMPLE_MAX_FILE_SIZE,
} from "@/lib/constants/audio";
import { formatAudioDuration } from "@/lib/utils/audio";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";

function validateFile(file: File): string | null {
	if (
		!isAcceptedAudioMimeType(file.type) &&
		!isAcceptedAudioExtension(file.name)
	) {
		return `Unsupported audio format. Accepted: ${ACCEPTED_AUDIO_FORMATS_LABEL}`;
	}
	if (file.size > PROFILE_SAMPLE_MAX_FILE_SIZE) {
		return `File too large. Maximum size: ${formatFileSize(PROFILE_SAMPLE_MAX_FILE_SIZE)}`;
	}
	return null;
}

export interface SampleSourceProps {
	file: File | null | undefined;
	isRecording: boolean;
	duration: number;
	onStart: () => void;
	onStop: () => void;
	onCancel: () => void;
	onTranscribe: () => void;
	onPlayPause: () => void;
	isPlaying: boolean;
	isTranscribing?: boolean;
}

/** File-drop source with validation, preview playback, and transcribe. */
export function AudioSampleUpload({
	file,
	onFileChange,
	onTranscribe,
	onPlayPause,
	isPlaying,
	isTranscribing = false,
	isDisabled = false,
	fieldName,
}: {
	file: File | null | undefined;
	onFileChange: (file: File | undefined) => void;
	onTranscribe: () => void;
	onPlayPause: () => void;
	isPlaying: boolean;
	isTranscribing?: boolean;
	isDisabled?: boolean;
	fieldName: string;
}) {
	const { t } = useTranslation();
	const [dragging, setDragging] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const pick = (f: File | undefined) => {
		if (f) {
			const problem = validateFile(f);
			if (problem) {
				setError(problem);
				onFileChange(undefined);
				return;
			}
			setError(null);
		} else {
			setError(null);
		}
		onFileChange(f);
	};

	return (
		<div className="flex flex-col gap-2">
			<input
				id={`${fieldName}-input`}
				type="file"
				accept={ACCEPTED_AUDIO_EXTENSIONS.join(",")}
				name={fieldName}
				ref={inputRef}
				onChange={(e) => pick(e.target.files?.[0])}
				className="hidden"
				aria-label="Audio file"
			/>
			{!file ? (
				<label
					htmlFor={`${fieldName}-input`}
					onDragOver={(e) => {
						e.preventDefault();
						setDragging(true);
					}}
					onDragLeave={(e) => {
						e.preventDefault();
						setDragging(false);
					}}
					onDrop={(e) => {
						e.preventDefault();
						setDragging(false);
						pick(e.dataTransfer.files?.[0]);
					}}
					className={cn(
						"flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-4 rounded-md border-2 p-4 transition-colors",
						"focus-within:outline-none focus-within:ring-2 focus-within:ring-ring",
						dragging
							? "border-accent bg-accent-muted"
							: error
								? "border-destructive bg-danger-soft"
								: "border-dashed border-strong hover:border-muted-foreground",
					)}
				>
					<span className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground">
						<ArrowUpTrayIcon className="size-5" aria-hidden="true" />
						{t("audioSample.chooseFile")}
					</span>
					<span className="text-center text-sm text-muted-foreground">
						{t("audioSample.uploadHint")}
					</span>
				</label>
			) : (
				<button
					type="button"
					tabIndex={0}
					onDragOver={(e) => {
						e.preventDefault();
						setDragging(true);
					}}
					onDragLeave={(e) => {
						e.preventDefault();
						setDragging(false);
					}}
					onDrop={(e) => {
						e.preventDefault();
						setDragging(false);
						pick(e.dataTransfer.files?.[0]);
					}}
					className={cn(
						"flex min-h-[180px] flex-col items-center justify-center gap-4 rounded-md border-2 border-accent bg-accent-muted p-4 transition-colors",
						dragging && "border-dashed",
					)}
				>
					<p className="flex items-center gap-2 font-medium text-foreground">
						<ArrowUpTrayIcon
							className="size-5 text-accent"
							aria-hidden="true"
						/>
						{t("audioSample.fileUploaded")}
					</p>
					<p className="text-center text-sm text-muted-foreground">
						{t("audioSample.fileLabel", { name: file.name })}
					</p>
					<span className="flex gap-2">
						<Button
							type="button"
							size="icon"
							variant="outline"
							onClick={onPlayPause}
							aria-label={
								isPlaying ? t("audioSample.pause") : t("audioSample.play")
							}
						>
							{isPlaying ? (
								<PauseIcon className="size-4" aria-hidden="true" />
							) : (
								<PlayIcon className="size-4" aria-hidden="true" />
							)}
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={onTranscribe}
							disabled={isTranscribing || isDisabled}
						>
							<MicrophoneIcon className="size-4" aria-hidden="true" />
							{isTranscribing
								? t("audioSample.transcribing")
								: t("audioSample.transcribe")}
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={() => {
								pick(undefined);
								if (inputRef.current) {
									inputRef.current.value = "";
								}
							}}
						>
							{t("audioSample.remove")}
						</Button>
					</span>
				</button>
			)}
			{error ? (
				<p role="alert" className="text-center text-sm text-destructive">
					<XCircleIcon className="mr-1 inline size-4" aria-hidden="true" />
					{error}
				</p>
			) : null}
		</div>
	);
}

function RecordingShell({
	recording,
	file,
	accent,
	children,
}: {
	recording: boolean;
	file: File | null | undefined;
	accent: "accent" | "destructive";
	children: React.ReactNode;
}) {
	return (
		<div
			className={cn(
				"flex min-h-[180px] flex-col items-center justify-center gap-4 rounded-md border-2 p-4",
				recording
					? accent === "destructive"
						? "border-destructive bg-danger-soft"
						: "border-accent bg-accent-muted"
					: file
						? "border-accent bg-accent-muted"
						: "border-dashed border-strong",
			)}
		>
			{children}
		</div>
	);
}

/** Microphone source: record → review → transcribe. */
export function AudioSampleRecording({
	file,
	isRecording,
	duration,
	onStart,
	onStop,
	onCancel,
	onTranscribe,
	onPlayPause,
	isPlaying,
	isTranscribing = false,
}: SampleSourceProps) {
	const { t } = useTranslation();
	return (
		<div className="flex flex-col gap-4">
			{!isRecording && !file ? (
				<RecordingShell recording={false} file={null} accent="accent">
					<Button type="button" size="lg" onClick={onStart}>
						<MicrophoneIcon className="size-5" aria-hidden="true" />
						{t("audioSample.startRecording")}
					</Button>
					<p className="text-center text-sm text-muted-foreground">
						{t("audioSample.recordHint")}
					</p>
				</RecordingShell>
			) : null}
			{isRecording ? (
				<RecordingShell recording file={null} accent="accent">
					<p className="flex items-center gap-2">
						<span
							aria-hidden="true"
							className="size-3 animate-pulse rounded-full bg-accent"
						/>
						<span className="font-mono text-lg font-semibold tabular-nums text-foreground">
							{formatAudioDuration(duration)}
						</span>
					</p>
					<Button type="button" onClick={onStop}>
						{t("audioSample.stopRecording")}
					</Button>
					<p className="text-center text-sm text-muted-foreground">
						{t("audioSample.remaining", {
							time: formatAudioDuration(MAX_AUDIO_DURATION_SECONDS - duration),
						})}
					</p>
				</RecordingShell>
			) : null}
			{file && !isRecording ? (
				<RecordingShell recording={false} file={file} accent="accent">
					<p className="flex items-center gap-2 font-medium text-foreground">
						<MicrophoneIcon className="size-5 text-accent" aria-hidden="true" />
						{t("audioSample.recordingComplete")}
					</p>
					<p className="text-center text-sm text-muted-foreground">
						{t("audioSample.fileLabel", { name: file.name })}
					</p>
					<span className="flex gap-2">
						<Button
							type="button"
							size="icon"
							variant="outline"
							onClick={onPlayPause}
							aria-label={
								isPlaying ? t("audioSample.pause") : t("audioSample.play")
							}
						>
							{isPlaying ? (
								<PauseIcon className="size-4" aria-hidden="true" />
							) : (
								<PlayIcon className="size-4" aria-hidden="true" />
							)}
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={onTranscribe}
							disabled={isTranscribing}
						>
							<MicrophoneIcon className="size-4" aria-hidden="true" />
							{isTranscribing
								? t("audioSample.transcribing")
								: t("audioSample.transcribe")}
						</Button>
						<Button type="button" variant="outline" onClick={onCancel}>
							{t("audioSample.recordAgain")}
						</Button>
					</span>
				</RecordingShell>
			) : null}
		</div>
	);
}

/** System-audio source: capture desktop audio → review → transcribe. */
export function AudioSampleSystem({
	file,
	isRecording,
	duration,
	onStart,
	onStop,
	onCancel,
	onTranscribe,
	onPlayPause,
	isPlaying,
	isTranscribing = false,
}: SampleSourceProps) {
	const { t } = useTranslation();
	return (
		<div className="flex flex-col gap-4">
			{!isRecording && !file ? (
				<RecordingShell recording={false} file={null} accent="destructive">
					<Button type="button" size="lg" onClick={onStart}>
						<ComputerDesktopIcon className="size-5" aria-hidden="true" />
						{t("audioSample.startCapture")}
					</Button>
					<p className="text-center text-sm text-muted-foreground">
						{t("audioSample.systemHint")}
					</p>
				</RecordingShell>
			) : null}
			{isRecording ? (
				<RecordingShell recording file={null} accent="destructive">
					<p className="flex items-center gap-2">
						<span
							aria-hidden="true"
							className="size-3 animate-pulse rounded-full bg-destructive"
						/>
						<span className="font-mono text-lg font-semibold tabular-nums text-foreground">
							{formatAudioDuration(duration)}
						</span>
					</p>
					<Button type="button" variant="destructive" onClick={onStop}>
						{t("audioSample.stopCapture")}
					</Button>
					<p className="text-center text-sm text-muted-foreground">
						{t("audioSample.remaining", {
							time: formatAudioDuration(30 - duration),
						})}
					</p>
				</RecordingShell>
			) : null}
			{file && !isRecording ? (
				<RecordingShell recording={false} file={file} accent="destructive">
					<p className="flex items-center gap-2 font-medium text-foreground">
						<ComputerDesktopIcon
							className="size-5 text-accent"
							aria-hidden="true"
						/>
						{t("audioSample.captureComplete")}
					</p>
					<p className="text-center text-sm text-muted-foreground">
						{t("audioSample.fileLabel", { name: file.name })}
					</p>
					<span className="flex gap-2">
						<Button
							type="button"
							size="icon"
							variant="outline"
							onClick={onPlayPause}
							aria-label={
								isPlaying ? t("audioSample.pause") : t("audioSample.play")
							}
						>
							{isPlaying ? (
								<PauseIcon className="size-4" aria-hidden="true" />
							) : (
								<PlayIcon className="size-4" aria-hidden="true" />
							)}
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={onTranscribe}
							disabled={isTranscribing}
						>
							<MicrophoneIcon className="size-4" aria-hidden="true" />
							{isTranscribing
								? t("audioSample.transcribing")
								: t("audioSample.transcribe")}
						</Button>
						<Button type="button" variant="outline" onClick={onCancel}>
							{t("audioSample.captureAgain")}
						</Button>
					</span>
				</RecordingShell>
			) : null}
		</div>
	);
}
