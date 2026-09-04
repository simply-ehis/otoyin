import type {
	EffectConfig,
	EffectPresetResponse,
	VoiceProfileResponse,
} from "@/lib/api/types";

/** Resolve the effects chain at submit time: explicit preset wins,
 *  `_profile` falls back to the profile's own chain. */
export function buildEffectsChain(
	selectedPresetId: string | null,
	selectedProfile?: VoiceProfileResponse,
	effectPresets?: EffectPresetResponse[],
): EffectConfig[] | undefined {
	if (!selectedPresetId) {
		return undefined;
	}
	if (selectedPresetId === "_profile") {
		return selectedProfile?.effects_chain ?? undefined;
	}
	if (!effectPresets) {
		return undefined;
	}
	return effectPresets.find((p) => p.id === selectedPresetId)?.effects_chain;
}
