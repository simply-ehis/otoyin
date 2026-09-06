import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	ArrowUturnLeftIcon,
	Bars3Icon,
	ClipboardDocumentIcon,
	EllipsisHorizontalIcon,
	MicrophoneIcon,
	MusicalNoteIcon,
	PlayIcon,
	TrashIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/lib/api/client";
import type { StoryItemDetail } from "@/lib/api/types";
import { copyClip } from "@/lib/clip";
import { cn } from "@/lib/utils/cn";
import { useServerStore } from "@/stores/serverStore";
import { useStoryStore } from "@/stores/storyStore";
import { Button } from "@/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/ui/dropdown-menu";
import { Textarea } from "@/ui/input";
import { useToast } from "@/ui/use-toast";
import { formatTime } from "./timeline";

/**
 * One story item: avatar, text, timecode, play-from-here, regenerate,
 * clip copy, remove. Highlighted while the transport plays through it
 * (mute/solo aware). Draggable via the grip handle.
 */
export function StoryChatItem({
	item,
	onRemove,
	onRegenerate,
	currentTimeMs,
	isPlaying,
	dragHandleProps,
	isDragging,
}: {
	item: StoryItemDetail;
	storyId: string;
	index: number;
	onRemove: () => void;
	onRegenerate?: () => void;
	currentTimeMs: number;
	isPlaying: boolean;
	dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
	isDragging?: boolean;
}) {
	const { t } = useTranslation();
	const { toast } = useToast();
	const seek = useStoryStore((s) => s.seek);
	const trackConfigs = useStoryStore((s) => s.trackConfigs);
	const serverUrl = useServerStore((s) => s.serverUrl);
	const [avatarError, setAvatarError] = useState(false);

	const startMs = item.start_time_ms;
	const endMs =
		item.start_time_ms +
		item.duration * 1000 -
		(item.trim_start_ms || 0) -
		(item.trim_end_ms || 0);
	const hasSolo = Object.values(trackConfigs).some((c) => c.solo);
	const config = trackConfigs[item.track];
	const silenced = hasSolo ? !config?.solo : (config?.muted ?? false);
	const active =
		isPlaying && !silenced && currentTimeMs >= startMs && currentTimeMs < endMs;
	const avatarUrl = `${serverUrl}/profiles/${item.profile_id}/avatar`;

	return (
		<div
			className={cn(
				"flex items-start gap-3 rounded-md border p-4 transition-colors",
				active ? "border-accent bg-secondary" : "border-border bg-card",
				isDragging && "opacity-60 shadow-lg",
			)}
		>
			{dragHandleProps ? (
				<button
					type="button"
					aria-label="Drag to reorder"
					title="Drag to reorder"
					className="shrink-0 cursor-grab touch-none rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing"
					{...dragHandleProps}
				>
					<Bars3Icon className="size-5" aria-hidden="true" />
				</button>
			) : null}
			<span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary">
				{item.engine === "import" ? (
					<MusicalNoteIcon
						className="size-5 text-muted-foreground"
						aria-hidden="true"
					/>
				) : !avatarError ? (
					<img
						src={avatarUrl}
						alt={`${item.profile_name} avatar`}
						className={cn(
							"h-full w-full object-cover transition-[filter] duration-200",
							!active && "grayscale",
						)}
						onError={() => setAvatarError(true)}
					/>
				) : (
					<MicrophoneIcon
						className="size-5 text-muted-foreground"
						aria-hidden="true"
					/>
				)}
			</span>
			<div className="min-w-0 flex-1">
				<p className="mb-2 flex items-center gap-2">
					<span className="truncate text-sm font-medium text-foreground">
						{item.engine === "import" ? item.text : item.profile_name}
					</span>
					{item.engine !== "import" ? (
						<span className="text-xs text-muted-foreground">
							{item.language}
						</span>
					) : null}
					<span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
						{formatTime(startMs)}
					</span>
				</p>
				{item.engine === "import" ? null : (
					<Textarea
						value={item.text}
						readOnly
						rows={2}
						aria-label={`Line by ${item.profile_name}`}
						onDoubleClick={() => seek(startMs)}
						className="resize-none text-sm"
					/>
				)}
			</div>
			<Button
				variant="ghost"
				size="icon"
				className="size-8 shrink-0"
				title={t("history.actions.copyClip")}
				aria-label={`${t("history.actions.copyClip")}: ${item.text.slice(0, 40)}`}
				onClick={() => {
					copyClip({
						kind: "story_item",
						id: item.generation_id,
						audioUrl: apiClient.getAudioUrl(item.generation_id),
						name:
							item.engine === "import"
								? item.text.slice(0, 40)
								: item.profile_name,
						durationMs: Math.round((item.duration ?? 0) * 1000),
					}).then(
						() => toast({ title: t("history.actions.copyClipDone") }),
						() =>
							toast({
								title: t("history.actions.copyClipFailed"),
								variant: "destructive",
							}),
					);
				}}
			>
				<ClipboardDocumentIcon className="size-4" aria-hidden="true" />
			</Button>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="size-8 shrink-0"
						aria-label={t("history.actions.menu")}
					>
						<EllipsisHorizontalIcon className="size-4" aria-hidden="true" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem onClick={() => seek(startMs)}>
						<PlayIcon className="mr-2 size-4" aria-hidden="true" />
						{t("storyContent.itemActions.playFromHere")}
					</DropdownMenuItem>
					{onRegenerate ? (
						<DropdownMenuItem onClick={onRegenerate}>
							<ArrowUturnLeftIcon className="mr-2 size-4" aria-hidden="true" />
							{t("storyContent.itemActions.regenerate")}
						</DropdownMenuItem>
					) : null}
					<DropdownMenuItem
						onClick={() => {
							copyClip({
								kind: "story_item",
								id: item.generation_id,
								audioUrl: apiClient.getAudioUrl(item.generation_id),
								name:
									item.engine === "import"
										? item.text.slice(0, 40)
										: item.profile_name,
								durationMs: Math.round((item.duration ?? 0) * 1000),
							}).then(
								() => toast({ title: t("history.actions.copyClipDone") }),
								() =>
									toast({
										title: t("history.actions.copyClipFailed"),
										variant: "destructive",
									}),
							);
						}}
					>
						<ClipboardDocumentIcon className="mr-2 size-4" aria-hidden="true" />
						{t("history.actions.copyClip")}
					</DropdownMenuItem>
					<DropdownMenuItem onClick={onRemove} className="text-destructive">
						<TrashIcon className="mr-2 size-4" aria-hidden="true" />
						{t("storyContent.itemActions.removeFromStory")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

/** Sortable wrapper (dnd-kit; keyboard reorder via arrow keys on grip). */
export function SortableStoryChatItem(
	props: Omit<
		Parameters<typeof StoryChatItem>[0],
		"dragHandleProps" | "isDragging"
	>,
) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: props.item.generation_id });
	return (
		<div
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			{...attributes}
		>
			<StoryChatItem
				{...props}
				dragHandleProps={listeners}
				isDragging={isDragging}
			/>
		</div>
	);
}
