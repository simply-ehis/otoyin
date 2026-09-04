import { AdjustmentsHorizontalIcon as SlidersHorizontal } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

interface InstructToggleButtonProps {
	isExpanded: boolean;
	supportsInstruct: boolean;
	isInstructExpanded: boolean;
	setIsInstructExpanded: React.Dispatch<React.SetStateAction<boolean>>;
}

export function InstructToggleButton({
	isExpanded,
	supportsInstruct,
	isInstructExpanded,
	setIsInstructExpanded,
}: InstructToggleButtonProps) {
	const { t } = useTranslation();

	return (
		<AnimatePresence>
			{isExpanded && supportsInstruct && (
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
							role="switch"
							onClick={() => setIsInstructExpanded((prev) => !prev)}
							className={cn(
								"size-10 rounded-full transition-colors duration-200",
								isInstructExpanded
									? "bg-accent text-accent-foreground border border-accent hover:bg-accent/90"
									: "bg-card border border-border hover:bg-accent",
							)}
							aria-label={
								isInstructExpanded
									? t("generation.instruct.hide")
									: t("generation.instruct.show")
							}
							aria-checked={isInstructExpanded}
							title={t("generation.instruct.tooltip")}
						>
							<SlidersHorizontal className="size-4" />
						</Button>
						<span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded-md bg-popover px-3 py-1.5 text-xs text-popover-foreground border border-border opacity-0 transition-opacity group-hover:opacity-100 z-[9999]">
							{t("generation.instruct.tooltip")}
						</span>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
