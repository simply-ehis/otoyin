import {
	ChevronDownIcon,
	ChevronUpIcon,
	MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ScreenHeader } from "@/ui/states";
import { WORKSPACE_GROUPS } from "./nav";

const ALL_TOOLS = WORKSPACE_GROUPS.flatMap((g) => g.tools);

/** Top tools shown by default — most commonly used first. */
const TOP_TOOL_IDS = [
	"timeline",
	"mixer",
	"effects",
	"studio",
	"voice-changer",
];

/**
 * Workspace landing: top 5 tools as large cards + "Show all" toggle + search.
 * Reduces cognitive load from 23 cards to 5 on first visit.
 */
export function WorkspaceLanding() {
	const [showAll, setShowAll] = useState(false);
	const [search, setSearch] = useState("");

	const filteredTools = useMemo(() => {
		if (!search.trim()) {
			return ALL_TOOLS;
		}
		const q = search.toLowerCase();
		return ALL_TOOLS.filter(
			(t) =>
				t.label.toLowerCase().includes(q) ||
				t.description.toLowerCase().includes(q),
		);
	}, [search]);

	const topTools = ALL_TOOLS.filter((t) => TOP_TOOL_IDS.includes(t.id));
	const visibleGroups = search.trim()
		? [{ label: "Search results", tools: filteredTools }]
		: showAll
			? WORKSPACE_GROUPS
			: WORKSPACE_GROUPS.filter((g) =>
					g.tools.some((t) => TOP_TOOL_IDS.includes(t.id)),
				);

	return (
		<div className="flex h-full flex-col gap-6 overflow-y-auto">
			<ScreenHeader title="Workspace" helpPath="/workspace" />

			{/* Search */}
			<div className="relative max-w-sm">
				<MagnifyingGlassIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				<input
					type="text"
					placeholder="Search tools..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="w-full rounded-md border border-border bg-card py-1.5 pl-9 pr-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
				/>
			</div>

			{/* Top tools — large cards (hidden when searching) */}
			{!search.trim() && (
				<section aria-label="Quick access">
					<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
						{topTools.map((tool) => (
							<li key={tool.id}>
								<Link
									to={tool.path}
									className="group flex h-full flex-col items-center gap-2.5 rounded-lg border border-border bg-card p-4 text-center transition-colors hover:border-strong"
								>
									<span
										aria-hidden="true"
										className="grid size-10 place-items-center rounded-lg bg-secondary text-muted-foreground transition-colors group-hover:bg-accent-muted group-hover:text-accent"
									>
										<tool.icon className="size-5" />
									</span>
									<span className="text-sm font-medium text-foreground">
										{tool.label}
									</span>
									<span className="text-[11px] leading-snug text-muted-foreground">
										{tool.description}
									</span>
								</Link>
							</li>
						))}
					</ul>
				</section>
			)}

			{/* Show all / Show less toggle (hidden when searching) */}
			{!search.trim() && ALL_TOOLS.length > topTools.length && (
				<button
					type="button"
					onClick={() => setShowAll((v) => !v)}
					className="flex items-center gap-2 self-center text-sm text-muted-foreground transition-colors hover:text-foreground"
				>
					{showAll ? (
						<>
							<ChevronUpIcon className="size-4" />
							Show fewer tools
						</>
					) : (
						<>
							<ChevronDownIcon className="size-4" />
							Show all {ALL_TOOLS.length} tools
						</>
					)}
				</button>
			)}

			{/* All tools — grouped grid (or search results) */}
			<div className="space-y-6">
				{visibleGroups.map((group) => {
					const tools = group.tools;
					if (tools.length === 0) {
						return null;
					}
					return (
						<section key={group.label} aria-label={group.label}>
							<h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
								{group.label}
							</h2>
							<ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
								{tools.map((tool) => (
									<li key={tool.id}>
										<Link
											to={tool.path}
											className="group flex h-full flex-col gap-2 rounded-md border border-border bg-card p-3 transition-colors hover:border-strong"
										>
											<span className="flex items-center gap-3">
												<span
													aria-hidden="true"
													className="grid size-8 shrink-0 place-items-center rounded-md bg-secondary text-muted-foreground transition-colors group-hover:bg-accent-muted group-hover:text-accent"
												>
													<tool.icon className="size-4" />
												</span>
												<span className="text-sm font-medium text-foreground">
													{tool.label}
												</span>
											</span>
											<span className="pl-[44px] text-xs leading-relaxed text-muted-foreground">
												{tool.description}
											</span>
										</Link>
									</li>
								))}
							</ul>
						</section>
					);
				})}
				{search.trim() && filteredTools.length === 0 && (
					<p className="py-8 text-center text-sm text-muted-foreground">
						No tools match "{search}"
					</p>
				)}
			</div>
		</div>
	);
}
