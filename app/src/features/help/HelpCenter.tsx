import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import type { Feature, HelpSearchResult } from "@/lib/api/types";
import { showStudioErrorToast } from "@/lib/errors";
import { SearchInput } from "@/ui/input";
import {
	EmptyState,
	ErrorState,
	LoadingState,
	ScreenHeader,
} from "@/ui/states";

/**
 * In-app help center: browsable feature catalog + debounced search,
 * served by GET /help/features and /help/search (no new backend needed).
 */
export function HelpCenter() {
	const [features, setFeatures] = useState<Feature[] | null>(null);
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<HelpSearchResult[] | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		apiClient
			.getHelpFeatures()
			.then((res) => setFeatures(res.features))
			.catch((err: unknown) => {
				setError(err instanceof Error ? err.message : "Could not load help");
			})
			.finally(() => setLoading(false));
	}, []);

	useEffect(() => {
		const q = query.trim();
		if (!q) {
			setResults(null);
			return;
		}
		const timer = window.setTimeout(() => {
			apiClient
				.searchHelp(q)
				.then((res) => setResults(res.results))
				.catch((err: unknown) => showStudioErrorToast(err));
		}, 250);
		return () => window.clearTimeout(timer);
	}, [query]);

	const items = results ?? features ?? [];

	return (
		<div className="flex min-h-0 flex-col gap-4">
			<ScreenHeader title="Help" />
			<SearchInput
				aria-label="Search help"
				placeholder="Search features…"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				onClear={() => setQuery("")}
			/>
			{loading ? (
				<LoadingState label="Loading help" lines={4} />
			) : error ? (
				<ErrorState
					title="Could not load help"
					body={error}
					onRetry={() => window.location.reload()}
				/>
			) : items.length === 0 ? (
				<EmptyState
					title={query ? "No matches" : "No help topics"}
					body={
						query
							? "Try different words — search matches names, summaries, and keywords."
							: "The help catalog is empty on this build."
					}
				/>
			) : (
				<ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
					{items.map((item) => (
						<li
							key={item.id}
							className="rounded-md border border-border bg-card px-4 py-3"
						>
							<p className="flex items-baseline gap-2">
								<span className="text-sm font-medium text-foreground">
									{item.name}
								</span>
								<span className="text-xs text-muted-foreground">
									{item.category} · {item.where}
								</span>
							</p>
							<p className="mt-1 text-[13px] text-muted-foreground">
								{item.summary}
							</p>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
