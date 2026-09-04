import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import type { EffectPresetResponse } from "@/lib/api/types";
import { useGenerationForm } from "@/lib/hooks/useGenerationForm";
import { buildEffectsChain } from "./buildEffectsChain";

interface UseGenerationActionsArgs {
	selectedProfileId: string | null;
	selectedPresetId: string | null;
	isStoriesRoute: boolean;
	selectedStoryId: string | null;
	setIsExpanded: (value: boolean) => void;
	addPendingStoryAdd: (generationId: string, storyId: string) => void;
	selectedProfile?: import("@/lib/api/types").VoiceProfileResponse;
	effectPresets?: EffectPresetResponse[];
}

interface UseGenerationActionsResult {
	composeMutation: ReturnType<
		typeof useMutation<{ text: string }, Error, void, unknown>
	>;
	effectPresets?: EffectPresetResponse[];
	form: ReturnType<typeof useGenerationForm>["form"];
	handleSubmit: ReturnType<typeof useGenerationForm>["handleSubmit"];
	isPending: boolean;
}

export function useGenerationActions({
	selectedProfileId,
	selectedPresetId,
	isStoriesRoute,
	selectedStoryId,
	setIsExpanded,
	addPendingStoryAdd,
	selectedProfile,
	effectPresets,
}: UseGenerationActionsArgs): UseGenerationActionsResult {
	const { t } = useTranslation();
	const { toast } = useToast();
	const queryClient = useQueryClient();

	const composeMutation = useMutation({
		mutationFn: async () => {
			if (!selectedProfileId) {
				throw new Error("No profile selected");
			}
			return apiClient.composeWithPersonality(selectedProfileId);
		},
		onError: (err: Error) => {
			toast({
				title: t("generation.compose.failedTitle"),
				description: err.message || t("generation.compose.failedDescription"),
				variant: "destructive",
			});
		},
	});

	const { data: effectPresetsData } = useQuery({
		queryKey: ["effect-presets"],
		queryFn: () => apiClient.listEffectPresets(),
	});

	const { form, handleSubmit, isPending } = useGenerationForm({
		onSuccess: async (generationId) => {
			setIsExpanded(false);
			// Defer the story add until TTS completes -- useGenerationProgress handles it
			if (isStoriesRoute && selectedStoryId && generationId) {
				addPendingStoryAdd(generationId, selectedStoryId);
			}
		},
		// Resolve the effects chain AT SUBMIT TIME from the live query cache so a
		// profile's effects are never dropped just because the presets query
		// hadn't flushed into React state yet.
		getEffectsChain: () => {
			const cachedPresets = queryClient.getQueryData<EffectPresetResponse[]>([
				"effect-presets",
			]);
			const presetsList = effectPresets ?? cachedPresets;
			return buildEffectsChain(selectedPresetId, selectedProfile, presetsList);
		},
	});

	return {
		composeMutation,
		effectPresets: effectPresetsData,
		form,
		handleSubmit,
		isPending,
	};
}
