import { cn } from "@/lib/utils/cn";
import { SCRUB_BAR_HEIGHT } from "./timeline";

interface EditorScrollbarProps {
	scrollbarTrackRef: React.Ref<HTMLDivElement>;
	thumbWidth: number;
	thumbLeft: number;
	canScrollHorizontally: boolean;
	pixelsPerSecond: number;
	minPps: number;
	maxPps: number;
	onScrollbarMouseDown: (
		mode: "pan" | "left" | "right",
	) => (e: React.MouseEvent<HTMLElement>) => void;
}

export function EditorScrollbar({
	scrollbarTrackRef,
	thumbWidth,
	thumbLeft,
	canScrollHorizontally,
	pixelsPerSecond,
	minPps,
	maxPps,
	onScrollbarMouseDown,
}: EditorScrollbarProps) {
	return (
		<div
			className="flex border-t bg-background"
			style={{ height: `${SCRUB_BAR_HEIGHT}px` }}
		>
			<div className="w-16 shrink-0 border-r" />
			<div
				ref={scrollbarTrackRef}
				className="relative flex-1 overflow-hidden select-none px-1"
			>
				<div
					className="absolute top-1 bottom-1 bg-secondary hover:bg-secondary-hover transition-colors group rounded-full"
					style={{ width: `${thumbWidth}px`, left: `${thumbLeft}px` }}
				>
					<div
						role="slider"
						tabIndex={0}
						aria-label="Zoom from left edge"
						aria-valuenow={Math.round(pixelsPerSecond)}
						aria-valuemin={Math.round(minPps)}
						aria-valuemax={Math.round(maxPps)}
						className="absolute top-0 bottom-0 left-0 w-1.5 cursor-ew-resize bg-strong hover:brightness-110 transition-[filter] rounded-l-full"
						onMouseDown={onScrollbarMouseDown("left")}
					/>
					{/* biome-ignore lint/a11y/noStaticElementInteractions: mouse-driven drag area */}
					<div
						className={cn(
							"absolute top-0 bottom-0 left-1.5 right-1.5",
							canScrollHorizontally
								? "cursor-grab active:cursor-grabbing"
								: "cursor-default",
						)}
						onMouseDown={
							canScrollHorizontally ? onScrollbarMouseDown("pan") : undefined
						}
					/>
					<div
						role="slider"
						tabIndex={0}
						aria-label="Zoom from right edge"
						aria-valuenow={Math.round(pixelsPerSecond)}
						aria-valuemin={Math.round(minPps)}
						aria-valuemax={Math.round(maxPps)}
						className="absolute top-0 bottom-0 right-0 w-1.5 cursor-ew-resize bg-strong hover:brightness-110 transition-[filter] rounded-r-full"
						onMouseDown={onScrollbarMouseDown("right")}
					/>
				</div>
			</div>
		</div>
	);
}
