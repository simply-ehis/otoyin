import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useToast } from "@/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import type {
	EffectConfig,
	ModelStatusListResponse,
	PresetVoice,
	VoiceProfileResponse,
	VoiceType,
} from "@/lib/api/types";
import { useAudioPlayer } from "@/lib/hooks/useAudioPlayer";
import { useAudioRecording } from "@/lib/hooks/useAudioRecording";
import {
	useAddSample,
	useCreateProfile,
	useDeleteAvatar,
	useDeleteProfile,
	useProfile,
	useUpdateProfile,
	useUploadAvatar,
} from "@/lib/hooks/useProfiles";
import { useSystemAudioCapture } from "@/lib/hooks/useSystemAudioCapture";
import { useTranscription } from "@/lib/hooks/useTranscription";
import { useServerStore } from "@/stores/serverStore";
import { type ProfileFormDraft, useUIStore } from "@/stores/uiStore";
import {
	DEFAULT_ENGINE_OPTIONS,
	MAX_AUDIO_DURATION_SECONDS,
	makeProfileSchema,
	PRESET_ONLY_ENGINES,
	type ProfileFormValues,
} from "./profileFormHelpers";

function apiToInternalVoiceType(
	apiType: VoiceType,
): "clone" | "builtin" | "design" {
	switch (apiType) {
		case "cloned":
			return "clone";
		case "preset":
			return "builtin";
		case "designed":
			return "design";
	}
}

export interface ProfileFormState {
	t: ReturnType<typeof useTranslation>["t"];
	open: boolean;
	setOpen: (open: boolean) => void;
	editingProfileId: string | null;
	setEditingProfileId: (id: string | null) => void;
	profileFormDraft: ProfileFormDraft | null;
	setProfileFormDraft: (draft: ProfileFormDraft | null) => void;
	editingProfile: VoiceProfileResponse | null;
	createProfile: ReturnType<typeof useCreateProfile>;
	updateProfile: ReturnType<typeof useUpdateProfile>;
	addSample: ReturnType<typeof useAddSample>;
	deleteProfile: ReturnType<typeof useDeleteProfile>;
	uploadAvatar: ReturnType<typeof useUploadAvatar>;
	deleteAvatar: ReturnType<typeof useDeleteAvatar>;
	transcribe: ReturnType<typeof useTranscription>;
	toast: ReturnType<typeof useToast>["toast"];
	voiceSource: "clone" | "builtin" | "design";
	setVoiceSource: (v: "clone" | "builtin" | "design") => void;
	voiceDescription?: string;
	setVoiceDescription: (v: string) => void;
	designEngine: string;
	setDesignEngine: (v: string) => void;
	sampleMode: "upload" | "record" | "system";
	setSampleMode: (mode: "upload" | "record" | "system") => void;
	audioDuration: number | null;
	setAudioDuration: (d: number | null) => void;
	isValidatingAudio: boolean;
	setIsValidatingAudio: (v: boolean) => void;
	avatarPreview: string | null;
	setAvatarPreview: (v: string | null) => void;
	selectedPresetEngine: string;
	setSelectedPresetEngine: (v: string) => void;
	selectedPresetVoiceIds: Set<string>;
	setSelectedPresetVoiceIds: (v: Set<string>) => void;
	selectedPresetVoiceId: string;
	supportsBlending: boolean;
	avatarInputRef: React.RefObject<HTMLInputElement | null>;
	isPlaying: boolean;
	playPause: (file?: File) => void;
	cleanupAudio: () => void;
	isCreating: boolean;
	serverUrl: string;
	profileEffectsChain: EffectConfig[];
	setProfileEffectsChain: (chain: EffectConfig[]) => void;
	effectsDirty: boolean;
	setEffectsDirty: (dirty: boolean) => void;
	defaultEngine: string;
	setDefaultEngine: (v: string) => void;
	form: ReturnType<typeof useForm<ProfileFormValues>>;
	selectedFile?: File;
	selectedAvatarFile?: File;
	isRecording: boolean;
	duration: number;
	recordingError?: string | null;
	startRecording: () => void;
	stopRecording: () => void;
	cancelRecording: () => void;
	isSystemRecording: boolean;
	systemDuration: number;
	systemRecordingError?: string | null;
	isSystemAudioSupported: boolean;
	startSystemRecording: () => void;
	stopSystemRecording: () => void;
	cancelSystemRecording: () => void;
	presetVoices: PresetVoice[];
	availableDefaultEngines: ReadonlyArray<{ value: string; label: string }>;
	MAX_AUDIO_DURATION_SECONDS: number;
}

function useProfileFormFields(): Pick<
	ProfileFormState,
	| "voiceSource"
	| "setVoiceSource"
	| "sampleMode"
	| "setSampleMode"
	| "audioDuration"
	| "setAudioDuration"
	| "isValidatingAudio"
	| "setIsValidatingAudio"
	| "avatarPreview"
	| "setAvatarPreview"
	| "selectedPresetEngine"
	| "setSelectedPresetEngine"
	| "selectedPresetVoiceIds"
	| "setSelectedPresetVoiceIds"
	| "selectedPresetVoiceId"
	| "supportsBlending"
	| "avatarInputRef"
	| "isPlaying"
	| "playPause"
	| "cleanupAudio"
	| "profileEffectsChain"
	| "setProfileEffectsChain"
	| "effectsDirty"
	| "setEffectsDirty"
	| "defaultEngine"
	| "setDefaultEngine"
	| "designEngine"
	| "setDesignEngine"
	| "form"
	| "selectedFile"
	| "selectedAvatarFile"
	| "voiceDescription"
	| "setVoiceDescription"
> {
	const { t } = useTranslation();
	const [voiceSource, setVoiceSource] = useState<
		"clone" | "builtin" | "design"
	>("clone");
	const [sampleMode, setSampleMode] = useState<"upload" | "record" | "system">(
		"record",
	);
	const [audioDuration, setAudioDuration] = useState<number | null>(null);
	const [isValidatingAudio, setIsValidatingAudio] = useState(false);
	const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
	const [selectedPresetEngine, setSelectedPresetEngine] = useState<string>("");
	const [selectedPresetVoiceIds, setSelectedPresetVoiceIds] = useState<
		Set<string>
	>(new Set());
	const selectedPresetVoiceId = useMemo(() => {
		if (selectedPresetVoiceIds.size === 0) {
			return "";
		}
		if (selectedPresetVoiceIds.size === 1) {
			return [...selectedPresetVoiceIds][0];
		}
		return [...selectedPresetVoiceIds].join(",");
	}, [selectedPresetVoiceIds]);
	const supportsBlending = selectedPresetEngine === "kokoro";
	const avatarInputRef = useRef<HTMLInputElement>(null);
	const { isPlaying, playPause, cleanup: cleanupAudio } = useAudioPlayer();
	const [profileEffectsChain, setProfileEffectsChain] = useState<
		EffectConfig[]
	>([]);
	const [effectsDirty, setEffectsDirty] = useState(false);
	const [defaultEngine, setDefaultEngine] = useState<string>("");
	const [designEngine, setDesignEngine] = useState<string>("parler_tts_gguf");

	const form = useForm<ProfileFormValues>({
		resolver: zodResolver(makeProfileSchema(t)),
		defaultValues: {
			name: "",
			description: "",
			language: "en",
			personality: "",
			sampleFile: undefined,
			referenceText: "",
			avatarFile: undefined,
			voiceDescription: "",
		},
	});

	const selectedFile = form.watch("sampleFile");
	const selectedAvatarFile = form.watch("avatarFile");

	return {
		voiceSource,
		setVoiceSource,
		sampleMode,
		setSampleMode,
		audioDuration,
		setAudioDuration,
		isValidatingAudio,
		setIsValidatingAudio,
		avatarPreview,
		setAvatarPreview,
		selectedPresetEngine,
		setSelectedPresetEngine,
		selectedPresetVoiceIds,
		setSelectedPresetVoiceIds,
		selectedPresetVoiceId,
		supportsBlending,
		avatarInputRef,
		isPlaying,
		playPause,
		cleanupAudio,
		profileEffectsChain,
		setProfileEffectsChain,
		effectsDirty,
		setEffectsDirty,
		defaultEngine,
		setDefaultEngine,
		designEngine,
		setDesignEngine,
		form,
		selectedFile,
		selectedAvatarFile,
		voiceDescription: form.getValues("voiceDescription"),
		setVoiceDescription: (v: string) => form.setValue("voiceDescription", v),
	};
}

function useProfileFormStore(
	fields: ReturnType<typeof useProfileFormFields>,
): Omit<ProfileFormState, keyof ReturnType<typeof useProfileFormFields>> {
	const { t } = useTranslation();
	const open = useUIStore((state) => state.profileDialogOpen);
	const setOpen = useUIStore((state) => state.setProfileDialogOpen);
	const editingProfileId = useUIStore((state) => state.editingProfileId);
	const setEditingProfileId = useUIStore((state) => state.setEditingProfileId);
	const profileFormDraft = useUIStore((state) => state.profileFormDraft);
	const setProfileFormDraft = useUIStore((state) => state.setProfileFormDraft);
	const { data: editingProfile } = useProfile(editingProfileId || "");
	const createProfile = useCreateProfile();
	const updateProfile = useUpdateProfile();
	const addSample = useAddSample();
	const deleteProfile = useDeleteProfile();
	const uploadAvatar = useUploadAvatar();
	const deleteAvatar = useDeleteAvatar();
	const transcribe = useTranscription();
	const { toast } = useToast();
	const { form, setVoiceSource } = fields;
	const isCreating = !editingProfileId;
	const serverUrl = useServerStore((state) => state.serverUrl);

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
			form.setValue("sampleFile", file, { shouldValidate: true });
			toast({
				title: t("profileForm.toast.recordingComplete"),
				description: t("profileForm.toast.recordingCompleteDescription"),
			});
		},
	});

	const {
		isRecording: isSystemRecording,
		duration: systemDuration,
		error: systemRecordingError,
		isSupported: isSystemAudioSupported,
		startRecording: startSystemRecording,
		stopRecording: stopSystemRecording,
		cancelRecording: cancelSystemRecording,
	} = useSystemAudioCapture({
		maxDurationSeconds: 29,
		onRecordingComplete: (blob, recordedDuration) => {
			const file = new File([blob], `system-audio-${Date.now()}.wav`, {
				type: blob.type || "audio/wav",
			}) as File & { recordedDuration?: number };
			if (recordedDuration !== undefined) {
				file.recordedDuration = recordedDuration;
			}
			form.setValue("sampleFile", file, { shouldValidate: true });
			toast({
				title: t("profileForm.toast.systemAudioCaptured"),
				description: t("profileForm.toast.systemAudioCapturedDescription"),
			});
		},
	});

	const presetEngineToQuery = isCreating
		? fields.selectedPresetEngine
		: (editingProfile?.preset_engine ?? "");
	const { data: presetVoicesData } = useQuery({
		queryKey: ["presetVoices", presetEngineToQuery],
		queryFn: () => apiClient.listPresetVoices(presetEngineToQuery),
		enabled:
			!!presetEngineToQuery &&
			((fields.voiceSource === "builtin" && isCreating) ||
				(!isCreating && editingProfile?.voice_type === "preset")),
	});
	const presetVoices = presetVoicesData?.voices ?? [];
	const isSampleBasedProfile = isCreating
		? fields.voiceSource === "clone"
		: editingProfile?.voice_type !== "preset";
	const { data: modelStatus } = useQuery<ModelStatusListResponse>({
		queryKey: ["modelStatus"],
		queryFn: () => apiClient.getModelStatus(),
		staleTime: 30_000,
		refetchInterval: 30_000,
	});
	const downloadedEngines = useMemo(
		() =>
			new Set(
				(modelStatus?.models ?? [])
					.filter((m) => m.downloaded && m.category === "tts")
					.map((m) => m.engine),
			),
		[modelStatus],
	);
	const availableDefaultEngines = useMemo(
		() =>
			DEFAULT_ENGINE_OPTIONS.filter(
				(option) =>
					downloadedEngines.has(option.value) &&
					(!isSampleBasedProfile || !PRESET_ONLY_ENGINES.has(option.value)),
			),
		[downloadedEngines, isSampleBasedProfile],
	);

	// Sync voiceSource with editingProfile when it changes
	useEffect(() => {
		if (!isCreating && editingProfile?.voice_type) {
			setVoiceSource(apiToInternalVoiceType(editingProfile.voice_type));
			if (
				editingProfile.voice_type === "designed" &&
				editingProfile.default_engine
			) {
				fields.setDesignEngine(editingProfile.default_engine);
			}
		} else if (isCreating) {
			setVoiceSource("clone");
		}
	}, [editingProfile, isCreating, setVoiceSource, fields.setDesignEngine]);

	return {
		t,
		open,
		setOpen,
		editingProfileId,
		setEditingProfileId,
		profileFormDraft,
		setProfileFormDraft,
		editingProfile: editingProfile ?? null,
		createProfile,
		updateProfile,
		addSample,
		deleteProfile,
		uploadAvatar,
		deleteAvatar,
		transcribe,
		toast,
		isCreating,
		serverUrl,
		isRecording,
		duration,
		recordingError,
		startRecording,
		stopRecording,
		cancelRecording,
		isSystemRecording,
		systemDuration,
		systemRecordingError,
		isSystemAudioSupported,
		startSystemRecording,
		stopSystemRecording,
		cancelSystemRecording,
		presetVoices,
		availableDefaultEngines,
		MAX_AUDIO_DURATION_SECONDS,
	};
}

export function useProfileFormState(): ProfileFormState {
	const fields = useProfileFormFields();
	const store = useProfileFormStore(fields);
	return { ...fields, ...store };
}
