import type { UseMutationResult } from "@tanstack/react-query";
import type { UseFormReturn } from "react-hook-form";
import type {
	StoryDetailResponse,
	VoiceProfileResponse,
} from "@/lib/api/types";
import type { GenerationFormValues } from "@/lib/hooks/useGenerationForm";
import { ComposeButton } from "./ComposeButton";
import { GenerateButton } from "./GenerateButton";
import { InstructToggleButton } from "./InstructToggleButton";
import { PersonaButton } from "./PersonaButton";
import { TextInputField } from "./TextInputField";

interface GenerateBoxInputRowProps {
	form: UseFormReturn<GenerationFormValues>;
	textareaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
	isExpanded: boolean;
	setIsExpanded: (value: boolean) => void;
	supportsParalinguistic: boolean;
	isStoriesRoute: boolean;
	selectedProfile?: VoiceProfileResponse;
	currentStory?: StoryDetailResponse;
	composeMutation: UseMutationResult<{ text: string }, Error, void, unknown>;
	selectedProfileId: string | null;
	isInstructExpanded: boolean;
	setIsInstructExpanded: React.Dispatch<React.SetStateAction<boolean>>;
	isPending: boolean;
	supportsInstruct: boolean;
}

export function GenerateBoxInputRow({
	form,
	textareaRef,
	isExpanded,
	setIsExpanded,
	supportsParalinguistic,
	isStoriesRoute,
	selectedProfile,
	currentStory,
	composeMutation,
	selectedProfileId,
	isInstructExpanded,
	setIsInstructExpanded,
	isPending,
	supportsInstruct,
}: GenerateBoxInputRowProps) {
	return (
		<div className="flex gap-2">
			<TextInputField
				form={form}
				textareaRef={textareaRef}
				isExpanded={isExpanded}
				supportsParalinguistic={supportsParalinguistic}
				isStoriesRoute={isStoriesRoute}
				selectedProfile={selectedProfile}
				currentStory={currentStory}
				setIsExpanded={setIsExpanded}
			/>

			<div className="flex items-start gap-2 shrink-0">
				<ComposeButton
					selectedProfile={selectedProfile}
					selectedProfileId={selectedProfileId}
					composeMutation={composeMutation}
					form={form}
					setIsExpanded={setIsExpanded}
				/>

				<PersonaButton selectedProfile={selectedProfile} form={form} />

				<InstructToggleButton
					isExpanded={isExpanded}
					supportsInstruct={supportsInstruct}
					isInstructExpanded={isInstructExpanded}
					setIsInstructExpanded={setIsInstructExpanded}
				/>

				<GenerateButton
					isPending={isPending}
					selectedProfileId={selectedProfileId}
				/>
			</div>
		</div>
	);
}
