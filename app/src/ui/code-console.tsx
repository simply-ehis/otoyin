import { CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Canonical code console: mono block with copy button. Copy is a
 * progressive enhancement — text always selectable.
 */
export function CodeConsole({
	children,
	className,
	language,
	maxHeight,
}: {
	children: string;
	className?: string;
	language?: string;
	maxHeight?: string;
}) {
	const [copied, setCopied] = useState(false);
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(children);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1500);
		} catch {
			// Select-and-copy fallback: leave the text selectable.
		}
	};
	return (
		<div
			className={cn(
				"group relative overflow-hidden rounded-sm border border-border bg-sunken",
				className,
			)}
		>
			<section
				aria-label={language ? `${language} snippet` : "Code snippet"}
				className="overflow-x-auto whitespace-pre p-3 font-mono text-xs leading-relaxed text-foreground"
				style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
			>
				{children}
			</section>
			<button
				type="button"
				onClick={copy}
				title={copied ? "Copied" : "Copy"}
				aria-label={copied ? "Copied" : "Copy snippet"}
				className="absolute right-2 top-2 grid size-7 place-items-center rounded-sm border border-border bg-card text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
			>
				{copied ? (
					<CheckIcon className="size-3.5 text-success" aria-hidden="true" />
				) : (
					<ClipboardDocumentIcon className="size-3.5" aria-hidden="true" />
				)}
			</button>
		</div>
	);
}
