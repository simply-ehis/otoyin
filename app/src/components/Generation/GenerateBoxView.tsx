import { SparklesIcon as Sparkles } from "@heroicons/react/24/outline";
import type { UseMutationResult } from "@tanstack/react-query";
import type { UseFormReturn } from "react-hook-form";
import { Form } from "@/components/ui/form";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import type {
	EffectPresetResponse,
	StoryDetailResponse,
	VoiceProfileResponse,
} from "@/lib/api/types";
import type { GenerationFormValues } from "@/lib/hooks/useGenerationForm";
import { GenerateBoxInputRow } from "./GenerateBoxInputRow";
import { GenerationControlsRow } from "./GenerationControlsRow";
import { InstructPanel } from "./InstructPanel";

interface GenerateBoxViewProps {
	showVoiceSelector: boolean;
	isStoriesRoute: boolean;
	isExpanded: boolean;
	setIsExpanded: (value: boolean) => void;
	textareaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
	supportsParalinguistic: boolean;
	selectedProfile?: VoiceProfileResponse;
	currentStory?: StoryDetailResponse;
	composeMutation: UseMutationResult<{ text: string }, Error, void, unknown>;
	selectedProfileId: string | null;
	isInstructExpanded: boolean;
	setIsInstructExpanded: React.Dispatch<React.SetStateAction<boolean>>;
	isPending: boolean;
	supportsInstruct: boolean;
	profiles?: VoiceProfileResponse[];
	selectedPresetId: string | null;
	setSelectedPresetId: (id: string | null) => void;
	setSelectedProfileId: (id: string | null) => void;
	effectPresets?: EffectPresetResponse[];
	watchedEngine: string | undefined;
	form: UseFormReturn<GenerationFormValues>;
	onSubmit: (data: GenerationFormValues) => void;
}

export function GenerateBoxView({
	showVoiceSelector,
	isStoriesRoute,
	isExpanded,
	setIsExpanded,
	textareaRef,
	supportsParalinguistic,
	selectedProfile,
	currentStory,
	composeMutation,
	selectedProfileId,
	isInstructExpanded,
	setIsInstructExpanded,
	isPending,
	supportsInstruct,
	profiles,
	selectedPresetId,
	setSelectedPresetId,
	setSelectedProfileId,
	effectPresets,
	watchedEngine,
	form,
	onSubmit,
}: GenerateBoxViewProps) {
	return (
		<div className="shrink-0">
			<div className="bg-card border border-border rounded-xl shadow-sm p-4">
				<ScreenHeader
					icon={<Sparkles className="size-5" />}
					title="Generate"
					description="Create voice audio from text"
					className="px-3 py-2"
				/>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)}>
						<GenerateBoxInputRow
							form={form}
							textareaRef={textareaRef}
							isExpanded={isExpanded}
							setIsExpanded={setIsExpanded}
							supportsParalinguistic={supportsParalinguistic}
							isStoriesRoute={isStoriesRoute}
							selectedProfile={selectedProfile}
							currentStory={currentStory}
							composeMutation={composeMutation}
							selectedProfileId={selectedProfileId}
							isInstructExpanded={isInstructExpanded}
							setIsInstructExpanded={setIsInstructExpanded}
							isPending={isPending}
							supportsInstruct={supportsInstruct}
						/>

						<InstructPanel
							isInstructExpanded={isInstructExpanded}
							supportsInstruct={supportsInstruct}
							form={form}
						/>

						<GenerationControlsRow
							showVoiceSelector={showVoiceSelector}
							selectedProfileId={selectedProfileId}
							setSelectedProfileId={setSelectedProfileId}
							profiles={profiles}
							form={form}
							selectedPresetId={selectedPresetId}
							setSelectedPresetId={setSelectedPresetId}
							effectPresets={effectPresets}
							selectedProfile={selectedProfile}
							watchedEngine={watchedEngine}
						/>
					</form>
				</Form>
			</div>
		</div>
	);
}
