import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import type { CategoryId, SortMode, UseCaseId } from "./storeUtils";
import { CATEGORIES, USE_CASES } from "./storeUtils";

type ShowFilter = "all" | "installed" | "available" | "paid" | "free";

interface Props {
	search: string;
	onSearch: (v: string) => void;
	showFilter: ShowFilter;
	onShowFilter: (v: ShowFilter) => void;
	sortMode: SortMode;
	onSortMode: (v: SortMode) => void;
	activeCategory: CategoryId;
	onCategory: (v: CategoryId) => void;
	activeUseCase: UseCaseId;
	onUseCase: (v: UseCaseId) => void;
	categoryCounts: Record<string, number>;
	totalCount: number;
}

/** Browse-view filter chrome: search, free/paid, sort, category + use-case chips. */
export function StoreFilters({
	search,
	onSearch,
	showFilter,
	onShowFilter,
	sortMode,
	onSortMode,
	activeCategory,
	onCategory,
	activeUseCase,
	onUseCase,
	categoryCounts,
	totalCount,
}: Props) {
	return (
		<div className="space-y-3">
			<div className="flex gap-2">
				<div className="relative flex-1">
					<MagnifyingGlassIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={search}
						onChange={(e) => onSearch(e.target.value)}
						placeholder="Search voices, languages, quality, use-cases…"
						className="h-9 pl-9 text-sm"
						aria-label="Search models"
					/>
					{search && (
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							onClick={() => onSearch("")}
							className="absolute right-2 top-1/2 -translate-y-1/2"
							title="Clear search"
							aria-label="Clear search"
						>
							<XMarkIcon className="size-3.5" />
						</Button>
					)}
				</div>
				<div className="hidden gap-2 sm:flex">
					{(["all", "free", "paid"] as const).map((f) => (
						<Button
							key={f}
							variant="ghost"
							size="sm"
							onClick={() => onShowFilter(f)}
							className={cn(
								"rounded-md",
								showFilter === f &&
									"bg-secondary text-foreground hover:bg-secondary",
							)}
						>
							{f === "all" ? "All" : f === "free" ? "Free" : "Paid"}
						</Button>
					))}
				</div>
			</div>
			<div className="flex items-center gap-2">
				<select
					value={sortMode}
					onChange={(e) => onSortMode(e.target.value as SortMode)}
					className="cursor-pointer rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/50"
					aria-label="Sort models"
				>
					<option value="default">Default</option>
					<option value="quality">Best Quality</option>
					<option value="price-asc">Price: Low to High</option>
					<option value="price-desc">Price: High to Low</option>
					<option value="name">Name A-Z</option>
				</select>
			</div>
			<div className="flex gap-2 overflow-x-auto pb-1">
				{CATEGORIES.map((cat) => {
					const Icon = cat.icon;
					const count =
						cat.id === "all" ? totalCount : (categoryCounts[cat.id] ?? 0);
					return (
						<Button
							key={cat.id}
							variant="ghost"
							size="sm"
							onClick={() => onCategory(cat.id)}
							className={cn(
								"whitespace-nowrap rounded-full",
								activeCategory === cat.id &&
									"bg-foreground text-background hover:bg-foreground",
							)}
						>
							<Icon className="size-3.5" />
							{cat.label}
							{count > 0 && (
								<span className="text-xs opacity-60"> · {count}</span>
							)}
						</Button>
					);
				})}
			</div>
			<div className="flex gap-2 overflow-x-auto pb-1">
				{USE_CASES.map((uc) => (
					<Button
						key={uc.id}
						variant="ghost"
						size="sm"
						onClick={() => onUseCase(uc.id)}
						className={cn(
							"whitespace-nowrap rounded-full",
							activeUseCase === uc.id &&
								"bg-secondary text-foreground hover:bg-secondary",
						)}
					>
						{uc.label}
					</Button>
				))}
			</div>
		</div>
	);
}
