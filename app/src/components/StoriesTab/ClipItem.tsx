import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { StoryItemDetail } from "@/lib/api/types";
import { cn } from "@/lib/utils/cn";
import { ClipWaveform } from "./ClipWaveform";
import { getClipStyle } from "./clipStyle";

interface ClipItemProps {
	item: StoryItemDetail;
	draggingItem: string | null;
	selectedClipId: string | null;
	trimmingItem: string | null;
	tempTrimValues: { trim_start_ms: number; trim_end_ms: number } | null;
	tracks: number[];
	dragPosition: { x: number; y: number };
	msToPixels: (ms: number) => number;
	onClipClick: (e: React.MouseEvent, item: StoryItemDetail) => void;
	onDragStart: (e: React.MouseEvent, item: StoryItemDetail) => void;
	onTrimStart: (
		e: React.MouseEvent,
		item: StoryItemDetail,
		side: "start" | "end",
	) => void;
}

export function ClipItem({
	item,
	draggingItem,
	selectedClipId,
	trimmingItem,
	tempTrimValues,
	tracks,
	dragPosition,
	msToPixels,
	onClipClick,
	onDragStart,
	onTrimStart,
}: ClipItemProps) {
	const isDragging = draggingItem === item.id;
	const isSelected = selectedClipId === item.id;
	const isTrimming = trimmingItem === item.id;
	const [sourceUnavailable, setSourceUnavailable] = useState(false);
	const { t } = useTranslation();

	const displayTrimStart =
		isTrimming && tempTrimValues
			? tempTrimValues.trim_start_ms
			: item.trim_start_ms || 0;
	const displayTrimEnd =
		isTrimming && tempTrimValues
			? tempTrimValues.trim_end_ms
			: item.trim_end_ms || 0;
	const effectiveDuration =
		item.duration * 1000 - displayTrimStart - displayTrimEnd;

	const style = getClipStyle(
		item,
		draggingItem,
		dragPosition,
		msToPixels,
		tracks,
	);
	const clipWidth = msToPixels(effectiveDuration);

	return (
		<div
			className={cn(
				"absolute rounded select-none overflow-visible z-10",
				isSelected && "ring-2 ring-primary ring-offset-1",
				isTrimming && "ring-2 ring-accent",
			)}
			style={style}
		>
			<button
				type="button"
				className={cn(
					"w-full h-full rounded cursor-move overflow-hidden",
					"bg-accent/80 hover:bg-accent border border-accent-foreground/20",
					"flex flex-col justify-center",
					isDragging && "opacity-80 shadow-lg z-20",
					!isDragging &&
						"transition-[opacity,box-shadow,transform] duration-100",
				)}
				onClick={(e) => onClipClick(e, item)}
				onMouseDown={(e) => {
					if (!(e.target as HTMLElement).closest(".trim-handle")) {
						onDragStart(e, item);
					}
				}}
			>
				<div className="absolute top-0 left-1 right-1 z-10">
					<p className="text-xs font-medium text-accent-foreground truncate">
						{item.engine === "import" ? item.text : item.profile_name}
					</p>
				</div>
				<div className="absolute inset-0 top-3">
					<ClipWaveform
						generationId={item.generation_id}
						versionId={item.version_id}
						width={clipWidth}
						trimStartMs={displayTrimStart}
						trimEndMs={displayTrimEnd}
						duration={item.duration}
						onUnavailable={() => setSourceUnavailable(true)}
					/>
					{sourceUnavailable && (
						<div
							className="absolute inset-0 z-20 flex items-center justify-center bg-destructive/20 rounded"
							title={t("storyContent.sourceUnavailable")}
						>
							<span className="text-[8px] font-bold text-destructive-foreground bg-destructive px-1 py-0.5 rounded">
								{t("storyContent.sourceUnavailable")}
							</span>
						</div>
					)}
				</div>
			</button>

			{isSelected && (
				<>
					<button
						type="button"
						className="trim-handle absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-primary/30 bg-primary/20 z-30 rounded-l"
						onMouseDown={(e) => onTrimStart(e, item, "start")}
						aria-label="Trim start"
					/>
					<button
						type="button"
						className="trim-handle absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-primary/30 bg-primary/20 z-30 rounded-r"
						onMouseDown={(e) => onTrimStart(e, item, "end")}
						aria-label="Trim end"
					/>
				</>
			)}
		</div>
	);
}
