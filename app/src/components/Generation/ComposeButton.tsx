import { Squares2X2Icon as Dices } from "@heroicons/react/24/outline";
import type { UseMutationResult } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import type { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/Spinner";
import type { VoiceProfileResponse } from "@/lib/api/types";
import type { GenerationFormValues } from "@/lib/hooks/useGenerationForm";

interface ComposeButtonProps {
	selectedProfile?: VoiceProfileResponse;
	selectedProfileId: string | null;
	composeMutation: UseMutationResult<{ text: string }, Error, void, unknown>;
	form: UseFormReturn<GenerationFormValues>;
	setIsExpanded: (value: boolean) => void;
}

export function ComposeButton({
	selectedProfile,
	selectedProfileId,
	composeMutation,
	form,
	setIsExpanded,
}: ComposeButtonProps) {
	const { t } = useTranslation();

	return (
		<AnimatePresence>
			{selectedProfile?.personality?.trim() && (
				<motion.div
					initial={{ opacity: 0, scale: 0.8 }}
					animate={{ opacity: 1, scale: 1 }}
					exit={{ opacity: 0, scale: 0.8 }}
					transition={{ duration: 0.2 }}
				>
					<div className="group relative">
						<Button
							type="button"
							variant="ghost"
							size="icon"
							disabled={composeMutation.isPending || !selectedProfileId}
							onClick={async () => {
								const result = await composeMutation.mutateAsync();
								form.setValue("text", result.text, { shouldDirty: true });
								setIsExpanded(true);
							}}
							className="size-10 rounded-full bg-card border border-border hover:bg-accent transition-colors duration-200"
							aria-label={t("generation.compose.ariaLabel")}
						>
							{composeMutation.isPending ? (
								<Spinner size="md" />
							) : (
								<Dices className="size-4" />
							)}
						</Button>
						<span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded-md bg-popover px-3 py-1.5 text-xs text-popover-foreground border border-border opacity-0 transition-opacity group-hover:opacity-100 z-[9999]">
							{t("generation.compose.tooltip")}
						</span>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
