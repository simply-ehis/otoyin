import { apiClient } from "@/lib/api/client";
import type { VoiceType } from "@/lib/api/types";
import { formatAudioDuration, getAudioDuration } from "@/lib/utils/audio";
import type { ProfileFormValues } from "./profileFormHelpers";
import { MIN_CLONE_DURATION_SECONDS, fileToBase64 } from "./profileFormHelpers";
import type { ProfileFormState } from "./useProfileFormState";

async function submitUpdate(state: ProfileFormState, data: ProfileFormValues) {
	const {
		editingProfileId,
		editingProfile,
		updateProfile,
		uploadAvatar,
		toast,
		t,
		effectsDirty,
		profileEffectsChain,
		defaultEngine,
	} = state;
	const updateData = {
		name: data.name,
		description: data.description,
		language: data.language,
		default_engine: defaultEngine || undefined,
		personality: data.personality?.trim() ? data.personality.trim() : undefined,
	} as unknown as Record<string, unknown>;

	// Include voice_attributes + design_prompt when editing a designed profile
	if (editingProfile?.voice_type === "designed") {
		updateData.design_prompt = data.voiceDescription?.trim() || undefined;
		updateData.voice_attributes = data.voiceAttributes;
	}

	await updateProfile.mutateAsync({
		profileId: editingProfileId as string,
		data: updateData as unknown as never,
	});

	if (data.avatarFile) {
		try {
			await uploadAvatar.mutateAsync({
				profileId: editingProfileId as string,
				file: data.avatarFile,
			});
		} catch (avatarError) {
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

	if (effectsDirty) {
		try {
			await apiClient.updateProfileEffects(
				editingProfileId as string,
				profileEffectsChain.length > 0 ? profileEffectsChain : null,
			);
		} catch (fxError) {
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
}

async function submitBuiltin(state: ProfileFormState, data: ProfileFormValues) {
	const {
		selectedPresetVoiceId,
		selectedPresetEngine,
		createProfile,
		uploadAvatar,
		toast,
		t,
	} = state;
	if (!selectedPresetVoiceId) {
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
		preset_engine: selectedPresetEngine,
		preset_voice_id: selectedPresetVoiceId,
		default_engine: selectedPresetEngine,
		personality: data.personality?.trim() ? data.personality.trim() : undefined,
	});

	if (data.avatarFile) {
		try {
			await uploadAvatar.mutateAsync({
				profileId: profile.id,
				file: data.avatarFile,
			});
		} catch (avatarError) {
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

	toast({
		title: t("profileForm.toast.profileCreated"),
		description: t("profileForm.toast.profileCreatedBuiltin", {
			name: data.name,
		}),
	});
}

async function finalizeCloneWithSample(
	state: ProfileFormState,
	profileId: string,
	fileToUpload: File,
	referenceText: string,
	data: ProfileFormValues,
) {
	const { addSample, uploadAvatar, deleteProfile, toast, t } = state;
	try {
		await addSample.mutateAsync({
			profileId,
			file: fileToUpload,
			referenceText,
		});

		if (data.avatarFile) {
			try {
				await uploadAvatar.mutateAsync({ profileId, file: data.avatarFile });
			} catch (avatarError) {
				toast({
					title: "Avatar upload failed",
					description:
						avatarError instanceof Error
							? avatarError.message
							: "Failed to upload avatar",
					variant: "destructive",
				});
			}
		}

		toast({
			title: t("profileForm.toast.profileCreated"),
			description: t("profileForm.toast.profileCreatedSample", {
				name: data.name,
			}),
		});
	} catch (sampleError) {
		let rollbackSucceeded = false;
		try {
			await deleteProfile.mutateAsync(profileId);
			rollbackSucceeded = true;
		} catch (rollbackError) {
			toast({
				title: t("profileForm.toast.rollbackFailed"),
				description:
					rollbackError instanceof Error
						? rollbackError.message
						: t("profileForm.toast.rollbackFailedDescription"),
				variant: "destructive",
			});
		}

		const rollbackSuffix = rollbackSucceeded
			? ` ${t("profileForm.toast.profileRolledBack")}`
			: "";
		toast({
			title: t("profileForm.toast.sampleFailed"),
			description:
				sampleError instanceof Error
					? `${sampleError.message}${rollbackSuffix}`
					: rollbackSucceeded
						? t("profileForm.toast.sampleFailedRolledBack")
						: t("profileForm.toast.sampleFailedDescription"),
			variant: "destructive",
		});
		throw new Error("sample-failed");
	}
}

async function submitClone(state: ProfileFormState, data: ProfileFormValues) {
	const {
		form,
		voiceSource,
		createProfile,
		uploadAvatar,
		toast,
		t,
		MAX_AUDIO_DURATION_SECONDS,
		defaultEngine,
	} = state;

	const isDesign = voiceSource === "design";

	// Design profiles: no sample required
	if (isDesign) {
		const attrs = data.voiceAttributes ?? {};
		const hasAny =
			Object.values(attrs).some(Boolean) || data.voiceDescription?.trim();
		if (!hasAny) {
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
			default_engine: defaultEngine || undefined,
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
			} catch (avatarError) {
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

		toast({
			title: t("profileForm.toast.profileCreated"),
			description: t("profileForm.toast.profileCreatedDesign", {
				name: data.name,
			}),
		});
		return;
	}

	// Clone path: sample required
	const sampleFile = form.getValues("sampleFile");
	const referenceText = form.getValues("referenceText");

	if (!sampleFile) {
		form.setError("sampleFile", {
			type: "manual",
			message: t("profileForm.validation.sampleRequired"),
		});
		toast({
			title: t("profileForm.toast.sampleRequired"),
			description: t("profileForm.toast.sampleRequiredDescription"),
			variant: "destructive",
		});
		return;
	}

	if (!referenceText || referenceText.trim().length === 0) {
		form.setError("referenceText", {
			type: "manual",
			message: t("profileForm.validation.referenceTextRequired"),
		});
		toast({
			title: t("profileForm.toast.referenceTextRequired"),
			description: t("profileForm.toast.referenceTextRequiredDescription"),
			variant: "destructive",
		});
		return;
	}

	let duration: number;
	try {
		duration = await getAudioDuration(sampleFile);
	} catch (error) {
		form.setError("sampleFile", {
			type: "manual",
			message: t("profileForm.validation.audioFailed"),
		});
		toast({
			title: t("profileForm.toast.validationError"),
			description:
				error instanceof Error
					? error.message
					: t("profileForm.validation.audioFailed"),
			variant: "destructive",
		});
		return;
	}

	if (duration > MAX_AUDIO_DURATION_SECONDS) {
		form.setError("sampleFile", {
			type: "manual",
			message: t("profileForm.validation.audioTooLong", {
				duration: formatAudioDuration(duration),
				max: formatAudioDuration(MAX_AUDIO_DURATION_SECONDS),
			}),
		});
		toast({
			title: t("profileForm.toast.invalidAudio"),
			description: t("profileForm.toast.invalidAudioDescription", {
				duration: formatAudioDuration(duration),
				max: formatAudioDuration(MAX_AUDIO_DURATION_SECONDS),
			}),
			variant: "destructive",
		});
		return;
	}

	if (duration < MIN_CLONE_DURATION_SECONDS) {
		form.setError("sampleFile", {
			type: "manual",
			message: t("profileForm.validation.audioTooShort", {
				duration: formatAudioDuration(duration),
				min: formatAudioDuration(MIN_CLONE_DURATION_SECONDS),
			}),
		});
		toast({
			title: t("profileForm.toast.qualityWarning"),
			description: t("profileForm.toast.qualityWarningDescription"),
			variant: "destructive",
		});
		return;
	}

	const profile = await createProfile.mutateAsync({
		name: data.name,
		description: data.description,
		language: data.language,
		default_engine: defaultEngine || undefined,
		personality: data.personality?.trim() ? data.personality.trim() : undefined,
	});

	const fileToUpload: File = sampleFile;
	await finalizeCloneWithSample(
		state,
		profile.id,
		fileToUpload,
		referenceText,
		data,
	);
}

export interface ProfileFormHandlers {
	onSubmit: (data: ProfileFormValues) => Promise<void>;
	handleTranscribe: () => Promise<void>;
	handleCancelRecording: () => void;
	handlePlayPause: () => void;
}

export function useProfileFormHandlers(
	state: ProfileFormState,
): ProfileFormHandlers {
	const {
		t,
		editingProfileId,
		setEditingProfileId,
		setOpen,
		setProfileFormDraft,
		form,
		cancelRecording,
		cancelSystemRecording,
		cleanupAudio,
		sampleMode,
		transcribe,
		toast,
	} = state;

	async function handleTranscribe() {
		const file = form.getValues("sampleFile");
		if (!file) {
			toast({
				title: t("profileForm.toast.noFile"),
				description: t("profileForm.toast.noFileDescription"),
				variant: "destructive",
			});
			return;
		}

		try {
			const language = form.getValues("language");
			const result = await transcribe.mutateAsync({ file, language });
			form.setValue("referenceText", result.text, { shouldValidate: true });
		} catch (error) {
			toast({
				title: t("profileForm.toast.transcribeFailed"),
				description:
					error instanceof Error
						? error.message
						: t("profileForm.toast.transcribeFailedFallback"),
				variant: "destructive",
			});
		}
	}

	function handleCancelRecording() {
		if (sampleMode === "record") {
			cancelRecording();
		} else if (sampleMode === "system") {
			cancelSystemRecording();
		}
		form.resetField("sampleFile");
		cleanupAudio();
	}

	function handlePlayPause() {
		const file = form.getValues("sampleFile");
		state.playPause(file);
	}

	async function onSubmit(data: ProfileFormValues) {
		try {
			if (editingProfileId) {
				await submitUpdate(state, data);
			} else if (state.voiceSource === "builtin") {
				await submitBuiltin(state, data);
			} else {
				await submitClone(state, data);
			}

			setProfileFormDraft(null);
			form.reset();
			setEditingProfileId(null);
			setOpen(false);
		} catch (error) {
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
	}

	return {
		onSubmit,
		handleTranscribe,
		handleCancelRecording,
		handlePlayPause,
	};
}

export function useProfileFormAvatarHandlers(state: ProfileFormState): {
	handleAvatarFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
	handleRemoveAvatar: () => Promise<void>;
} {
	const {
		t,
		editingProfileId,
		editingProfile,
		deleteAvatar,
		toast,
		form,
		avatarInputRef,
		setAvatarPreview,
	} = state;

	function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (file) {
			if (!file.type.startsWith("image/")) {
				toast({
					title: t("profileForm.toast.invalidFile"),
					description: t("profileForm.toast.invalidImageFormat"),
					variant: "destructive",
				});
				return;
			}
			if (file.size > 5 * 1024 * 1024) {
				toast({
					title: t("profileForm.toast.fileTooLarge"),
					description: t("profileForm.toast.imageTooLargeDescription"),
					variant: "destructive",
				});
				return;
			}
			form.setValue("avatarFile", file);
		}
	}

	async function handleRemoveAvatar() {
		if (editingProfileId && editingProfile?.avatar_path) {
			try {
				await deleteAvatar.mutateAsync(editingProfileId);
				toast({
					title: t("profileForm.toast.avatarRemoved"),
					description: t("profileForm.toast.avatarRemovedDescription"),
				});
			} catch (error) {
				toast({
					title: t("profileForm.toast.avatarRemoveFailed"),
					description:
						error instanceof Error ? error.message : t("common.unknownError"),
					variant: "destructive",
				});
			}
		}
		form.setValue("avatarFile", undefined);
		setAvatarPreview(null);
		if (avatarInputRef.current) {
			avatarInputRef.current.value = "";
		}
	}

	return { handleAvatarFileChange, handleRemoveAvatar };
}

export function useProfileFormOpenHandler(state: ProfileFormState): {
	handleOpenChange: (newOpen: boolean) => void;
} {
	const {
		setEditingProfileId,
		setOpen,
		setProfileFormDraft,
		form,
		isRecording,
		cancelRecording,
		isSystemRecording,
		cancelSystemRecording,
		cleanupAudio,
		sampleMode,
		isCreating,
	} = state;

	async function handleOpenChange(newOpen: boolean) {
		if (!newOpen && isCreating) {
			const values = form.getValues();
			const hasContent =
				values.name ||
				values.description ||
				values.referenceText ||
				values.sampleFile;

			if (hasContent) {
				const draft: import("@/stores/uiStore").ProfileFormDraft = {
					name: values.name || "",
					description: values.description || "",
					language: values.language || "en",
					personality: values.personality || "",
					referenceText: values.referenceText || "",
					sampleMode,
				};

				if (values.sampleFile) {
					try {
						draft.sampleFileName = values.sampleFile.name;
						draft.sampleFileType = values.sampleFile.type;
						draft.sampleFileData = await fileToBase64(values.sampleFile);
					} catch {
						// If file conversion fails, just don't save the file
						debug.log(
							"useProfileFormHandlers: draft fileToBase64 failed, skipping file in draft",
						);
					}
				}

				setProfileFormDraft(draft);
			}
		}

		setOpen(newOpen);
		if (!newOpen) {
			setEditingProfileId(null);
			if (isRecording) {
				cancelRecording();
			}
			if (isSystemRecording) {
				cancelSystemRecording();
			}
			cleanupAudio();
		}
	}

	return { handleOpenChange };
}

import { debug } from "../../lib/utils/debug";
