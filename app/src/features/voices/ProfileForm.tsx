import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import * as z from "zod";
import { apiClient } from "@/lib/api/client";
import type { VoiceAttributes, VoiceType } from "@/lib/api/types";
import { LANGUAGE_CODES, type LanguageCode } from "@/lib/constants/languages";
import { showStudioErrorToast } from "@/lib/errors";
import { useAudioPlayer } from "@/lib/hooks/useAudioPlayer";
import { useAudioRecording } from "@/lib/hooks/useAudioRecording";
import {
	useAddSample,
	useCreateProfile,
	useDeleteProfile,
	useProfile,
	useUpdateProfile,
	useUploadAvatar,
} from "@/lib/hooks/useProfiles";
import { useSystemAudioCapture } from "@/lib/hooks/useSystemAudioCapture";
import { useTranscription } from "@/lib/hooks/useTranscription";
import { getAudioDuration } from "@/lib/utils/audio";
import { debug } from "@/lib/utils/debug";
import { type ProfileFormDraft, useUIStore } from "@/stores/uiStore";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/ui/dialog";
import { FormProvider } from "@/ui/form";
import { useToast } from "@/ui/use-toast";
import { InfoColumn } from "./InfoColumn";
import { SampleList } from "./SampleList";
import {
	type SampleMode,
	SourceColumn,
	type VoiceSource,
} from "./SourceColumn";

const MAX_SECONDS = 30;

const schema = z
	.object({
		name: z.string().min(1).max(100),
		description: z.string().max(500).optional(),
		language: z.enum(LANGUAGE_CODES as [LanguageCode, ...LanguageCode[]]),
		personality: z.string().max(2000).optional(),
		sampleFile: z.instanceof(File).optional(),
		referenceText: z.string().max(1000).optional(),
		avatarFile: z.instanceof(File).optional(),
		voiceDescription: z.string().max(1000).optional(),
		voiceAttributes: z.custom<VoiceAttributes>().optional(),
	})
	.refine(
		(data) =>
			!data.sampleFile ||
			(data.referenceText && data.referenceText.trim().length > 0),
		{
			message: "Reference text is required with a sample.",
			path: ["referenceText"],
		},
	);

type Values = z.infer<typeof schema>;

async function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

function base64ToFile(base64: string, name: string, type: string): File {
	const arr = base64.split(",");
	const bytes = atob(arr[1] ?? "");
	const u8 = new Uint8Array(bytes.length);
	for (let i = 0; i < bytes.length; i++) {
		u8[i] = bytes.charCodeAt(i);
	}
	return new File([u8], name, { type });
}

/**
 * Create/edit voice dialog. Create offers clone / preset / design
 * sources; edit offers info, avatar, engine, effects, and samples.
 * Unsubmitted creates persist as a restorable draft.
 */
export function ProfileForm() {
	const { t } = useTranslation();
	const { toast } = useToast();
	const open = useUIStore((s) => s.profileDialogOpen);
	const setOpen = useUIStore((s) => s.setProfileDialogOpen);
	const editingId = useUIStore((s) => s.editingProfileId);
	const setEditingId = useUIStore((s) => s.setEditingProfileId);
	const draft = useUIStore((s) => s.profileFormDraft);
	const setDraft = useUIStore((s) => s.setProfileFormDraft);

	const { data: editing } = useProfile(editingId ?? "");
	const creating = !editingId;

	const form = useForm<Values>({
		resolver: zodResolver(schema),
		defaultValues: {
			name: "",
			description: "",
			language: "en",
			personality: "",
		},
	});

	const [source, setSource] = useState<VoiceSource>("clone");
	const [sampleMode, setSampleMode] = useState<SampleMode>("upload");
	const [presetEngine, setPresetEngine] = useState("");
	const [presetIds, setPresetIds] = useState<Set<string>>(new Set());
	const [designEngine, setDesignEngine] = useState("parler_tts");
	const [defaultEngine, setDefaultEngine] = useState("");
	const [chain, setChain] = useState<import("@/lib/api/types").EffectConfig[]>(
		[],
	);
	const [chainDirty, setChainDirty] = useState(false);
	const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
	const [audioSeconds, setAudioSeconds] = useState<number | null>(null);

	const createProfile = useCreateProfile();
	const updateProfile = useUpdateProfile();
	const deleteProfile = useDeleteProfile();
	const addSample = useAddSample();
	const uploadAvatar = useUploadAvatar();
	const transcribe = useTranscription();
	const { isPlaying, playPause, cleanup: cleanupAudio } = useAudioPlayer();

	const {
		isRecording,
		duration,
		error: recordingError,
		startRecording,
		stopRecording,
		cancelRecording,
	} = useAudioRecording({
		maxDurationSeconds: 29,
		onRecordingComplete: (blob) => {
			form.setValue(
				"sampleFile",
				new File([blob], `recording-${Date.now()}.webm`, {
					type: blob.type || "audio/webm",
				}),
				{ shouldValidate: true },
			);
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
		onRecordingComplete: (blob) => {
			form.setValue(
				"sampleFile",
				new File([blob], `system-audio-${Date.now()}.wav`, {
					type: blob.type || "audio/wav",
				}),
				{ shouldValidate: true },
			);
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

	// Populate on edit; restore draft on create.
	useEffect(() => {
		if (!open) {
			return;
		}
		if (editing) {
			form.reset({
				name: editing.name,
				description: editing.description || "",
				language: editing.language as LanguageCode,
				personality: editing.personality || "",
			});
			setChain(editing.effects_chain ?? []);
			setChainDirty(false);
			setDefaultEngine(editing.default_engine ?? "");
		} else if (draft) {
			form.reset({
				name: draft.name,
				description: draft.description,
				language: (draft.language || "en") as LanguageCode,
				personality: draft.personality,
				referenceText: draft.referenceText,
			});
			setSampleMode(draft.sampleMode ?? "upload");
			if (draft.sampleFileData && draft.sampleFileName) {
				try {
					form.setValue(
						"sampleFile",
						base64ToFile(
							draft.sampleFileData,
							draft.sampleFileName,
							draft.sampleFileType || "audio/wav",
						),
					);
				} catch {
					debug.log(
						"ProfileForm: draft file unreadable, continuing without it",
					);
				}
			}
		} else {
			form.reset({
				name: "",
				description: "",
				language: "en",
				personality: "",
			});
			setChain([]);
			setChainDirty(false);
			setDefaultEngine("");
		}
		setAvatarPreview(null);
	}, [open, editing, draft, form.reset, form.setValue]);

	// Validate sample duration when the file changes.
	const sampleFile = form.watch("sampleFile");
	useEffect(() => {
		if (!sampleFile) {
			setAudioSeconds(null);
			return;
		}
		let cancelled = false;
		getAudioDuration(sampleFile)
			.then((seconds) => {
				if (!cancelled) {
					setAudioSeconds(seconds);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setAudioSeconds(null);
				}
			})
			.finally(() => {
				if (!cancelled) {
				}
			});
		return () => {
			cancelled = true;
		};
	}, [sampleFile]);

	const { data: statusData } = useQuery({
		queryKey: ["modelStatus"],
		queryFn: () => apiClient.getModelStatus(),
		staleTime: 30_000,
		enabled: open,
	});
	const presetEngines: { value: string; label: string }[] = (() => {
		const seen = new Map<string, string>();
		for (const m of statusData?.models ?? []) {
			const engine = m.engine;
			if (!engine || !m.downloaded) {
				continue;
			}
			const structured =
				((m as unknown as { structured_preset_voices?: unknown[] })
					.structured_preset_voices?.length ?? 0) > 0;
			if (
				((m.preset_voices?.length ?? 0) > 0 || structured) &&
				!seen.has(engine)
			) {
				seen.set(engine, m.display_name || engine);
			}
		}
		return seen.size > 0
			? [...seen.entries()].map(([value, label]) => ({ value, label }))
			: [{ value: "kokoro", label: "Kokoro" }];
	})();
	useEffect(() => {
		if (!presetEngines.some((o) => o.value === presetEngine)) {
			setPresetEngine(presetEngines[0]?.value ?? "");
		}
	}, [presetEngines, presetEngine]);

	const { data: presetData } = useQuery({
		queryKey: ["presetVoices", presetEngine],
		queryFn: () => apiClient.listPresetVoices(presetEngine),
		enabled: open && presetEngine !== "",
	});
	const presetVoices = presetData?.voices ?? [];
	const blending = presetEngine === "kokoro";

	const close = (next: boolean) => {
		if (!next) {
			if (creating) {
				const v = form.getValues();
				if (v.name || v.description || v.referenceText || v.sampleFile) {
					const d: ProfileFormDraft = {
						name: v.name || "",
						description: v.description || "",
						language: v.language || "en",
						personality: v.personality || "",
						referenceText: v.referenceText || "",
						sampleMode,
					};
					if (v.sampleFile) {
						const f = v.sampleFile;
						fileToBase64(f)
							.then((data) => {
								d.sampleFileName = f.name;
								d.sampleFileType = f.type;
								d.sampleFileData = data;
								setDraft(d);
							})
							.catch(() => setDraft(d));
					} else {
						setDraft(d);
					}
				}
			}
			setEditingId(null);
			if (isRecording) {
				cancelRecording();
			}
			if (isSystemRecording) {
				cancelSystem();
			}
			cleanupAudio();
		}
		setOpen(next);
	};

	const doTranscribe = async () => {
		const file = form.getValues("sampleFile");
		if (!file) {
			return;
		}
		try {
			const result = await transcribe.mutateAsync({
				file,
				language: form.getValues("language"),
			});
			form.setValue("referenceText", result.text, { shouldValidate: true });
		} catch (error: unknown) {
			toast({
				title: t("profileForm.toast.transcribeFailed"),
				description:
					error instanceof Error
						? error.message
						: t("profileForm.toast.transcribeFailedFallback"),
				variant: "destructive",
			});
		}
	};

	const submit = async (data: Values) => {
		try {
			if (editingId) {
				await updateProfile.mutateAsync({
					profileId: editingId,
					data: {
						name: data.name,
						description: data.description,
						language: data.language,
						default_engine: defaultEngine || undefined,
						personality: data.personality?.trim()
							? data.personality.trim()
							: undefined,
						...(editing?.voice_type === "designed"
							? {
									design_prompt: data.voiceDescription?.trim() || undefined,
									voice_attributes: data.voiceAttributes,
								}
							: {}),
					},
				});
				if (data.avatarFile) {
					try {
						await uploadAvatar.mutateAsync({
							profileId: editingId,
							file: data.avatarFile,
						});
					} catch (avatarError: unknown) {
						toast({
							title: t("profileForm.toast.avatarUploadFailed"),
							description:
								avatarError instanceof Error
									? avatarError.message
									: t("profileForm.toast.avatarUploadFailedFallback"),
							variant: "destructive",
						});
					}
				}
				if (chainDirty) {
					try {
						await apiClient.updateProfileEffects(
							editingId,
							chain.length > 0 ? chain : null,
						);
					} catch (fxError: unknown) {
						toast({
							title: t("profileForm.toast.effectsUpdateFailed"),
							description:
								fxError instanceof Error
									? fxError.message
									: t("profileForm.toast.effectsUpdateFailedFallback"),
							variant: "destructive",
						});
						return;
					}
				}
				toast({
					title: t("profileForm.toast.voiceUpdated"),
					description: t("profileForm.toast.voiceUpdatedDescription", {
						name: data.name,
					}),
				});
			} else if (source === "builtin") {
				const first = [...presetIds][0];
				if (!first) {
					toast({
						title: t("profileForm.toast.noVoiceSelected"),
						description: t("profileForm.toast.noVoiceSelectedDescription"),
						variant: "destructive",
					});
					return;
				}
				const profile = await createProfile.mutateAsync({
					name: data.name,
					description: data.description,
					language: data.language,
					voice_type: "preset" as VoiceType,
					preset_engine: presetEngine,
					preset_voice_id: [...presetIds].join(","),
					default_engine: presetEngine,
					personality: data.personality?.trim()
						? data.personality.trim()
						: undefined,
				});
				if (data.avatarFile) {
					try {
						await uploadAvatar.mutateAsync({
							profileId: profile.id,
							file: data.avatarFile,
						});
					} catch {
						// Avatar is best-effort; the profile itself exists.
					}
				}
				toast({
					title: t("profileForm.toast.profileCreated"),
					description: t("profileForm.toast.profileCreatedBuiltin", {
						name: data.name,
					}),
				});
			} else if (source === "design") {
				const attrs = data.voiceAttributes ?? {};
				if (
					!Object.values(attrs).some(Boolean) &&
					!data.voiceDescription?.trim()
				) {
					toast({
						title: t("profileForm.toast.noVoiceDescription"),
						description: t("profileForm.toast.noVoiceDescriptionDescription"),
						variant: "destructive",
					});
					return;
				}
				const profile = await createProfile.mutateAsync({
					name: data.name,
					description: data.description,
					language: data.language,
					voice_type: "designed" as VoiceType,
					design_prompt: data.voiceDescription?.trim() || undefined,
					voice_attributes: data.voiceAttributes,
					default_engine: designEngine || undefined,
					personality: data.personality?.trim()
						? data.personality.trim()
						: undefined,
				});
				if (data.avatarFile) {
					try {
						await uploadAvatar.mutateAsync({
							profileId: profile.id,
							file: data.avatarFile,
						});
					} catch {
						// Best-effort as above.
					}
				}
				toast({
					title: t("profileForm.toast.profileCreated"),
					description: t("profileForm.toast.profileCreatedDesign", {
						name: data.name,
					}),
				});
			} else {
				const file = form.getValues("sampleFile");
				const referenceText = form.getValues("referenceText");
				if (!file) {
					form.setError("sampleFile", {
						type: "manual",
						message: t("profileForm.validation.sampleRequired"),
					});
					return;
				}
				if (!referenceText?.trim()) {
					form.setError("referenceText", {
						type: "manual",
						message: t("profileForm.validation.referenceTextRequired"),
					});
					return;
				}
				const profile = await createProfile.mutateAsync({
					name: data.name,
					description: data.description,
					language: data.language,
					default_engine: defaultEngine || undefined,
					personality: data.personality?.trim()
						? data.personality.trim()
						: undefined,
				});
				try {
					await addSample.mutateAsync({
						profileId: profile.id,
						file,
						referenceText: referenceText.trim(),
					});
					if (data.avatarFile) {
						try {
							await uploadAvatar.mutateAsync({
								profileId: profile.id,
								file: data.avatarFile,
							});
						} catch {
							// Best-effort as above.
						}
					}
					toast({
						title: t("profileForm.toast.profileCreated"),
						description: t("profileForm.toast.profileCreatedSample", {
							name: data.name,
						}),
					});
				} catch (sampleError: unknown) {
					let rolledBack = false;
					try {
						await deleteProfile.mutateAsync(profile.id);
						rolledBack = true;
					} catch (rollbackError: unknown) {
						toast({
							title: t("profileForm.toast.rollbackFailed"),
							description:
								rollbackError instanceof Error
									? rollbackError.message
									: t("profileForm.toast.rollbackFailedDescription"),
							variant: "destructive",
						});
					}
					toast({
						title: t("profileForm.toast.sampleFailed"),
						description:
							(sampleError instanceof Error
								? sampleError.message
								: t("profileForm.toast.sampleFailedDescription")) +
							(rolledBack
								? ` ${t("profileForm.toast.profileRolledBack")}`
								: ""),
						variant: "destructive",
					});
					throw new Error("sample-failed");
				}
			}
			setDraft(null);
			form.reset();
			setEditingId(null);
			setOpen(false);
		} catch (error: unknown) {
			if (error instanceof Error && error.message === "sample-failed") {
				return;
			}
			toast({
				title: t("common.error"),
				description:
					error instanceof Error
						? error.message
						: t("profileForm.toast.saveFailed"),
				variant: "destructive",
			});
		}
	};

	const busy =
		createProfile.isPending || updateProfile.isPending || addSample.isPending;

	return (
		<Dialog open={open} onOpenChange={close}>
			<DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
				<DialogTitle>
					{editingId
						? t("profileForm.editTitle", { name: editing?.name ?? "" })
						: t("profileForm.createTitle", "New voice")}
					{draft && creating ? (
						<span className="ml-2 text-xs font-normal text-muted-foreground">
							{t("profileForm.draftRestored", "Draft restored")}
						</span>
					) : null}
				</DialogTitle>
				<FormProvider {...form}>
					<form
						onSubmit={form.handleSubmit(submit)}
						className="mt-2 grid grid-cols-1 gap-6 md:grid-cols-2"
					>
						<div className="min-w-0">
							{creating ? (
								<SourceColumn
									form={form as never}
									source={source}
									onSource={setSource}
									presetEngine={presetEngine}
									onPresetEngine={setPresetEngine}
									presetEngines={presetEngines}
									presetVoices={presetVoices}
									presetIds={presetIds}
									onPresetIds={setPresetIds}
									blending={blending}
									designEngine={designEngine}
									onDesignEngine={setDesignEngine}
									sampleMode={sampleMode}
									onSampleMode={setSampleMode}
									sampleFile={sampleFile}
									isRecording={isRecording}
									duration={duration}
									isSystemRecording={isSystemRecording}
									systemDuration={systemDuration}
									systemSupported={systemSupported}
									startRecording={startRecording}
									stopRecording={stopRecording}
									cancelRecording={() => {
										cancelRecording();
										form.resetField("sampleFile");
										cleanupAudio();
									}}
									startSystem={startSystem}
									stopSystem={stopSystem}
									cancelSystem={() => {
										cancelSystem();
										form.resetField("sampleFile");
										cleanupAudio();
									}}
									onTranscribe={doTranscribe}
									onPlayPause={() => {
										const file = form.getValues("sampleFile");
										if (file) {
											playPause(file);
										}
									}}
									isPlaying={isPlaying}
									isTranscribing={transcribe.isPending}
									audioSeconds={audioSeconds}
									maxSeconds={MAX_SECONDS}
								/>
							) : editing?.voice_type === "preset" ? (
								<PresetSummary profileId={editingId} />
							) : (
								<div>
									<p className="text-sm font-medium text-foreground">Samples</p>
									{editingId ? <SampleList profileId={editingId} /> : null}
								</div>
							)}
						</div>
						<div className="min-w-0">
							<InfoColumn
								form={form as never}
								avatarPreview={avatarPreview}
								setAvatarPreview={setAvatarPreview}
								editingId={editingId}
								editingAvatarPath={editing?.avatar_path}
								source={source}
								defaultEngine={defaultEngine}
								onDefaultEngine={setDefaultEngine}
								showEffects={!!editingId}
								chain={chain}
								onChain={(next) => {
									setChain(next);
									setChainDirty(true);
								}}
							/>
						</div>
						<div className="flex justify-end gap-2 md:col-span-2">
							{draft && creating ? (
								<Button
									type="button"
									variant="ghost"
									onClick={() => {
										setDraft(null);
										form.reset({
											name: "",
											description: "",
											language: "en",
											personality: "",
										});
									}}
								>
									{t("profileForm.discardDraft", "Discard draft")}
								</Button>
							) : null}
							<Button
								type="button"
								variant="ghost"
								onClick={() => close(false)}
							>
								{t("common.cancel")}
							</Button>
							<Button type="submit" disabled={busy} loading={busy}>
								{editingId
									? t("profileForm.actions.saveChanges")
									: t("profileForm.actions.create")}
							</Button>
						</div>
					</form>
				</FormProvider>
			</DialogContent>
		</Dialog>
	);
}

function PresetSummary({ profileId }: { profileId: string | null }) {
	const { data: profile } = useProfile(profileId ?? "");
	const ids =
		profile?.preset_voice_id?.split(",").map((v: string) => v.trim()) ?? [];
	return (
		<div className="flex flex-col gap-3 pt-4">
			<div className="rounded-sm border border-border bg-card p-4">
				<p className="text-xs uppercase tracking-wider text-muted-foreground">
					Preset voices
				</p>
				<p className="mt-1 text-lg font-semibold text-foreground">
					{ids.length <= 3 ? ids.join(" + ") : `${ids.length} voices blended`}
				</p>
				<p className="mt-1">
					<span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
						{profile?.preset_engine}
					</span>
				</p>
			</div>
			<p className="text-xs leading-relaxed text-muted-foreground">
				Builtin presets cannot change their voice. Rename, describe, and tune
				effects from the other column.
			</p>
		</div>
	);
}
