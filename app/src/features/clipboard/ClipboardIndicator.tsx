import { ClipboardDocumentIcon as ClipboardIcon } from "@heroicons/react/24/outline";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ClipboardPanel } from "@/features/clipboard/ClipboardPanel";
import { getClip } from "@/lib/clip";
import { cn } from "@/lib/utils/cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/ui/popover";
import { Spinner } from "@/ui/primitives";

/**
 * Sidebar clipboard indicator: shows a badge when the server clipboard
 * holds a clip, and opens the full ClipboardPanel in a popover on click.
 * Mounted between the nav and the collapse toggle.
 *
 * `compact` renders an icon-only button (for the single-row sidebar
 * footer); the popover still opens the full panel.
 */
export function ClipboardIndicator({ compact = false }: { compact?: boolean }) {
	const { t } = useTranslation();

	const live = useQuery({
		queryKey: ["clipboard-live"],
		queryFn: getClip,
		staleTime: 10_000,
		refetchInterval: 15_000,
	});

	const hasClip = live.data !== null && live.data !== undefined;
	const clipName = live.data?.name ?? live.data?.id ?? "";

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"relative flex items-center rounded-md border transition-colors",
						"border-dashed border-border bg-secondary hover:bg-secondary-hover",
						compact ? "size-7 justify-center" : "mx-2 mb-1 px-3 py-2",
					)}
					title={
						hasClip
							? `${t("clipboard.liveSlot", { defaultValue: "On clipboard" })}: ${clipName}`
							: t("clipboard.emptyTitle", { defaultValue: "Clipboard empty" })
					}
					aria-label={t("sidebar.clipboard", { defaultValue: "Clipboard" })}
				>
					<ClipboardIcon
						className="size-3.5 shrink-0 text-muted-foreground"
						aria-hidden="true"
					/>
					{compact ? null : (
						live.isLoading ? (
								<Spinner size="sm" className="ml-2" />
							) : hasClip ? (
								<span className="ml-2 truncate text-xs font-medium text-foreground">
									{clipName}
								</span>
							) : (
								<span className="ml-2 text-xs text-muted-foreground">
									{t("clipboard.emptyTitle", { defaultValue: "No clips yet" })}
								</span>
							)
					)}
					{hasClip && (
						<span
							className="absolute -right-1 -top-1 size-2 rounded-full bg-accent"
							aria-hidden="true"
						/>
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				side="right"
				sideOffset={8}
				className="w-80 max-h-[60vh] overflow-y-auto scrollbar-thin"
			>
				<ClipboardPanel />
			</PopoverContent>
		</Popover>
	);
}
