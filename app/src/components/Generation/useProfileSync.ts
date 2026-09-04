import { useEffect, useRef } from "react";
import type { UseFormReturn } from "react-hook-form";
import type {
	EffectPresetResponse,
	VoiceProfileResponse,
} from "@/lib/api/types";
import type { LanguageCode } from "@/lib/constants/languages";
import type { GenerationFormValues } from "@/lib/hooks/useGenerationForm";

type EngineValue =
	| "kokoro"
	| "fish_speech"
	| "zonos"
	| "qwen3_tts"
	| "bark_small"
	| "styletts2"
	| "chattts"
	| "f5_tts"
	| "pocket_tts"
	| "parler_tts"
	| "moss_tts_nano"
	| "kitten_tts";

interface UseProfileSyncArgs {
	selectedProfile?: VoiceProfileResponse;
	effectPresets?: EffectPresetResponse[];
	profiles?: VoiceProfileResponse[];
	selectedProfileId: string | null;
	setSelectedProfileId: (id: string | null) => void;
	setSelectedPresetId: (id: string | null) => void;
	form: UseFormReturn<GenerationFormValues>;
}

export function useProfileSync({
	selectedProfile,
	effectPresets,
	profiles,
	selectedProfileId,
	setSelectedProfileId,
	setSelectedPresetId,
	form,
}: UseProfileSyncArgs) {
	// Set first voice as default if none selected, or clear stale selection
	useEffect(() => {
		if (!selectedProfileId && profiles && profiles.length > 0) {
			setSelectedProfileId(profiles[0].id);
			return;
		}
		// Clear selection if selected profile no longer exists (e.g. deleted on
		// another session, backend reset). This prevents a permanently-disabled
		// generate button with no explanation.
		if (
			selectedProfileId &&
			profiles &&
			!profiles.find((p) => p.id === selectedProfileId)
		) {
			setSelectedProfileId(profiles.length > 0 ? profiles[0].id : null);
		}
	}, [selectedProfileId, profiles, setSelectedProfileId]);

	// Sync generation form language, engine, and effects with selected profile.
	// Gate on profile ID so a React-Query refetch (new object, same profile) does
	// not clobber a user's manual engine or preset selection.
	const lastSyncedProfileId = useRef<string | null | undefined>(undefined);
	useEffect(() => {
		const profileId = selectedProfile?.id;
		if (profileId === lastSyncedProfileId.current) {
			return;
		}
		lastSyncedProfileId.current = profileId;

		if (selectedProfile?.language) {
			form.setValue("language", selectedProfile.language as LanguageCode);
		}
		// Auto-switch engine to match the profile
		const engine =
			selectedProfile?.default_engine ?? selectedProfile?.preset_engine;
		if (engine) {
			form.setValue("engine", engine as EngineValue);
		} else if (selectedProfile && selectedProfile.voice_type !== "preset") {
			// Cloned/designed profile with no default — ensure a compatible (non-preset) engine
			const currentEngine = form.getValues("engine");
			const presetEngines = new Set(["kokoro", "parler_tts"]);
			if (currentEngine && presetEngines.has(currentEngine)) {
				form.setValue("engine", "fish_speech");
			}
		}
		// Pre-fill effects from profile defaults.
		// Note: we set the preset selection even if effectPresets hasn't loaded yet
		// (the submit-time effects resolution reads the live cache), so a profile's
		// effects are never dropped just because the presets query is still pending.
		if (
			selectedProfile?.effects_chain &&
			selectedProfile.effects_chain.length > 0
		) {
			const profileChainJson = JSON.stringify(selectedProfile.effects_chain);
			const matchingPreset = effectPresets?.find(
				(p) => JSON.stringify(p.effects_chain) === profileChainJson,
			);
			if (matchingPreset) {
				setSelectedPresetId(matchingPreset.id);
			} else {
				// No matching preset (or presets still loading) — pass profile chain directly.
				setSelectedPresetId("_profile");
			}
		} else if (
			selectedProfile &&
			(!selectedProfile.effects_chain ||
				selectedProfile.effects_chain.length === 0)
		) {
			setSelectedPresetId(null);
		}
		// Persona toggle only applies when the profile has a personality prompt.
		if (selectedProfile && !selectedProfile.personality?.trim()) {
			form.setValue("personality", false);
		}
	}, [selectedProfile, effectPresets, form, setSelectedPresetId]);
}
