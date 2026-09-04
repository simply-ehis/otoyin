import { SparklesIcon as Sparkles } from "@heroicons/react/24/outline";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import {
	ListPane,
	ListPaneHeader,
	ListPaneScroll,
	ListPaneSearch,
	ListPaneTitle,
	ListPaneTitleRow,
} from "@/components/ListPane";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/Spinner";
import type { CaptureResponse } from "@/lib/api/types";
import { BOTTOM_SAFE_AREA_PADDING } from "@/lib/constants/ui";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format";
import { formatDuration } from "./formatDuration";
import { SourceBadge } from "./SourceBadge";

type Props = {
	capturesLoading: boolean;
	filtered: CaptureResponse[];
	scrollRef: React.RefObject<HTMLDivElement | null>;
	selectedId: string | null;
	setSelectedId: (id: string) => void;
	search: string;
	setSearch: (s: string) => void;
	snippetOf: (capture: CaptureResponse) => string;
	isPlayerVisible: boolean;
};

export function CapturesListPane({
	capturesLoading,
	filtered,
	scrollRef,
	selectedId,
	setSelectedId,
	search,
	setSearch,
	snippetOf,
	isPlayerVisible,
}: Props) {
	const { t } = useTranslation();
	const virtualizer = useVirtualizer({
		count: filtered.length,
		getScrollElement: () => scrollRef.current ?? null,
		estimateSize: () => 100,
		overscan: 5,
	});

	return (
		<div className="w-[340px] shrink-0">
			<ListPane>
				<ListPaneHeader>
					<ListPaneTitleRow>
						<ListPaneTitle>{t("captures.title")}</ListPaneTitle>
						<Badge
							variant="secondary"
							className="h-5 px-1.5 -ml-2 text-xs font-medium text-accent bg-accent/10 border border-accent/20"
						>
							{t("captures.beta")}
						</Badge>
					</ListPaneTitleRow>
					<ListPaneSearch
						value={search}
						onChange={setSearch}
						placeholder={t("captures.searchPlaceholder")}
					/>
				</ListPaneHeader>

				<ListPaneScroll
					ref={scrollRef}
					className={cn(isPlayerVisible && BOTTOM_SAFE_AREA_PADDING)}
				>
					<div className="px-4 pb-6">
						{capturesLoading ? (
							<div className="px-4 py-12 flex items-center justify-center text-muted-foreground">
								<Spinner size="md" />
							</div>
						) : filtered.length === 0 ? (
							<div className="px-4 py-12 text-center text-sm text-muted-foreground">
								{search ? (
									<p>{t("captures.empty.noMatches", { query: search })}</p>
								) : (
									<p>{t("captures.empty.none")}</p>
								)}
							</div>
						) : (
							<div
								className="relative w-full"
								style={{ height: virtualizer.getTotalSize() }}
							>
								{virtualizer.getVirtualItems().map((virtualRow) => {
									const capture = filtered[virtualRow.index];
									const isActive = selectedId === capture.id;
									const refined = !!capture.transcript_refined;
									return (
										<div
											key={capture.id}
											ref={virtualizer.measureElement}
											data-index={virtualRow.index}
											style={{
												position: "absolute",
												top: 0,
												left: 0,
												width: "100%",
												transform: `translateY(${virtualRow.start}px)`,
											}}
										>
											<button
												type="button"
												onClick={() => setSelectedId(capture.id)}
												className={cn(
													"w-full text-left p-3 rounded-lg transition-colors block",
													isActive
														? "bg-muted/70 border border-border"
														: "border border-transparent hover:bg-muted/30",
												)}
											>
												<div className="flex items-center gap-2 mb-1.5">
													<span className="text-xs text-muted-foreground font-medium">
														{formatDate(capture.created_at)}
													</span>
													<div className="flex-1" />
													<span className="text-xs text-muted-foreground/70 tabular-nums">
														{formatDuration(capture.duration_ms)}
													</span>
												</div>
												<div className="text-[13px] text-foreground/90 line-clamp-2 leading-snug mb-2">
													{snippetOf(capture)}
												</div>
												<div className="flex items-center gap-2 flex-wrap">
													<SourceBadge source={capture.source} />
													{refined && (
														<Badge
															variant="secondary"
															className="h-5 px-1.5 text-xs gap-1 font-medium bg-accent/10 text-accent border border-accent/20"
														>
															<Sparkles className="h-2.5 w-2.5" />
															{t("captures.transcript.refined")}
														</Badge>
													)}
												</div>
											</button>
										</div>
									);
								})}
							</div>
						)}
					</div>
				</ListPaneScroll>
			</ListPane>
		</div>
	);
}
