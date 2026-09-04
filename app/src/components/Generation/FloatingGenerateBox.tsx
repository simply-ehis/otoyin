import { useMatchRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useProfile, useProfiles } from "@/lib/hooks/useProfiles";
import { useStory } from "@/lib/hooks/useStories";
import { useGenerationStore } from "@/stores/generationStore";
import { useStoryStore } from "@/stores/storyStore";
import { useUIStore } from "@/stores/uiStore";
import { GenerateBoxView } from "./GenerateBoxView";
import { useEngineSync } from "./useEngineSync";
import { useAutoResizeTextarea, useClickAway } from "./useGenerateBoxEffects";
import { useGenerationActions } from "./useGenerationActions";
import { useProfileSync } from "./useProfileSync";

interface FloatingGenerateBoxProps {
	showVoiceSelector?: boolean;
}

export function FloatingGenerateBox({
	showVoiceSelector = true,
}: FloatingGenerateBoxProps) {
	const selectedProfileId = useUIStore((state) => state.selectedProfileId);
	const setSelectedProfileId = useUIStore(
		(state) => state.setSelectedProfileId,
	);
	const setSelectedEngine = useUIStore((state) => state.setSelectedEngine);
	const { data: selectedProfile } = useProfile(selectedProfileId || "");
	const { data: profiles } = useProfiles();
	const [isExpanded, setIsExpanded] = useState(false);
	const [isInstructExpanded, setIsInstructExpanded] = useState(false);
	const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);
	const isStoriesRoute = !!useMatchRoute()({ to: "/stories" });
	const selectedStoryId = useStoryStore((state) => state.selectedStoryId);
	const { data: currentStory } = useStory(selectedStoryId);
	const addPendingStoryAdd = useGenerationStore((s) => s.addPendingStoryAdd);

	const { composeMutation, effectPresets, form, handleSubmit, isPending } =
		useGenerationActions({
			selectedProfileId,
			selectedPresetId,
			isStoriesRoute,
			selectedStoryId,
			setIsExpanded,
			addPendingStoryAdd,
			selectedProfile,
		});

	useProfileSync({
		selectedProfile,
		effectPresets,
		profiles,
		selectedProfileId,
		setSelectedProfileId,
		setSelectedPresetId,
		form,
	});

	useClickAway({ isExpanded, setIsExpanded, containerRef });
	useAutoResizeTextarea({ textareaRef, isExpanded });

	const { watchedEngine, supportsInstruct, supportsParalinguistic } =
		useEngineSync({
			form,
			setSelectedEngine,
		});

	async function onSubmit(data: Parameters<typeof handleSubmit>[0]) {
		await handleSubmit(data, selectedProfileId);
	}

	return (
		<GenerateBoxView
			showVoiceSelector={showVoiceSelector}
			isStoriesRoute={isStoriesRoute}
			isExpanded={isExpanded}
			setIsExpanded={setIsExpanded}
			textareaRef={textareaRef}
			supportsParalinguistic={supportsParalinguistic}
			selectedProfile={selectedProfile}
			currentStory={currentStory}
			composeMutation={composeMutation}
			selectedProfileId={selectedProfileId}
			isInstructExpanded={isInstructExpanded}
			setIsInstructExpanded={setIsInstructExpanded}
			isPending={isPending}
			supportsInstruct={supportsInstruct}
			profiles={profiles}
			selectedPresetId={selectedPresetId}
			setSelectedPresetId={setSelectedPresetId}
			setSelectedProfileId={setSelectedProfileId}
			effectPresets={effectPresets}
			watchedEngine={watchedEngine}
			form={form}
			onSubmit={onSubmit}
		/>
	);
}
