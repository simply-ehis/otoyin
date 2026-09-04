import {
	ComputerDesktopIcon,
	MicrophoneIcon,
	ArrowUpTrayIcon,
} from "@heroicons/react/24/outline";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/ui/dialog";
import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
	FormProvider,
} from "@/ui/form";
import { Field, Textarea } from "@/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import { ERR_TITLE_VALIDATION } from "@/lib/errorMessages";
import { showStudioErrorToast } from "@/lib/errors";
import { useAudioPlayer } from "@/lib/hooks/useAudioPlayer";
import { useAudioRecording } from "@/lib/hooks/useAudioRecording";
import { useAddSample, useProfile } from "@/lib/hooks/useProfiles";
import { useSystemAudioCapture } from "@/lib/hooks/useSystemAudioCapture";
import { useTranscription } from "@/lib/hooks/useTranscription";
import { usePlatform } from "@/platform/PlatformContext";
import {
	AudioSampleRecording,
	AudioSampleSystem,
	AudioSampleUpload,
} from "./samples";

const sampleSchema = z.object({
	file: z.instanceof(File, { message: "Please select an audio file" }),
	referenceText: z
		.string()
		.min(1, "Reference text is required")
		.max(1000, "Reference text must be less than 1000 characters"),
});

type SampleFormValues = z.infer<typeof sampleSchema>;

/**
 * Add-sample dialog: upload, mic record, or system capture, then the
 * exact spoken reference text (auto-transcribed when possible).
 */
export function SampleUpload({
	profileId,
	open,
	onOpenChange,
}: {
	profileId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const platform = usePlatform();
	const addSample = useAddSample();
	const transcribe = useTranscription();
	const { data: profile } = useProfile(profileId);
	const [mode, setMode] = useState<"upload" | "record" | "system">("upload");
	const { isPlaying, playPause, cleanup: cleanupAudio } = useAudioPlayer();

	const form = useForm<SampleFormValues>({
		resolver: zodResolver(sampleSchema),
		defaultValues: { referenceText: "" },
	});
	const selectedFile = form.watch("file");

	const {
		isRecording,
		duration,
		error: recordingError,
		startRecording,
		stopRecording,
		cancelRecording,
	} = useAudioRecording({
		maxDurationSeconds: 29,
		onRecordingComplete: (blob, recordedDuration) => {
			const file = new File([blob], `recording-${Date.now()}.webm`, {
				type: blob.type || "audio/webm",
			}) as File & { recordedDuration?: number };
			if (recordedDuration !== undefined) {
				file.recordedDuration = recordedDuration;
			}
			form.setValue("file", file, { shouldValidate: true });
		},
	});

	const {
		isRecording: isSystemRecording,
		duration: systemDuration,
		error: systemError,
		isSupported: systemSupported,
		startRecording: startSystem,
		stopRecording: stopSystem,
		cancelRecording: cancelSystem,
	} = useSystemAudioCapture({
		maxDurationSeconds: 29,
		onRecordingComplete: (blob, recordedDuration) => {
			const file = new File([blob], `system-audio-${Date.now()}.wav`, {
				type: blob.type || "audio/wav",
			}) as File & { recordedDuration?: number };
			if (recordedDuration !== undefined) {
				file.recordedDuration = recordedDuration;
			}
			form.setValue("file", file, { shouldValidate: true });
		},
	});

	useEffect(() => {
		if (recordingError) {
			showStudioErrorToast(recordingError);
		}
	}, [recordingError]);
	useEffect(() => {
		if (systemError) {
			showStudioErrorToast(systemError);
		}
	}, [systemError]);

	const close = (next: boolean) => {
		if (!next) {
			form.reset();
			setMode("upload");
			if (isRecording) {
				cancelRecording();
			}
			if (isSystemRecording) {
				cancelSystem();
			}
			cleanupAudio();
		}
		onOpenChange(next);
	};

	const transcribeFile = async () => {
		const file = form.getValues("file");
		if (!file) {
			return;
		}
		try {
			const language = profile?.language as "en" | "zh" | undefined;
			const result = await transcribe.mutateAsync({ file, language });
			form.setValue("referenceText", result.text, { shouldValidate: true });
		} catch (error: unknown) {
			showStudioErrorToast(error);
		}
	};

	const submit = async (data: SampleFormValues) => {
		try {
			await addSample.mutateAsync({
				profileId,
				file: data.file,
				referenceText: data.referenceText,
			});
			close(false);
		} catch (error: unknown) {
			showStudioErrorToast(error);
		}
	};

	return (
		<Dialog open={open} onOpenChange={close}>
			<DialogContent>
				<DialogTitle>Add audio sample</DialogTitle>
				<DialogDescription>
					Upload a file and provide the exact reference text spoken in the audio.
				</DialogDescription>
				<FormProvider {...form}>
					<form onSubmit={form.handleSubmit(submit)} className="mt-2 flex flex-col gap-4">
						<Tabs
							value={mode}
							onValueChange={(v) => setMode(v as "upload" | "record" | "system")}
						>
							<TabsList className={`grid w-full ${platform.metadata.isTauri && systemSupported ? "grid-cols-3" : "grid-cols-2"}`}>
								<TabsTrigger value="upload" className="flex items-center gap-2">
									<ArrowUpTrayIcon className="size-4 shrink-0" aria-hidden="true" />
									Upload
								</TabsTrigger>
								<TabsTrigger value="record" className="flex items-center gap-2">
									<MicrophoneIcon className="size-4 shrink-0" aria-hidden="true" />
									Record
								</TabsTrigger>
								{platform.metadata.isTauri && systemSupported ? (
									<TabsTrigger value="system" className="flex items-center gap-2">
										<ComputerDesktopIcon className="size-4 shrink-0" aria-hidden="true" />
										System
									</TabsTrigger>
								) : null}
							</TabsList>
							<TabsContent value="upload">
								<FormField
									control={form.control}
									name="file"
									render={({ field: { onChange, name } }) => (
										<FormItem>
											<FormControl>
												<AudioSampleUpload
													file={selectedFile}
													onFileChange={onChange}
													onTranscribe={transcribeFile}
													onPlayPause={() => {
														const f = form.getValues("file");
														if (f) {
															playPause(f);
														}
													}}
													isPlaying={isPlaying}
													isTranscribing={transcribe.isPending}
													fieldName={name}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</TabsContent>
							<TabsContent value="record">
								<FormField
									control={form.control}
									name="file"
									render={() => (
										<FormItem>
											<FormControl>
												<AudioSampleRecording
													file={selectedFile}
													isRecording={isRecording}
													duration={duration}
													onStart={startRecording}
													onStop={stopRecording}
													onCancel={() => {
														cancelRecording();
														form.resetField("file");
														cleanupAudio();
													}}
													onTranscribe={transcribeFile}
													onPlayPause={() => {
														const f = form.getValues("file");
														if (f) {
															playPause(f);
														}
													}}
													isPlaying={isPlaying}
													isTranscribing={transcribe.isPending}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</TabsContent>
							{platform.metadata.isTauri && systemSupported ? (
								<TabsContent value="system">
									<FormField
										control={form.control}
										name="file"
										render={() => (
											<FormItem>
												<FormControl>
													<AudioSampleSystem
														file={selectedFile}
														isRecording={isSystemRecording}
														duration={systemDuration}
														onStart={startSystem}
														onStop={stopSystem}
														onCancel={() => {
															cancelSystem();
															form.resetField("file");
															cleanupAudio();
														}}
														onTranscribe={transcribeFile}
														onPlayPause={() => {
															const f = form.getValues("file");
															if (f) {
																playPause(f);
															}
														}}
														isPlaying={isPlaying}
														isTranscribing={transcribe.isPending}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</TabsContent>
							) : null}
						</Tabs>

						<FormField
							control={form.control}
							name="referenceText"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Reference text</FormLabel>
									<FormControl>
										<Textarea placeholder="Enter the exact text spoken in the audio" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<div className="flex justify-end gap-2">
							<Button type="button" variant="ghost" onClick={() => close(false)}>
								Cancel
							</Button>
							<Button type="submit" disabled={addSample.isPending} loading={addSample.isPending}>
								{addSample.isPending ? "Uploading…" : "Add sample"}
							</Button>
						</div>
					</form>
				</FormProvider>
			</DialogContent>
		</Dialog>
	);
}
