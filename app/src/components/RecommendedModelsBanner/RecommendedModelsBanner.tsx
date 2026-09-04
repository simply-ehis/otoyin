import { SpeakerWaveIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { RecommendedModel } from "@/lib/api/types";
import { MODEL_DISPLAY_NAMES } from "@/lib/hooks/useRestoreActiveTasks";

const DISMISS_KEY = "Otoyin.recommended-banner.dismissed";

function displayName(model: RecommendedModel): string {
	return MODEL_DISPLAY_NAMES[model.model_name] ?? model.model_name;
}

/**
 * Dismissible "starter pack" banner driven by GET /models/recommended.
 *
 * Shows missing recommended models and links to the Store for download.
 */
export function RecommendedModelsBanner() {
	const [missing, setMissing] = useState<RecommendedModel[] | null>(null);
	const [dismissed, setDismissed] = useState<boolean>(() => {
		try {
			return localStorage.getItem(DISMISS_KEY) === "1";
		} catch {
			return false;
		}
	});

	useEffect(() => {
		if (dismissed) {
			return;
		}
		let cancelled = false;
		apiClient
			.getRecommendedModels()
			.then((res) => {
				if (!cancelled) {
					setMissing(res.missing);
				}
			})
			.catch((err) => {
				debug.log("[recommended-models] check failed:", err);
			});
		return () => {
			cancelled = true;
		};
	}, [dismissed]);

	const dismiss = useCallback(() => {
		setDismissed(true);
		try {
			localStorage.setItem(DISMISS_KEY, "1");
		} catch {
			// localStorage unavailable — dismiss for this session only
		}
	}, []);

	if (dismissed || !missing || missing.length === 0) {
		return null;
	}

	return (
		<section
			className="mx-8 mt-3 rounded-lg border border-border bg-card/80 px-4 py-2.5"
			aria-label="Recommended models"
		>
			<div className="flex items-center gap-3">
				<SpeakerWaveIcon
					className="size-4 shrink-0 text-muted-foreground"
					aria-hidden="true"
				/>
				<div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
					<span className="text-xs font-medium">
						{missing.length} model{missing.length > 1 ? "s" : ""} missing for
						full studio
					</span>
					<span className="text-xs text-muted-foreground hidden sm:inline">
						({missing.map((m) => displayName(m)).join(", ")})
					</span>
					<Link
						to="/store"
						className="text-xs font-medium text-accent hover:underline"
					>
						Get from Store
					</Link>
				</div>

				<button
					type="button"
					onClick={dismiss}
					title="Dismiss"
					aria-label="Dismiss recommendation"
					className="shrink-0 rounded p-1 hover:bg-accent/20"
				>
					<XMarkIcon
						className="size-3.5 text-muted-foreground"
						aria-hidden="true"
					/>
				</button>
			</div>
		</section>
	);
}

import { debug } from "../../lib/utils/debug";
