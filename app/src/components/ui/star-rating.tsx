import { StarIcon as StarOutline } from "@heroicons/react/24/outline";
import { StarIcon } from "@heroicons/react/24/solid";

interface StarRatingProps {
	/** Quality score 0-10 */
	score: number;
	/** Category label shown next to stars */
	category?: string;
	/** Size variant */
	size?: "sm" | "md";
	className?: string;
}

/**
 * Per-category 10-star quality rating.
 *
 * Stars are filled left-to-right: a score of 7 fills 7 stars.
 * Category label is shown so users know they're comparing within
 * the same tier (TTS vs STT vs LLM etc.).
 */
export function StarRating({
	score,
	category,
	size = "sm",
	className = "",
}: StarRatingProps) {
	const clamped = Math.max(0, Math.min(10, Math.round(score)));
	const starSize = size === "sm" ? "size-2.5" : "size-3.5";
	const textSize = size === "sm" ? "text-xs" : "text-xs";

	const stars = Array.from({ length: 10 }, (_, i) =>
		i < clamped ? (
			<StarIcon // biome-ignore lint/suspicious/noArrayIndexKey: static 10-star array, key is unique
				key={`star-${i}`}
				className={`${starSize} text-amber-400`}
			/>
		) : (
			<StarOutline // biome-ignore lint/suspicious/noArrayIndexKey: static 10-star array, key is unique
				key={`star-${i}`}
				className={`${starSize} text-muted-foreground/25`}
			/>
		),
	);

	return (
		<span className={`inline-flex items-center gap-0.5 ${className}`}>
			{stars}
			{category && (
				<span
					className={`${textSize} text-muted-foreground ml-0.5 uppercase tracking-wider`}
				>
					{category}
				</span>
			)}
		</span>
	);
}

/**
 * Compact single-line rating: "?????????? 7/10"
 * Used in the model list row where space is tight.
 */
export function CompactRating({
	score,
	className = "",
}: {
	score: number;
	className?: string;
}) {
	const clamped = Math.max(0, Math.min(10, Math.round(score)));

	const stars = Array.from({ length: 10 }, (_, i) =>
		i < clamped ? (
			<StarIcon // biome-ignore lint/suspicious/noArrayIndexKey: static 10-star array, key is unique
				key={`star-${i}`}
				className="size-2 text-amber-400"
			/>
		) : (
			<StarOutline // biome-ignore lint/suspicious/noArrayIndexKey: static 10-star array, key is unique
				key={`star-${i}`}
				className="size-2 text-muted-foreground/20"
			/>
		),
	);

	return (
		<span
			className={`inline-flex items-center gap-0.5 text-xs text-muted-foreground ${className}`}
			title={`Quality: ${clamped}/10`}
		>
			{stars}
			<span className="ml-0.5 tabular-nums">{clamped}</span>
		</span>
	);
}
