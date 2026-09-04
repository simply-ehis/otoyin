import { cn } from "@/lib/utils/cn";

interface StarRatingProps {
	score: number;
	max?: number;
	size?: "xs" | "sm" | "md";
	showLabel?: boolean;
	className?: string;
}

const SIZE_CLASSES = {
	xs: "size-2.5",
	sm: "size-3",
	md: "size-3.5",
} as const;

const LABEL_CLASSES = {
	xs: "text-xs",
	sm: "text-xs",
	md: "text-xs",
} as const;

const STAR_POSITIONS = [1, 2, 3, 4, 5] as const;

/**
 * Display a 1–10 quality rating as filled/empty stars within a category.
 * Scores are rendered as stars out of 10 (each star = 1 point).
 */
export function StarRating({
	score,
	max = 10,
	size = "sm",
	showLabel = true,
	className,
}: StarRatingProps) {
	const clamped = Math.max(0, Math.min(max, Math.round(score)));
	const filledStars = Math.ceil((clamped / max) * 5);
	const starSize = SIZE_CLASSES[size];

	// Color based on score tier
	const tone =
		clamped >= 8
			? "text-amber-400"
			: clamped >= 6
				? "text-amber-300"
				: clamped >= 4
					? "text-muted-foreground"
					: "text-muted-foreground/50";

	return (
		<div
			className={cn("inline-flex items-center gap-0.5", className)}
			role="img"
			aria-label={`${clamped} out of ${max} quality`}
		>
			{STAR_POSITIONS.map((position) => {
				const filled = position <= filledStars;
				return (
					<svg
						key={position}
						viewBox="0 0 12 12"
						className={cn(starSize, filled ? tone : "text-muted-foreground/20")}
						fill="currentColor"
						aria-hidden="true"
					>
						<path d="M6 1l1.545 3.13L11 4.635 8.5 7.07l.59 3.44L6 8.885 2.91 10.51l.59-3.44L1 4.635l3.455-.505L6 1z" />
					</svg>
				);
			})}
			{showLabel && (
				<span
					className={cn(
						"ml-0.5 font-medium tabular-nums",
						LABEL_CLASSES[size],
						tone,
					)}
				>
					{clamped}
				</span>
			)}
		</div>
	);
}
