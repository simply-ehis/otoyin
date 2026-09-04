import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	ClipboardIcon as Copy,
	Bars3Icon as GripVertical,
	MicrophoneIcon as Mic,
	EllipsisHorizontalIcon as MoreHorizontal,
	MusicalNoteIcon as Music,
	PlayIcon as Play,
	ArrowUturnLeftIcon as RotateCcw,
	TrashIcon as Trash2,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api/client";
import type { StoryItemDetail } from "@/lib/api/types";
import { copyClip } from "@/lib/clip";
import { cn } from "@/lib/utils/cn";
import { useServerStore } from "@/stores/serverStore";
import { useStoryStore } from "@/stores/storyStore";
import { formatTime } from "./timeline";

interface StoryChatItemProps {
	item: StoryItemDetail;
	storyId: string;
	index: number;
	onRemove: () => void;
	onRegenerate?: () => void;
	currentTimeMs: number;
	isPlaying: boolean;
	dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
	isDragging?: boolean;
}

export function StoryChatItem({
	item,
	onRemove,
	onRegenerate,
	currentTimeMs,
	isPlaying,
	dragHandleProps,
	isDragging,
}: StoryChatItemProps) {
	const { t } = useTranslation();
	const { toast } = useToast();
	const seek = useStoryStore((state) => state.seek);
	const trackConfigs = useStoryStore((s) => s.trackConfigs);
	const serverUrl = useServerStore((state) => state.serverUrl);
	const [avatarError, setAvatarError] = useState(false);

	const handleCopyClip = async () => {
		try {
			await copyClip({
				kind: "story_item",
				id: item.generation_id,
				audioUrl: apiClient.getAudioUrl(item.generation_id),
				name:
					item.engine === "import" ? item.text.slice(0, 40) : item.profile_name,
				durationMs: Math.round((item.duration ?? 0) * 1000),
			});
			toast({ title: t("history.actions.copyClipDone") });
		} catch {
			toast({
				title: t("history.actions.copyClipFailed"),
				variant: "destructive",
			});
		}
	};

	const avatarUrl = `${serverUrl}/profiles/${item.profile_id}/avatar`;

	// Check if this item is currently playing based on timecode
	const itemStartMs = item.start_time_ms;
	const effectiveDurationMs =
		item.duration * 1000 - (item.trim_start_ms || 0) - (item.trim_end_ms || 0);
	const itemEndMs = item.start_time_ms + effectiveDurationMs;

	// Check mute/solo for this item's track
	const hasSolo = Object.values(trackConfigs).some((c) => c.solo);
	const trackConfig = trackConfigs[item.track];
	const isTrackMuted = trackConfig?.muted ?? false;
	const isTrackSolo = trackConfig?.solo ?? false;
	const isTrackSilenced = hasSolo ? !isTrackSolo : isTrackMuted;

	const isCurrentlyPlaying =
		isPlaying &&
		!isTrackSilenced &&
		currentTimeMs >= itemStartMs &&
		currentTimeMs < itemEndMs;

	const handlePlay = () => {
		// Seek to the start of this item
		seek(itemStartMs);
	};

	return (
		<div
			className={cn(
				"flex items-start gap-3 p-4 rounded-lg border transition-colors",
				isCurrentlyPlaying && "bg-muted/70 border-primary",
				!isCurrentlyPlaying && "hover:bg-muted/50",
				isDragging && "opacity-50 shadow-lg",
			)}
		>
			{/* Drag Handle */}
			{dragHandleProps && (
				<button
					type="button"
					aria-label="Drag to reorder"
					title="Drag to reorder"
					className="shrink-0 cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground transition-colors"
					{...dragHandleProps}
				>
					<GripVertical className="size-5" />
				</button>
			)}

			{/* Voice Avatar */}
			<div className="shrink-0">
				<div className="size-10 rounded-full bg-muted flex items-center justify-center overflow-hidden">
					{item.engine === "import" ? (
						<Music className="size-5 text-muted-foreground" />
					) : !avatarError ? (
						<img
							src={avatarUrl}
							alt={`${item.profile_name} avatar`}
							className={cn(
								"h-full w-full object-cover transition-[filter] duration-200",
								!isCurrentlyPlaying && "grayscale",
							)}
							onError={() => setAvatarError(true)}
						/>
					) : (
						<Mic className="size-5 text-muted-foreground" />
					)}
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2 mb-2">
					<span className="font-medium text-sm truncate">
						{item.engine === "import" ? item.text : item.profile_name}
					</span>
					{item.engine !== "import" && (
						<span className="text-xs text-muted-foreground">
							{item.language}
						</span>
					)}
					<span className="text-xs text-muted-foreground tabular-nums ml-auto">
						{formatTime(itemStartMs)}
					</span>
				</div>
				{item.engine === "import" ? null : (
					<Textarea
						value={item.text}
						className="flex-1 resize-none text-sm text-muted-foreground select-text bg-card cursor-text"
						readOnly
						onDoubleClick={handlePlay}
					/>
				)}
			</div>

			{/* Actions */}
			<div className="shrink-0">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-8"
							aria-label={t("history.actions.menu")}
						>
							<MoreHorizontal className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={handlePlay}>
							<Play className="mr-2 size-4" />
							{t("storyContent.itemActions.playFromHere")}
						</DropdownMenuItem>
						{onRegenerate && (
							<DropdownMenuItem onClick={onRegenerate}>
								<RotateCcw className="mr-2 size-4" />
								{t("storyContent.itemActions.regenerate")}
							</DropdownMenuItem>
						)}
						<DropdownMenuItem onClick={handleCopyClip}>
							<Copy className="mr-2 size-4" />
							{t("history.actions.copyClip")}
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={onRemove}
							className="text-destructive focus:text-destructive"
						>
							<Trash2 className="mr-2 size-4" />
							{t("storyContent.itemActions.removeFromStory")}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}

// Sortable wrapper component
export function SortableStoryChatItem(
	props: Omit<StoryChatItemProps, "dragHandleProps" | "isDragging">,
) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: props.item.generation_id,
	});

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<div ref={setNodeRef} style={style} {...attributes}>
			<StoryChatItem
				{...props}
				dragHandleProps={listeners}
				isDragging={isDragging}
			/>
		</div>
	);
}
