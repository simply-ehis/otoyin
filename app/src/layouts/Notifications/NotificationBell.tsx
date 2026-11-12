import {
	BellIcon,
	CheckCircleIcon,
	MegaphoneIcon,
} from "@heroicons/react/24/outline";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import type {
	ActiveDownloadTask,
	Offer,
	RecommendedModel,
	WhatsNewEntry,
} from "@/lib/api/types";
import { MODEL_DISPLAY_NAMES } from "@/lib/hooks/useRestoreActiveTasks";
import { useContentStore } from "@/stores/contentStore";
import { Spinner } from "@/ui/Spinner";

const ROLE_LABELS: Record<string, string> = {
	tts: "Voice engine",
	stt: "Transcription",
	llm: "Assistant brain",
};

function displayName(name: string): string {
	return MODEL_DISPLAY_NAMES[name] ?? name;
}

/**
 * Notification bell for the header cluster. Shows in-progress downloads,
 * recommended models (with a Store link), offers, and what's new.
 */
export function NotificationBell() {
	const [open, setOpen] = useState(false);
	const [missing, setMissing] = useState<RecommendedModel[]>([]);
	const [activeDownloads, setActiveDownloads] = useState<ActiveDownloadTask[]>(
		[],
	);
	const [offers, setOffers] = useState<Offer[]>([]);
	const [whatsNew, setWhatsNew] = useState<WhatsNewEntry[]>([]);
	const claimedOffers = useContentStore((s) => s.claimedOffers);
	const seenVersions = useContentStore((s) => s.seenWhatsNewVersions);
	const markWhatsNewSeen = useContentStore((s) => s.markWhatsNewSeen);
	const claimOffer = useContentStore((s) => s.claimOffer);
	const containerRef = useRef<HTMLDivElement>(null);

	const refresh = useCallback(async () => {
		try {
			const [recommended, tasks, offersRes, whatsNewRes] = await Promise.all([
				apiClient.getRecommendedModels(),
				apiClient.getActiveTasks(),
				apiClient.getOffers(),
				apiClient.getWhatsNew(),
			]);
			setMissing(recommended.missing);
			setActiveDownloads(tasks.downloads);
			setOffers(offersRes);
			setWhatsNew(whatsNewRes);
		} catch {
			// Server not ready — the bell stays quiet.
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	// Close on outside click or Escape.
	useEffect(() => {
		if (!open) {
			return;
		}
		const onPointerDown = (event: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(event.target as Node)
			) {
				setOpen(false);
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);

	const unclaimedOffers = offers.filter((o) => !claimedOffers.includes(o.id));
	const unseenWhatsNew = whatsNew.filter(
		(w) => !seenVersions.includes(w.version),
	);
	// Badge counts live activity only. Bundled content (missing-model
	// suggestions, offers, release notes) is listed in the drawer but must
	// not inflate the badge — that reads as false noise on fresh installs.
	const attentionCount = activeDownloads.length;

	return (
		<div ref={containerRef} className="relative">
			<button
				type="button"
				onClick={() => setOpen((prev) => !prev)}
				className={`relative size-9 rounded-full flex items-center justify-center transition-colors duration-200 ${
					open
						? "bg-accent text-accent-foreground shadow-lg"
						: "bg-secondary text-muted-foreground hover:bg-secondary-hover hover:text-foreground"
				}`}
				title="Notifications"
				aria-label={
					attentionCount > 0
						? `Notifications (${attentionCount} new)`
						: "Notifications"
				}
			>
				<BellIcon className="size-4" aria-hidden="true" />
				{attentionCount > 0 && (
					<span
						className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-primary text-[8px] font-semibold text-primary-foreground flex items-center justify-center"
						aria-hidden="true"
					>
						{attentionCount}
					</span>
				)}
			</button>

			{open && (
				<section
					className="absolute right-0 mt-2 w-80 rounded-lg border border-border bg-card shadow-lg"
					aria-label="Notification drawer"
				>
					<div className="px-4 py-3 border-b border-border flex items-center justify-between">
						<p className="text-sm font-medium">Notifications</p>
						{attentionCount > 0 && (
							<button
								type="button"
								onClick={() => {
									// Mark all what's new as seen
									for (const w of unseenWhatsNew) {
										markWhatsNewSeen(w.version);
									}
									// Mark all offers as claimed
									for (const o of unclaimedOffers) {
										claimOffer(o.id);
									}
								}}
								className="text-xs text-muted-foreground hover:text-foreground"
							>
								Dismiss all
							</button>
						)}
					</div>

					<div className="max-h-80 overflow-y-auto px-4 py-3 space-y-4">
						{activeDownloads.length > 0 && (
							<section aria-label="In-progress downloads">
								<p className="text-xs font-medium text-muted-foreground mb-2">
									In progress
								</p>
								<ul className="space-y-1.5">
									{activeDownloads.map((download) => (
										<li
											key={download.model_name}
											className="flex items-center gap-2 text-xs"
										>
											<Spinner size="sm" />
											<span className="truncate">
												{displayName(download.model_name)}
											</span>
											<span className="ml-auto text-muted-foreground">
												downloading…
											</span>
										</li>
									))}
								</ul>
							</section>
						)}

						{unseenWhatsNew.length > 0 && (
							<section aria-label="What's new">
								<p className="mb-2 text-xs font-medium text-muted-foreground">
									What's new
								</p>
								<ul className="space-y-1.5">
									{unseenWhatsNew.map((entry) => (
										<li
											key={entry.version}
											className="flex items-center gap-2 text-xs"
										>
											<MegaphoneIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
											<div className="min-w-0 flex-1">
												<p className="truncate font-medium">{entry.title}</p>
												<p className="text-xs text-muted-foreground">
													v{entry.version}
												</p>
											</div>
											<Link
												to="/whats-new"
												className="shrink-0 text-accent hover:underline"
											>
												View
											</Link>
										</li>
									))}
								</ul>
							</section>
						)}

						{unclaimedOffers.length > 0 && (
							<section aria-label="Offers">
								<p className="mb-2 text-xs font-medium text-muted-foreground">
									Special offers
								</p>
								<ul className="space-y-1.5">
									{unclaimedOffers.map((offer) => (
										<li
											key={offer.id}
											className="flex items-center gap-2 text-xs"
										>
											<div className="min-w-0 flex-1">
												<p className="truncate font-medium">{offer.title}</p>
												{offer.discount_label && (
													<p className="text-xs text-success-text">
														{offer.discount_label}
													</p>
												)}
											</div>
											<Link
												to="/offers"
												className="shrink-0 text-accent hover:underline"
											>
												View
											</Link>
										</li>
									))}
								</ul>
							</section>
						)}

						{missing.length > 0 ? (
							<section aria-label="Recommended downloads">
								<p className="text-xs font-medium text-muted-foreground mb-2">
									Recommended
								</p>
								<ul className="space-y-1.5">
									{missing.map((model) => (
										<li
											key={model.model_name}
											className="flex items-center gap-2 text-xs"
										>
											<div className="min-w-0 flex-1">
												<p className="truncate font-medium">
													{displayName(model.model_name)}
												</p>
												<p className="text-xs text-muted-foreground">
													{ROLE_LABELS[model.role] ?? model.role}
												</p>
											</div>
										</li>
									))}
								</ul>
								<Link
									to="/store"
									className="mt-3 block w-full rounded-md bg-primary px-3 py-2 text-center text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
								>
									Get from Store ({missing.length})
								</Link>
							</section>
						) : (
							activeDownloads.length === 0 && (
								<div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
									<CheckCircleIcon
										className="size-4 text-success-text"
										aria-hidden="true"
									/>
									All caught up — recommended models are ready.
								</div>
							)
						)}
					</div>
				</section>
			)}
		</div>
	);
}
