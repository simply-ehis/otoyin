import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { MarketplaceProduct } from "@/lib/api/types";
import { showStudioErrorToast } from "@/lib/errors";
import { getDeviceId, marketplaceClient } from "@/lib/marketplace";
import { Button } from "@/ui/button";
import { StarRating } from "./StarRating";
import { formatSize } from "./storeUtils";

const MAX_DESC_LENGTH = 300;

/**
 * Detail-modal lower section: aggregate rating, long description (expandable),
 * languages, size & license, user reviews, and the review composer.
 */
export function ProductReviews({
	product,
	open,
}: {
	product: MarketplaceProduct;
	open: boolean;
}) {
	const queryClient = useQueryClient();
	const [descExpanded, setDescExpanded] = useState(false);
	const [rating, setRating] = useState(5);
	const [comment, setComment] = useState("");
	const [submittingReview, setSubmittingReview] = useState(false);

	const reviewsQ = useQuery({
		queryKey: ["marketplace", "reviews", product.id],
		queryFn: () => marketplaceClient.fetchReviews(product.id),
		enabled: open,
		staleTime: 60_000,
	});

	const avgRating = (product as unknown as { avg_rating?: number }).avg_rating;
	const reviewCount = (product as unknown as { review_count?: number })
		.review_count;
	const longDescription = (product as unknown as { long_description?: string })
		.long_description;
	const languages = (product as unknown as { languages?: string[] }).languages;
	const sizeMb = (product as unknown as { size_mb?: number }).size_mb;
	const license = (product as unknown as { license?: string }).license;

	return (
		<div className="rounded-lg border bg-secondary p-3">
			{/* aggregate rating */}
			<div className="flex items-center gap-2">
				{avgRating ? (
					<>
						<StarRating score={(avgRating / 5) * 10} size="sm" />
						<span className="text-xs font-medium text-foreground">
							{avgRating.toFixed(1)} · {reviewCount ?? 0} reviews
						</span>
					</>
				) : (
					<>
						<span className="text-xs text-muted-foreground">
						</span>
					</>
				)}
			</div>

			{longDescription && (
				<div className="space-y-2 border-t pt-2">
					{longDescription.length > MAX_DESC_LENGTH && !descExpanded ? (
						<>
							<p className="text-xs leading-relaxed text-muted-foreground line-clamp-3">
								{longDescription}
							</p>
							<button
								type="button"
								onClick={() => setDescExpanded(true)}
								className="mt-1 text-xs font-medium text-accent hover:underline"
							>
								Read more
							</button>
						</>
					) : (
						<p className="text-xs leading-relaxed text-muted-foreground">
							{longDescription}
						</p>
					)}
					{descExpanded && longDescription.length > MAX_DESC_LENGTH && (
						<button
							type="button"
							onClick={() => setDescExpanded(false)}
							className="text-xs font-medium text-accent hover:underline"
						>
							Show less
						</button>
					)}
				</div>
			)}

			{languages && languages.length > 0 && (
				<div className="space-y-2 border-t pt-2">
					<h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Languages
					</h4>
					<div className="flex flex-wrap gap-1">
						{languages.slice(0, 8).map((l) => (
							<span
								key={l}
								className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground"
							>
								{l}
							</span>
						))}
					</div>
				</div>
			)}

			{sizeMb ? (
				<div className="space-y-1 border-t pt-2">
					<h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Size & License
					</h4>
					<span className="text-xs text-muted-foreground">
						{formatSize(sizeMb)} · {license || "commercial"}
					</span>
				</div>
			) : null}

			{reviewsQ.data && reviewsQ.data.length > 0 && (
				<div className="space-y-2 border-t pt-2">
					<h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Reviews
					</h4>
					<div className="space-y-1.5 border-t border-border/40 pt-2">
						{reviewsQ.data.slice(0, 3).map((r) => (
							<div
								key={r.id}
								className="border-b border-border/40 pb-1 text-xs last:border-0"
							>
								<span className="font-medium">
									{"★".repeat(r.rating)}
									{"☆".repeat(5 - r.rating)}
								</span>{" "}
								<span className="text-muted-foreground">
									{r.comment || "—"}
								</span>
							</div>
						))}
					</div>
				</div>
			)}

			{/* review composer */}
			<div className="flex gap-2 border-t pt-2">
				<select
					value={rating}
					onChange={(e) => setRating(Number(e.target.value))}
					className="rounded-md border border-border bg-background px-2 py-1 text-xs"
					aria-label="Review rating"
				>
					{[5, 4, 3, 2, 1].map((n) => (
						<option key={n} value={n}>
							{n}★
						</option>
					))}
				</select>
				<input
					value={comment}
					onChange={(e) => setComment(e.target.value)}
					placeholder="Write a review…"
					className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-accent"
					maxLength={200}
					aria-label="Review comment"
				/>
				<Button
					size="sm"
					disabled={submittingReview}
					onClick={async () => {
						setSubmittingReview(true);
						try {
							await marketplaceClient.postReview(
								product.id,
								rating,
								comment,
								getDeviceId(),
							);
							setComment("");
							await reviewsQ.refetch();
							await queryClient.invalidateQueries({
								queryKey: ["marketplace", "catalog"],
							});
						} catch (e) {
							showStudioErrorToast(e);
						} finally {
							setSubmittingReview(false);
						}
					}}
				>
					{submittingReview ? "…" : "Post"}
				</Button>
			</div>
		</div>
	);
}
