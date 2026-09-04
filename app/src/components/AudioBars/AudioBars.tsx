import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";

interface AudioBarsProps {
	mode: "generating" | "playing" | "idle";
	className?: string;
}

export function AudioBars({ mode, className }: AudioBarsProps) {
	return (
		<div className={cn("flex items-center gap-1 h-5 shrink-0", className)}>
			{[0, 1, 2, 3, 4].map((i) => (
				<motion.div
					key={`${mode}-${i}`}
					className={cn(
						"w-[3px] rounded-full",
						mode === "idle" ? "bg-accent/30" : "bg-accent",
					)}
					animate={
						mode === "generating"
							? { height: ["6px", "16px", "6px"] }
							: mode === "playing"
								? { height: ["8px", "14px", "4px", "12px", "8px"] }
								: { height: "8px" }
					}
					transition={
						mode === "generating"
							? {
									duration: 0.6,
									repeat: Infinity,
									delay: i * 0.08,
									ease: "easeInOut",
								}
							: mode === "playing"
								? {
										duration: 1.2,
										repeat: Infinity,
										delay: i * 0.15,
										ease: "easeInOut",
									}
								: { duration: 0.4, ease: "easeOut" }
					}
				/>
			))}
		</div>
	);
}

export default AudioBars;
