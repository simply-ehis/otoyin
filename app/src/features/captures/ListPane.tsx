import { SparklesIcon } from "@heroicons/react/24/outline";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import type { CaptureResponse } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format";
import { SearchInput } from "@/ui/input";
import { Badge, Spinner } from "@/ui/primitives";
import { formatDurationMs, SourceBadge } from "./shared";

/**
 * Virtualized capture list: search header, snippet rows with source +
 * refined marker. Active row is a filled segment (never color alone).
 */
export function CapturesListPane({
	loading,
	items,
	scrollRef,
	selectedId,
	onSelect,
	search,
	onSearch,
	snippetOf,
}: {
	loading: boolean;
	items: CaptureResponse[];
	scrollRef: React.RefObject<HTMLDivElement | null>;
	selectedId: string | null;
	onSelect: (id: string) => void;
	search: string;
	onSearch: (value: string) => void;
	snippetOf: (capture: CaptureResponse) => string;
}) {
	const { t } = useTranslation();
	const virtualizer = useVirtualizer({
		count: items.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => 100,
		overscan: 5,
	});

	return (
		<div className="flex h-full w-[340px] shrink-0 flex-col border-r border-border">
			<div className="shrink-0 px-4 pb-2 pt-3">
				<p className="flex items-center gap-2">
					<span className="text-sm font-semibold text-foreground">
						{t("captures.title")}
					</span>
					<Badge tone="accent">{t("captures.beta")}</Badge>
				</p>
				<SearchInput
					aria-label={t("captures.searchPlaceholder")}
					placeholder={t("captures.searchPlaceholder")}
					value={search}
					onChange={(e) => onSearch(e.target.value)}
					onClear={() => onSearch("")}
					shortcut="Ctrl K"
					className="mt-2 [&_input]:h-8"
				/>
			</div>
			<div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
				<div className="px-4 pb-6">
					{loading ? (
						<output
							className="flex items-center justify-center px-4 py-12"
							aria-label="Loading captures"
						>
							<Spinner size="md" />
						</output>
					) : items.length === 0 ? (
						<p className="px-4 py-12 text-center text-sm text-muted-foreground">
							{search
								? t("captures.empty.noMatches", { query: search })
								: t("captures.empty.none")}
						</p>
					) : (
						<div
							className="relative w-full"
							style={{ height: virtualizer.getTotalSize() }}
						>
							{virtualizer.getVirtualItems().map((row) => {
								const capture = items[row.index];
								if (!capture) {
									return null;
								}
								const active = selectedId === capture.id;
								return (
									<div
										key={capture.id}
										className="absolute left-0 top-0 w-full"
										style={{ transform: `translateY(${row.start}px)` }}
									>
										<button
											type="button"
											onClick={() => onSelect(capture.id)}
											aria-current={active ? "true" : undefined}
											className={cn(
												"relative block w-full rounded-md border p-3 text-left transition-colors",
												"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
												active
													? "border-border bg-secondary"
													: "border-transparent hover:bg-secondary",
											)}
										>
											{active ? (
												<span
													aria-hidden="true"
													className="absolute bottom-1.5 left-0 top-1.5 w-[3px] rounded-r bg-accent"
												/>
											) : null}
											<span className="mb-1.5 flex items-center gap-2">
												<span className="text-xs font-medium text-muted-foreground">
													{formatDate(capture.created_at)}
												</span>
												<span className="flex-1" />
												<span className="text-xs tabular-nums text-muted-foreground/70">
													{formatDurationMs(capture.duration_ms)}
												</span>
											</span>
											<span className="mb-2 line-clamp-2 block text-[13px] leading-snug text-foreground/90">
												{snippetOf(capture)}
											</span>
											<span className="flex flex-wrap items-center gap-1.5">
												<SourceBadge source={capture.source} />
												{capture.transcript_refined ? (
													<Badge tone="accent">
														<SparklesIcon
															className="h-2.5 w-2.5"
															aria-hidden="true"
														/>
														{t("captures.transcript.refined")}
													</Badge>
												) : null}
											</span>
										</button>
									</div>
								);
							})}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
