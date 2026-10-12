import {
	ArrowPathIcon,
	ChevronDownIcon as ChevronDown,
	ChevronRightIcon as ChevronRight,
	TrashIcon as Delete,
	PencilIcon as Edit,
	SparklesIcon as Sparkles,
	WrenchIcon as Wrench,
} from "@heroicons/react/24/outline";
import { memo, useMemo, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/ui/button";
import { CodeConsole } from "@/ui/code-console";
import type { Msg } from "./AssistantPanel.types";
import { AudioTransport, formatBytes } from "./AudioTransport";
import { MarkdownBody } from "./MarkdownBody";

interface AudioPreviewData {
	fileName: string;
	bytes?: number;
	streamUrl?: string;
}

function parseAudioResult(text?: string): AudioPreviewData | null {
	if (!text) {
		return null;
	}
	try {
		const data = JSON.parse(text) as Record<string, unknown>;
		if (data && typeof data.audio_file === "string") {
			return {
				fileName: data.audio_file,
				bytes: typeof data.bytes === "number" ? data.bytes : undefined,
				streamUrl: apiClient.getExportUrl(data.audio_file),
			};
		}
	} catch {
		// Non-JSON tool results are rendered as text.
	}
	return null;
}

function ToolCallBubble({ msg, onEdit }: { msg: Msg; onEdit?: () => void }) {
	const [open, setOpen] = useState(false);
	const hasArgs = Boolean(msg.toolArgs);
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-2 text-xs text-accent/80 transition-colors hover:text-accent">
				<Wrench className="size-3" />
				{hasArgs ? (
					<button
						type="button"
						onClick={() => setOpen(!open)}
						className="flex items-center gap-1.5"
						aria-expanded={open}
						title={open ? "Hide arguments" : "Show arguments"}
					>
						{open ? (
							<ChevronDown className="size-3" />
						) : (
							<ChevronRight className="size-3" />
						)}
						<span className="font-medium">{msg.toolName}</span>
					</button>
				) : (
					<span className="font-medium">{msg.toolName}</span>
				)}
				{onEdit && (
					<button
						type="button"
						onClick={onEdit}
						className="ml-auto rounded p-1 hover:bg-accent/10"
						title="Edit tool call"
						aria-label="Edit tool call"
					>
						<Edit className="size-3" />
					</button>
				)}
			</div>
			{open && msg.toolArgs && (
				<CodeConsole maxHeight="10rem" className="text-xs">
					{JSON.stringify(msg.toolArgs, null, 2)}
				</CodeConsole>
			)}
		</div>
	);
}

function ToolResultBubble({ msg }: { msg: Msg }) {
	const [open, setOpen] = useState(false);
	const audio = useMemo(
		() => parseAudioResult(msg.toolResult),
		[msg.toolResult],
	);
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-2 text-xs transition-colors hover:text-success-text text-success-text/80">
				<Wrench className="size-3" />
				<span className="font-medium">
					{audio ? "Audio: " : "Result: "}
					{msg.toolName}
				</span>
				<button
					type="button"
					onClick={() => setOpen(!open)}
					className="ml-auto rounded p-1 hover:bg-accent/10"
					aria-label={open ? "Collapse result" : "Expand result"}
					title={open ? "Collapse" : "Expand"}
				>
					{open ? (
						<ChevronDown className="size-3" />
					) : (
						<ChevronRight className="size-3" />
					)}
				</button>
			</div>

			{audio?.streamUrl && (
				<AudioTransport
					src={audio.streamUrl}
					fileName={audio.fileName}
					bytes={audio.bytes}
				/>
			)}

			{open && (
				<CodeConsole maxHeight="10rem" className="text-xs">
					{msg.toolResult || msg.content}
				</CodeConsole>
			)}
		</div>
	);
}

function TextBubble({
	msg,
	live,
	onEdit,
	onSaveEdit,
	onCancelEdit,
	onDelete,
	onBranch,
}: {
	msg: Msg;
	live?: boolean;
	onEdit?: () => void;
	onSaveEdit?: (content: string) => void;
	onCancelEdit?: () => void;
	onDelete?: () => void;
	onBranch?: () => void;
}) {
	const isUser = msg.role === "user";
	const [draft, setDraft] = useState(msg.content);
	if (msg.isEditing && isUser) {
		return (
			<div className="ml-auto w-[92%] rounded-lg border border-accent/40 bg-background px-3 py-2">
				<textarea
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Escape") {
							onCancelEdit?.();
						}
						if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
							onSaveEdit?.(draft);
						}
					}}
					ref={(el) => el?.focus()}
					rows={3}
					aria-label="Edit message text"
					className="min-h-[64px] w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
				<div className="mt-2 flex justify-end gap-2">
					<Button size="sm" variant="ghost" onClick={() => onCancelEdit?.()}>
						Cancel
					</Button>
					<Button
						size="sm"
						onClick={() => onSaveEdit?.(draft)}
						disabled={!draft.trim()}
					>
						Save
					</Button>
				</div>
			</div>
		);
	}
	return (
		<div
			className={cn(
				"group relative max-w-[92%] rounded-lg px-3 py-2 text-sm",
				isUser
					? "ml-auto bg-accent-muted text-foreground"
					: "bg-secondary text-foreground",
			)}
		>
			<MarkdownBody>{msg.content}</MarkdownBody>
			{live && !isUser && (
				<span
					aria-hidden="true"
					className="ml-1 inline-block h-4 w-[7px] animate-pulse rounded-[1px] bg-accent align-text-bottom"
				/>
			)}
			<div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
				{onEdit && (
					<button
						type="button"
						onClick={onEdit}
						className="rounded p-1 text-muted-foreground transition-transform hover:bg-accent/10 active:scale-[0.97]"
						title="Edit"
						aria-label="Edit message"
					>
						<Edit className="size-3" />
					</button>
				)}
				{onDelete && (
					<button
						type="button"
						onClick={onDelete}
						className="rounded p-1 text-muted-foreground transition-transform hover:bg-destructive/10 active:scale-[0.97]"
						title="Delete"
						aria-label="Delete message"
					>
						<Delete className="size-3" />
					</button>
				)}
				{onBranch && (
					<button
						type="button"
						onClick={onBranch}
						className="rounded p-1 text-muted-foreground transition-transform hover:bg-accent/10 active:scale-[0.97]"
						title="Branch from here"
						aria-label="Branch from here"
					>
						<ArrowPathIcon className="size-3" />
					</button>
				)}
			</div>
		</div>
	);
}

function AudioPreviewBubble({ msg }: { msg: Msg }) {
	const audio = useMemo(() => parseAudioResult(msg.content), [msg.content]);

	if (!audio || !audio.streamUrl) {
		return null;
	}

	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-2 text-xs">
				<Sparkles className="size-3 text-accent" />
				<span className="font-medium text-accent">Streaming audio preview</span>
				<span className="text-muted-foreground">
					{audio.fileName} · {formatBytes(audio.bytes || 0)}
				</span>
			</div>
			<AudioTransport src={audio.streamUrl} />
		</div>
	);
}

export const AssistantMessage = memo(function AssistantMessage({
	msg,
	live,
	onEditMessage,
	onSaveEditMessage,
	onCancelEditMessage,
	onDeleteMessage,
	onBranchMessage,
}: {
	msg: Msg;
	live?: boolean;
	onEditMessage?: (id: string) => void;
	onSaveEditMessage?: (id: string, content: string) => void;
	onCancelEditMessage?: (id: string) => void;
	onDeleteMessage?: (id: string) => void;
	onBranchMessage?: (id: string) => void;
}) {
	if (msg.role === "tool_call") {
		return (
			<ToolCallBubble
				msg={msg}
				onEdit={onEditMessage ? () => onEditMessage(msg.id) : undefined}
			/>
		);
	}
	if (msg.role === "tool_result") {
		return <ToolResultBubble msg={msg} />;
	}
	if (msg.role === "error") {
		return (
			<div className="rounded-lg border border-destructive/20 bg-danger-soft px-3 py-2">
				<p className="text-xs text-destructive">{msg.content}</p>
			</div>
		);
	}
	if (msg.role === "audio_preview") {
		return <AudioPreviewBubble msg={msg} />;
	}
	if (msg.role === "thinking") {
		return (
			<div className="rounded-lg border border-dashed border-border bg-secondary px-3 py-2">
				<p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground/70">
					Reasoning
				</p>
				<p className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground/90">
					{msg.content}
				</p>
			</div>
		);
	}
	return (
		<TextBubble
			msg={msg}
			live={live}
			onEdit={onEditMessage ? () => onEditMessage(msg.id) : undefined}
			onSaveEdit={
				onSaveEditMessage
					? (content: string) => onSaveEditMessage(msg.id, content)
					: undefined
			}
			onCancelEdit={
				onCancelEditMessage ? () => onCancelEditMessage(msg.id) : undefined
			}
			onDelete={onDeleteMessage ? () => onDeleteMessage(msg.id) : undefined}
			onBranch={onBranchMessage ? () => onBranchMessage(msg.id) : undefined}
		/>
	);
});
