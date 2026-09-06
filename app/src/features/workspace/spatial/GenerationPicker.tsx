import { useState } from "react";
import type { HistoryResponse } from "@/lib/api/types";
import { useHistory } from "@/lib/hooks/useHistory";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { SearchInput } from "@/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";

/** Completed-generation picker (searchable popover) for render sources. */
export function GenerationPicker({
	selectedId,
	onSelect,
	className,
}: {
	selectedId: string | null;
	onSelect: (gen: HistoryResponse) => void;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const { data } = useHistory({ limit: 50 });
	const completed = (data?.items ?? []).filter((g) => g.status === "completed");
	const q = query.trim().toLowerCase();
	const filtered = completed.filter(
		(g) =>
			!q ||
			g.text.toLowerCase().includes(q) ||
			g.profile_name.toLowerCase().includes(q),
	);
	const selected = completed.find((g) => g.id === selectedId);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className={cn("h-8 justify-start text-xs", className)}
					aria-label="Select source generation"
				>
					<span className="min-w-0 flex-1 truncate text-left">
						{selected ? (
							<>
								<span className="font-medium">{selected.profile_name}</span>
								<span className="ml-1.5 text-muted-foreground">
									{selected.text.length > 30
										? `${selected.text.slice(0, 30)}…`
										: selected.text}
								</span>
							</>
						) : (
							<span className="text-muted-foreground">
								Select a generation…
							</span>
						)}
					</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-80 p-2" align="start">
				<SearchInput
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search generations"
					aria-label="Search generations"
					className="mb-2 h-8 text-xs"
				/>
				<div className="max-h-64 space-y-1 overflow-y-auto">
					{filtered.length === 0 ? (
						<p className="px-2 py-4 text-center text-xs text-muted-foreground">
							{completed.length === 0
								? "No completed generations yet."
								: "Nothing matches."}
						</p>
					) : null}
					{filtered.map((g) => (
						<button
							key={g.id}
							type="button"
							aria-current={g.id === selectedId ? "true" : undefined}
							className={cn(
								"w-full rounded-sm px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								g.id === selectedId
									? "bg-accent-muted text-foreground"
									: "hover:bg-secondary",
							)}
							onClick={() => {
								onSelect(g);
								setOpen(false);
							}}
						>
							<span className="block truncate font-medium">
								{g.profile_name}
							</span>
							<span className="block truncate text-muted-foreground">
								{g.text}
							</span>
						</button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}
