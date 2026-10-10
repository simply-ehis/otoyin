import { useEffect } from "react";
import type { PresetVoice } from "@/lib/api/types";
import {
	ACCEPTED_AUDIO_FORMATS_LABEL,
	formatFileSize,
	isAcceptedAudioExtension,
	isAcceptedAudioMimeType,
	PROFILE_SAMPLE_MAX_FILE_SIZE,
} from "@/lib/constants/audio";
import type { LanguageCode } from "@/lib/constants/languages";
import { formatAudioDuration, getAudioDuration } from "@/lib/utils/audio";
import { base64ToFile } from "./profileFormHelpers";
import type { ProfileFormState } from "./useProfileFormState";

export function useAudioValidationEffect(state: ProfileFormState) {
	const {
		selectedFile,
		setIsValidatingAudio,
		setAudioDuration,
		form,
		t,
		MAX_AUDIO_DURATION_SECONDS,
	} = state;

	useEffect(() => {
		if (selectedFile && selectedFile instanceof File) {
			// Validate format and size first
			const formatError =
				!isAcceptedAudioMimeType(selectedFile.type) &&
				!isAcceptedAudioExtension(selectedFile.name);
			const sizeError = selectedFile.size > PROFILE_SAMPLE_MAX_FILE_SIZE;

			if (formatError || sizeError) {
				setIsValidatingAudio(false);
				setAudioDuration(null);
				let message = "";
				if (formatError) {
					message = t("profileForm.validation.audioFormatUnsupported", {
						formats: ACCEPTED_AUDIO_FORMATS_LABEL,
					});
				}
				if (sizeError) {
					message = message
						? `${message} ${t("profileForm.validation.audioTooLarge", { max: formatFileSize(PROFILE_SAMPLE_MAX_FILE_SIZE) })}`
						: t("profileForm.validation.audioTooLarge", {
								max: formatFileSize(PROFILE_SAMPLE_MAX_FILE_SIZE),
							});
				}
				form.setError("sampleFile", {
					type: "manual",
					message,
				});
				return;
			}

			setIsValidatingAudio(true);
			getAudioDuration(selectedFile as File & { recordedDuration?: number })
				.then((duration) => {
					setAudioDuration(duration);
					if (duration > MAX_AUDIO_DURATION_SECONDS) {
						form.setError("sampleFile", {
							type: "manual",
							message: t("profileForm.validation.audioTooLong", {
								duration: formatAudioDuration(duration),
								max: formatAudioDuration(MAX_AUDIO_DURATION_SECONDS),
							}),
						});
					} else {
						form.clearErrors("sampleFile");
					}
				})
				.catch((error) => {
					console.error("Failed to get audio duration:", error);
					setAudioDuration(null);
					const isRecordedFile =
						selectedFile.name.startsWith("recording-") ||
						selectedFile.name.startsWith("system-audio-");
					if (!isRecordedFile) {
						form.setError("sampleFile", {
							type: "manual",
							message: t("profileForm.validation.audioFailed"),
						});
					} else {
						form.clearErrors("sampleFile");
					}
				})
				.finally(() => {
					setIsValidatingAudio(false);
				});
		} else {
			setAudioDuration(null);
			form.clearErrors("sampleFile");
		}
	}, [
		selectedFile,
		form,
		t,
		setIsValidatingAudio,
		setAudioDuration,
		MAX_AUDIO_DURATION_SECONDS,
	]);
}

export function useRecordingErrorEffects(state: ProfileFormState) {
	const { recordingError, systemRecordingError, toast, t } = state;

	useEffect(() => {
		if (recordingError) {
			toast({
				title: t("profileForm.toast.recordingError"),
				description: recordingError,
				variant: "destructive",
			});
		}
	}, [recordingError, toast, t]);

	useEffect(() => {
		if (systemRecordingError) {
			toast({
				title: t("profileForm.toast.systemAudioError"),
				description: systemRecordingError,
				variant: "destructive",
			});
		}
	}, [systemRecordingError, toast, t]);
}

export function useProfileFormSyncEffects(state: ProfileFormState) {
	const {
		selectedAvatarFile,
		editingProfile,
		serverUrl,
		setAvatarPreview,
		open,
		profileFormDraft,
		form,
		setProfileEffectsChain,
		setEffectsDirty,
		setDefaultEngine,
		setSampleMode,
		setSelectedPresetVoiceIds,
		availableDefaultEngines,
		defaultEngine,
		presetVoices,
		selectedPresetVoiceIds,
	} = state;

	useEffect(() => {
		if (selectedAvatarFile instanceof File) {
			const url = URL.createObjectURL(selectedAvatarFile);
			setAvatarPreview(url);
			return () => URL.revokeObjectURL(url);
		} else if (editingProfile?.avatar_path) {
			setAvatarPreview(`${serverUrl}/profiles/${editingProfile.id}/avatar`);
		} else {
			setAvatarPreview(null);
		}
	}, [selectedAvatarFile, editingProfile, serverUrl, setAvatarPreview]);

	useEffect(() => {
		if (editingProfile) {
			form.reset({
				name: editingProfile.name,
				description: editingProfile.description || "",
				language: editingProfile.language as LanguageCode,
				personality: editingProfile.personality || "",
				sampleFile: undefined,
				referenceText: undefined,
				avatarFile: undefined,
			});
			setProfileEffectsChain(editingProfile.effects_chain ?? []);
			setEffectsDirty(false);
			setDefaultEngine(editingProfile.default_engine ?? "");
			if (editingProfile.preset_voice_id) {
				setSelectedPresetVoiceIds(
					new Set(
						editingProfile.preset_voice_id.split(",").map((v) => v.trim()),
					),
				);
			} else {
				setSelectedPresetVoiceIds(new Set());
			}
		} else if (profileFormDraft && open) {
			form.reset({
				name: profileFormDraft.name,
				description: profileFormDraft.description,
				language: profileFormDraft.language as LanguageCode,
				personality: profileFormDraft.personality || "",
				referenceText: profileFormDraft.referenceText,
				sampleFile: undefined,
				avatarFile: undefined,
			});
			setSampleMode(profileFormDraft.sampleMode);
			if (
				profileFormDraft.sampleFileData &&
				profileFormDraft.sampleFileName &&
				profileFormDraft.sampleFileType
			) {
				const file = base64ToFile(
					profileFormDraft.sampleFileData,
					profileFormDraft.sampleFileName,
					profileFormDraft.sampleFileType,
				);
				form.setValue("sampleFile", file);
			}
		} else if (!open) {
			form.reset({
				name: "",
				description: "",
				language: "en",
				personality: "",
				sampleFile: undefined,
				referenceText: undefined,
				avatarFile: undefined,
			});
			setSampleMode("record");
			setAvatarPreview(null);
			setSelectedPresetVoiceIds(new Set());
		}
	}, [
		editingProfile,
		profileFormDraft,
		open,
		form,
		setProfileEffectsChain,
		setEffectsDirty,
		setDefaultEngine,
		setSampleMode,
		setAvatarPreview,
		setSelectedPresetVoiceIds,
	]);

	useEffect(() => {
		if (
			defaultEngine &&
			!availableDefaultEngines.some((option) => option.value === defaultEngine)
		) {
			setDefaultEngine("");
		}
	}, [availableDefaultEngines, defaultEngine, setDefaultEngine]);

	useEffect(() => {
		if (selectedPresetVoiceIds.size === 0) {
			return;
		}
		const allStillPresent = [...selectedPresetVoiceIds].every((vid) =>
			presetVoices.some((v: PresetVoice) => v.id === vid),
		);
		if (!allStillPresent) {
			setSelectedPresetVoiceIds(new Set());
		}
	}, [presetVoices, selectedPresetVoiceIds, setSelectedPresetVoiceIds]);
}
