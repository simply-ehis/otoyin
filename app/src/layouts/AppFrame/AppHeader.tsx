import {
	ChatBubbleLeftRightIcon as AiIcon,
	MagnifyingGlassIcon,
	QuestionMarkCircleIcon,
	SparklesIcon,
} from "@heroicons/react/24/outline";
import { Link } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { useIsMacOS } from "@/lib/hooks/useIsMacOS";
import { cn } from "@/lib/utils/cn";

const NotificationBell = lazy(() =>
	import("@/layouts/Notifications/NotificationBell").then((m) => ({
		default: m.NotificationBell,
	})),
);

interface AppHeaderProps {
	assistantOpen: boolean;
	onToggleAssistant: () => void;
	onOpenHelp: () => void;
	onOpenSearch: () => void;
}

/**
 * Unified top header: brand mark (→ Home) on the left, app-level utility
 * actions on the right. The sidebar sits flush beneath it (no brand row,
 * no top gap) so header + sidebar read as one continuous frame.
 */
export function AppHeader({
	assistantOpen,
	onToggleAssistant,
	onOpenHelp,
	onOpenSearch,
}: AppHeaderProps) {
	const isMacOS = useIsMacOS();
	const [logoOk, setLogoOk] = useState(true);
	return (
		<header
			className={cn(
				"relative z-30 flex h-11 shrink-0 items-center gap-2 border-b border-border bg-background px-3",
				// macOS traffic lights overlay the top-left — keep the brand clear.
				isMacOS && "pl-20",
			)}
		>
			<Link
				to="/"
				className="flex items-center gap-2 text-foreground transition-opacity hover:opacity-80"
				aria-label="Otoyin home"
				data-tour="home"
				title="Otoyin home"
			>
				{logoOk ? (
					<img
						src="/otoyin-logo.svg"
						alt=""
						aria-hidden="true"
						className="size-6 shrink-0"
						onError={() => setLogoOk(false)}
					/>
				) : (
					<span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent-muted">
						<SparklesIcon className="size-3.5 text-accent" aria-hidden="true" />
					</span>
				)}
				<span className="whitespace-nowrap text-sm font-medium tracking-tight text-muted-foreground">
					Otoyin
				</span>
			</Link>
			{/* Centred Ctrl+K search box (design doc §7: one bar, logo · search · bell/help/window icons) */}
			<div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
				<button
					type="button"
					onClick={onOpenSearch}
					data-tour="search"
					className="pointer-events-auto flex h-7 w-56 items-center gap-2 rounded-lg border border-border bg-secondary px-2.5 text-xs text-muted-foreground transition-colors hover:border-border-hover hover:text-foreground md:w-72 lg:w-80"
					aria-label="Search tabs, settings and actions (Ctrl+K)"
					title="Search tabs, settings and actions (Ctrl+K)"
				>
					<MagnifyingGlassIcon
						className="size-3.5 shrink-0"
						aria-hidden="true"
					/>
					<span className="truncate">Search everything…</span>
					<kbd className="ml-auto shrink-0 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
						Ctrl K
					</kbd>
				</button>
			</div>
			<div className="ml-auto flex items-center gap-1">
				<Suspense fallback={null}>
					<NotificationBell />
				</Suspense>
				<button
					type="button"
					onClick={onOpenHelp}
					data-tour="help"
					className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors duration-150 hover:bg-muted/80 hover:text-foreground"
					title="Help (F1)"
					aria-label="Open Help Center"
				>
					<QuestionMarkCircleIcon className="size-4" aria-hidden="true" />
				</button>
				<button
					type="button"
					onClick={onToggleAssistant}
					data-tour="assistant"
					className={cn(
						"flex size-8 items-center justify-center rounded-lg transition-colors duration-150",
						assistantOpen
							? "bg-accent text-accent-foreground shadow-sm"
							: "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
					)}
					title="AI Assistant (Ctrl+K for commands)"
					aria-label="Toggle AI Assistant"
					aria-pressed={assistantOpen}
				>
					<AiIcon className="size-4" aria-hidden="true" />
				</button>
			</div>
		</header>
	);
}
