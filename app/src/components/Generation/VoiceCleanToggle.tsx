import { AdjustmentsHorizontalIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import type { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { FormControl, FormField, FormItem } from "@/components/ui/form";
import type { GenerationFormValues } from "@/lib/hooks/useGenerationForm";
import { cn } from "@/lib/utils/cn";

interface VoiceCleanToggleProps {
	form: UseFormReturn<GenerationFormValues>;
}

export function VoiceCleanToggle({ form }: VoiceCleanToggleProps) {
	const { t } = useTranslation();

	return (
		<AnimatePresence>
			<motion.div
				initial={{ opacity: 0, scale: 0.8 }}
				animate={{ opacity: 1, scale: 1 }}
				exit={{ opacity: 0, scale: 0.8 }}
				transition={{ duration: 0.2 }}
			>
				<FormField
					control={form.control}
					name="voiceClean"
					render={({ field }) => {
						const active = !!field.value;
						return (
							<FormItem className="space-y-0">
								<FormControl>
									<div className="group relative">
										<Button
											type="button"
											variant="ghost"
											size="icon"
											role="switch"
											onClick={() => field.onChange(!active)}
											className={cn(
												"size-10 rounded-full transition-colors duration-200",
												active
													? "bg-accent text-accent-foreground border border-accent hover:bg-accent/90"
													: "bg-card border border-border hover:bg-accent",
											)}
											aria-label={
												active
													? t("generation.voiceClean.ariaLabelActive")
													: t("generation.voiceClean.ariaLabelInactive")
											}
											aria-checked={active}
											title={
												active
													? t("generation.voiceClean.tooltipActive")
													: t("generation.voiceClean.tooltipInactive")
											}
										>
											<AdjustmentsHorizontalIcon className="size-4" />
										</Button>
										<span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded-md bg-popover px-3 py-1.5 text-xs text-popover-foreground border border-border opacity-0 transition-opacity group-hover:opacity-100 z-[9999]">
											{active
												? t("generation.voiceClean.tooltipActive")
												: t("generation.voiceClean.tooltipInactive")}
										</span>
									</div>
								</FormControl>
							</FormItem>
						);
					}}
				/>
			</motion.div>
		</AnimatePresence>
	);
}
