import { AnimatePresence, motion } from "framer-motion";
import type { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
	FormControl,
	FormField,
	FormItem,
	FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import type { GenerationFormValues } from "@/lib/hooks/useGenerationForm";

interface InstructPanelProps {
	isInstructExpanded: boolean;
	supportsInstruct: boolean;
	form: UseFormReturn<GenerationFormValues>;
}

export function InstructPanel({
	isInstructExpanded,
	supportsInstruct,
	form,
}: InstructPanelProps) {
	const { t } = useTranslation();

	return (
		<AnimatePresence>
			{isInstructExpanded && supportsInstruct && (
				<motion.div
					initial={{ opacity: 0, height: 0 }}
					animate={{ opacity: 1, height: "auto" }}
					exit={{ opacity: 0, height: 0 }}
					transition={{ duration: 0.2, ease: "easeOut" }}
					className="overflow-hidden"
				>
					<FormField
						control={form.control}
						name="instruct"
						render={({ field }) => (
							<FormItem className="mt-2">
								<FormControl>
									<Textarea
										{...field}
										placeholder={t("generation.instruct.placeholder")}
										className="resize-none bg-transparent border border-accent/20 focus-visible:ring-1 focus-visible:ring-accent/40 rounded-lg text-sm placeholder:text-muted-foreground/60 w-full px-3 py-2"
										style={{ minHeight: "60px", maxHeight: "160px" }}
										maxLength={500}
									/>
								</FormControl>
								<FormMessage className="text-xs" />
							</FormItem>
						)}
					/>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
