import { motion } from "framer-motion";
import { getGame } from "./registry";

/** Inline nudge shown while generation is in flight. */
export function GameNudge({ onOpen }: { onOpen: () => void }) {
	const game = getGame(null);
	return (
		<motion.button
			type="button"
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: 8 }}
			onClick={onOpen}
			className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
			title={`Play ${game.label} while you wait`}
			aria-label={`Play ${game.label} while waiting`}
		>
			<span
				className="size-1.5 animate-pulse rounded-full bg-success"
				aria-hidden="true"
			/>
			Generating… play {game.label}?{" "}
			<span className="ml-1 hidden text-muted-foreground sm:inline">↗</span>
		</motion.button>
	);
}
