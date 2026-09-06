import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Custom title-bar strip for the Tauri overlay titlebar.
 * Full-width drag region; interactive children opt out via
 * `data-tauri-drag-region="false"`. macOS traffic lights need 28px,
 * Windows caption buttons 32px (matches TOP_SAFE_AREA_PADDING).
 */
export function TitleBar({
	title,
	actions,
	className,
}: {
	title?: string;
	actions?: React.ReactNode;
	className?: string;
}) {
	const [isMacOS, setIsMacOS] = useState(false);
	useEffect(() => {
		setIsMacOS(navigator.userAgent.includes("Mac"));
	}, []);
	return (
		<header
			data-tauri-drag-region
			className={cn(
				"flex shrink-0 select-none items-center gap-2 border-b border-border bg-sidebar pl-3 pr-2",
				className,
			)}
			style={{ height: isMacOS ? 40 : 44 }}
		>
			{title ? (
				<span className="pointer-events-none text-[13px] font-medium tracking-tight text-muted-foreground">
					{title}
				</span>
			) : null}
			<div
				className="min-w-0 flex-1"
				data-tauri-drag-region
				aria-hidden="true"
			/>
			{actions ? (
				<div
					className="flex shrink-0 items-center gap-1"
					data-tauri-drag-region="false"
				>
					{actions}
				</div>
			) : null}
		</header>
	);
}
