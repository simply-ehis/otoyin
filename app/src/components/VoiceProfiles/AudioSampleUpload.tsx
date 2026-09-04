import {
	MicrophoneIcon as Mic,
	PauseIcon as Pause,
	PlayIcon as Play,
	ArrowUpTrayIcon as Upload,
	XCircleIcon as XCircle,
} from "@heroicons/react/24/outline";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { FormControl, FormItem, FormMessage } from "@/components/ui/form";
import {
	ACCEPTED_AUDIO_EXTENSIONS,
	ACCEPTED_AUDIO_FORMATS_LABEL,
	formatFileSize,
	isAcceptedAudioExtension,
	isAcceptedAudioMimeType,
	PROFILE_SAMPLE_MAX_FILE_SIZE,
} from "@/lib/constants/audio";

interface AudioSampleUploadProps {
	file: File | null | undefined;
	onFileChange: (file: File | undefined) => void;
	onTranscribe: () => void;
	onPlayPause: () => void;
	isPlaying: boolean;
	isValidating?: boolean;
	isTranscribing?: boolean;
	isDisabled?: boolean;
	fieldName: string;
}

function validateAudioFile(file: File): string | null {
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

export function AudioSampleUpload({
	file,
	onFileChange,
	onTranscribe,
	onPlayPause,
	isPlaying,
	isValidating = false,
	isTranscribing = false,
	isDisabled = false,
	fieldName,
}: AudioSampleUploadProps) {
	const { t } = useTranslation();
	const [isDragging, setIsDragging] = useState(false);
	const [validationError, setValidationError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleFileSelect = (selectedFile: File | undefined) => {
		if (selectedFile) {
			const error = validateAudioFile(selectedFile);
			if (error) {
				setValidationError(error);
				onFileChange(undefined);
				return;
			}
			setValidationError(null);
		} else {
			setValidationError(null);
		}
		onFileChange(selectedFile);
	};

	const acceptAttr = ACCEPTED_AUDIO_EXTENSIONS.join(",");

	return (
		<FormItem>
			<FormControl>
				<div className="flex flex-col gap-2">
					<input
						type="file"
						accept={acceptAttr}
						name={fieldName}
						ref={fileInputRef}
						onChange={(e) => {
							const selectedFile = e.target.files?.[0];
							handleFileSelect(selectedFile);
						}}
						className="hidden"
					/>
					<button
						type="button"
						onDragOver={(e) => {
							e.preventDefault();
							setIsDragging(true);
						}}
						onDragLeave={(e) => {
							e.preventDefault();
							setIsDragging(false);
						}}
						onDrop={(e) => {
							e.preventDefault();
							setIsDragging(false);
							const droppedFile = e.dataTransfer.files?.[0];
							handleFileSelect(droppedFile);
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								fileInputRef.current?.click();
							}
						}}
						className={`flex flex-col items-center justify-center gap-4 p-4 border-2 rounded-lg transition-colors min-h-[180px] ${
							file
								? "border-primary bg-primary/5"
								: isDragging
									? "border-primary bg-primary/5"
									: validationError
										? "border-destructive bg-destructive/5"
										: "border-dashed border-muted-foreground/25 hover:border-muted-foreground/50"
						}`}
					>
						{!file ? (
							<>
								<Button
									type="button"
									size="lg"
									onClick={() => fileInputRef.current?.click()}
									className="flex items-center gap-2"
								>
									<Upload className="size-5" />
									{t("audioSample.chooseFile")}
								</Button>
								<p className="text-sm text-muted-foreground text-center">
									{t("audioSample.uploadHint")}
								</p>
							</>
						) : (
							<>
								<div className="flex items-center gap-2">
									<Upload className="size-5 text-primary" />
									<span className="font-medium">
										{t("audioSample.fileUploaded")}
									</span>
								</div>
								<p className="text-sm text-muted-foreground text-center">
									{t("audioSample.fileLabel", { name: file.name })}
								</p>
								<div className="flex gap-2">
									<Button
										type="button"
										size="icon"
										variant="outline"
										onClick={onPlayPause}
										disabled={isValidating}
										aria-label={
											isPlaying ? t("audioSample.pause") : t("audioSample.play")
										}
									>
										{isPlaying ? (
											<Pause className="size-4" />
										) : (
											<Play className="size-4" />
										)}
									</Button>
									<Button
										type="button"
										variant="outline"
										onClick={onTranscribe}
										disabled={isTranscribing || isValidating || isDisabled}
										className="flex items-center gap-2"
									>
										<Mic className="size-4" />
										{isTranscribing
											? t("audioSample.transcribing")
											: t("audioSample.transcribe")}
									</Button>
									<Button
										type="button"
										variant="outline"
										onClick={() => {
											handleFileSelect(undefined);
											if (fileInputRef.current) {
												fileInputRef.current.value = "";
											}
										}}
									>
										{t("audioSample.remove")}
									</Button>
								</div>
							</>
						)}
					</button>
					{validationError && (
						<p className="text-sm text-destructive text-center" role="alert">
							<XCircle className="size-4 inline mr-1" />
							{validationError}
						</p>
					)}
				</div>
			</FormControl>
			<FormMessage />
		</FormItem>
	);
}
