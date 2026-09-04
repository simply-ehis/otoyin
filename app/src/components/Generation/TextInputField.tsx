import { motion } from "framer-motion";
import type { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
	FormControl,
	FormField,
	FormItem,
	FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import type {
	StoryDetailResponse,
	VoiceProfileResponse,
} from "@/lib/api/types";
import type { GenerationFormValues } from "@/lib/hooks/useGenerationForm";
import { useEngineCapabilities } from "./EngineModelSelector";
import { ParalinguisticInput } from "./ParalinguisticInput";
import { S2EmotionChips } from "./S2EmotionChips";

interface TextInputFieldProps {
	form: UseFormReturn<GenerationFormValues>;
	textareaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
	isExpanded: boolean;
	supportsParalinguistic: boolean;
	isStoriesRoute: boolean;
	selectedProfile?: VoiceProfileResponse;
	currentStory?: StoryDetailResponse;
	setIsExpanded: (value: boolean) => void;
	onClick?: () => void;
}

export function TextInputField({
	form,
	textareaRef,
	isExpanded,
	supportsParalinguistic,
	isStoriesRoute,
	selectedProfile,
	currentStory,
	setIsExpanded,
}: TextInputFieldProps) {
	const { t } = useTranslation();
	const selectedProfileId = !!selectedProfile;
	const engine = form.watch("engine") as string | undefined;
	const caps = useEngineCapabilities()[engine ?? ""];
	const supportedTags = caps?.supported_tags ?? [];

	return (
		<motion.div
			className="flex-1"
			transition={{ duration: 0.3, ease: "easeOut" }}
		>
			<S2EmotionChips form={form} engine={engine} textareaRef={textareaRef} />
			<FormField
				control={form.control}
				name="text"
				render={({ field }) => (
					<FormItem>
						<FormControl>
							<motion.div
								animate={{
									height: isExpanded ? "auto" : "32px",
								}}
								transition={{ duration: 0.15, ease: "easeOut" }}
								style={{ overflow: "hidden" }}
							>
								{supportsParalinguistic ? (
									<ParalinguisticInput
										value={field.value}
										onChange={field.onChange}
										supportedTags={supportedTags}
										placeholder={
											isStoriesRoute && currentStory
												? t("generation.placeholder.storyWithEffects", {
														name: currentStory.name,
													})
												: selectedProfile
													? t("generation.placeholder.effectsHint")
													: t("generation.placeholder.selectVoice")
										}
										className="px-3 py-2 resize-none bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none focus:ring-0 outline-none ring-0 rounded-lg text-sm w-full"
										style={{
											minHeight: isExpanded ? "100px" : "32px",
											maxHeight: "300px",
											overflowY: "auto",
										}}
										disabled={!selectedProfileId}
										onClick={() => setIsExpanded(true)}
										onFocus={() => setIsExpanded(true)}
									/>
								) : (
									<Textarea
										{...field}
										ref={(node: HTMLTextAreaElement | null) => {
											textareaRef.current = node;
											if (typeof field.ref === "function") {
												field.ref(node);
											}
										}}
										placeholder={
											isStoriesRoute && currentStory
												? t("generation.placeholder.story", {
														name: currentStory.name,
													})
												: selectedProfile
													? t("generation.placeholder.profile", {
															name: selectedProfile.name,
														})
													: t("generation.placeholder.selectVoice")
										}
										className="resize-none bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none focus:ring-0 outline-none ring-0 rounded-lg text-sm placeholder:text-muted-foreground/60 w-full"
										style={{
											minHeight: isExpanded ? "100px" : "32px",
											maxHeight: "300px",
										}}
										disabled={!selectedProfileId}
										onClick={() => setIsExpanded(true)}
										onFocus={() => setIsExpanded(true)}
									/>
								)}
							</motion.div>
						</FormControl>
						<FormMessage className="text-xs" />
					</FormItem>
				)}
			/>
		</motion.div>
	);
}
