import { CheckIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

/**
 * Canonical multi-select: checkbox dropdown with count summary.
 * Full keyboard model via popover focus + native checkboxes.
 */
export function MultiSelect({
	options,
	value,
	onChange,
	placeholder = "Select…",
	className,
}: {
	options: { value: string; label: string }[];
	value: string[];
	onChange: (value: string[]) => void;
	placeholder?: string;
	className?: string;
}) {
	const [open, setOpen] = useState(false);
	const toggle = (v: string) => {
		onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
	};
	const summary =
		value.length === 0
			? placeholder
			: value.length <= 2
				? options
						.filter((o) => value.includes(o.value))
						.map((o) => o.label)
						.join(", ")
				: `${value.length} selected`;
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className={cn("min-w-0 justify-between gap-2", className)}
					aria-label={placeholder}
				>
					<span className="truncate">{summary}</span>
					<ChevronDownIcon className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="max-h-64 overflow-y-auto" align="start">
				{options.length === 0 ? (
					<p className="px-2 py-1.5 text-xs text-muted-foreground">No options</p>
				) : (
					options.map((o) => (
						<label
							key={o.value}
							className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-secondary"
						>
							<input
								type="checkbox"
								checked={value.includes(o.value)}
								onChange={() => toggle(o.value)}
								className="size-4 shrink-0 cursor-pointer accent-primary"
							/>
							<span className="flex min-w-0 flex-1 items-center gap-2">
								<span className="truncate">{o.label}</span>
								{value.includes(o.value) ? (
									<CheckIcon className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
								) : null}
							</span>
						</label>
					))
				)}
				{value.length > 0 ? (
					<Button
						variant="ghost"
						size="sm"
						className="mt-1 w-full"
						onClick={() => onChange([])}
					>
						Clear all
					</Button>
				) : null}
			</PopoverContent>
		</Popover>
	);
}
