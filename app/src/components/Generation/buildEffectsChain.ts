import type {
	EffectConfig,
	EffectPresetResponse,
	VoiceProfileResponse,
} from "@/lib/api/types";

export function buildEffectsChain(
	selectedPresetId: string | null,
	selectedProfile?: VoiceProfileResponse,
	effectPresets?: EffectPresetResponse[],
): EffectConfig[] | undefined {
	if (!selectedPresetId) {
		return undefined;
	}
	// Profile's own effects chain (no matching preset)
	if (selectedPresetId === "_profile") {
		return selectedProfile?.effects_chain ?? undefined;
	}
	if (!effectPresets) {
		return undefined;
	}
	const preset = effectPresets.find((p) => p.id === selectedPresetId);
	return preset?.effects_chain;
}
