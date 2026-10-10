import {
	PaperClipIcon as Attach,
	MicrophoneIcon as Mic,
	MicrophoneIcon as MicOff,
	PaperAirplaneIcon as Send,
	SparklesIcon as Sparkles,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/ui/button";
import { Spinner } from "@/ui/Spinner";
import type { FileAttachment, Msg } from "./AssistantPanel.types";
import { SUGGESTED } from "./AssistantPanel.types";
import { VirtualMessageList } from "./VirtualMessageList";

interface AssistantChatViewProps {
	messages: Msg[];
	input: string;
	setInput: (v: string) => void;
	isStreaming: boolean;
	attachments: FileAttachment[];
	isRecording: boolean;
	inputRef: React.RefObject<HTMLTextAreaElement | null>;
	fileInputRef: React.RefObject<HTMLInputElement | null>;
	sendMessage: (text?: string) => void;
	handleKeyDown: (e: React.KeyboardEvent) => void;
	editMessage: (id: string) => void;
	deleteMessage: (id: string) => void;
	branchMessage: (id: string) => void;
	removeAttachment: (att: FileAttachment) => void;
	startRecording: () => void;
	stopRecording: () => void;
	handleFileSelect: (files: File[] | FileList | null) => void;
	handleDragOver: (e: React.DragEvent) => void;
	handleDragLeave: (e: React.DragEvent) => void;
	handleDrop: (e: React.DragEvent) => void;
}

export function AssistantChatView({
	messages,
	input,
	setInput,
	isStreaming,
	attachments,
	isRecording,
	inputRef,
	fileInputRef,
	sendMessage,
	handleKeyDown,
	editMessage,
	deleteMessage,
	branchMessage,
	removeAttachment,
	startRecording,
	stopRecording,
	handleFileSelect,
	handleDragOver,
	handleDragLeave,
	handleDrop,
}: AssistantChatViewProps) {
	return (
		<>
			<div
				role="log"
				aria-label="Conversation messages"
				className="flex-1 overflow-hidden"
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
			>
				{messages.length === 0 ? (
					<div className="flex flex-col items-center justify-center h-full text-center space-y-6">
						<div className="size-16 rounded-full bg-accent-muted flex items-center justify-center">
							<Sparkles className="size-8 text-accent/60" />
						</div>
						<div>
							<p className="text-sm font-medium text-foreground">Ask Otoyin</p>
							<p className="text-xs text-muted-foreground mt-1 max-w-[260px]">
								Generate speech, apply effects, manage voices — all through
								conversation.
							</p>
						</div>
						<div className="space-y-2 w-full max-w-[320px]">
							{SUGGESTED.map((p) => (
								<button
									key={p}
									type="button"
									onClick={() => sendMessage(p)}
									className="w-full text-left px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
								>
									{p}
								</button>
							))}
						</div>
					</div>
				) : (
					<VirtualMessageList
						messages={messages}
						isStreaming={isStreaming}
						onEditMessage={editMessage}
						onDeleteMessage={deleteMessage}
						onBranchMessage={branchMessage}
					/>
				)}
			</div>

			{attachments.length > 0 && (
				<div className="px-4 py-2 border-t border-border bg-secondary space-y-1">
					{attachments.map((att) => (
						<div
							key={`${att.file.name}-${att.file.size}-${att.file.lastModified}`}
							className="flex items-center gap-2 px-2 py-1 bg-sunken rounded-lg"
						>
							{att.preview ? (
								att.preview.startsWith("blob:") ? (
									<img
										src={att.preview}
										alt=""
										className="size-8 rounded object-cover"
									/>
								) : (
									<audio controls src={att.preview} className="w-24 h-8">
										<track kind="captions" default />
									</audio>
								)
							) : (
								<Attach className="size-5 text-muted-foreground" />
							)}
							<div className="flex-1 min-w-0">
								<p className="text-xs truncate font-medium">{att.file.name}</p>
								<p className="text-xs text-muted-foreground">
									{(att.file.size / 1024).toFixed(1)} KB{" "}
									{att.uploading && "· Uploading..."}
								</p>
							</div>
							<Button
								variant="ghost"
								size="icon"
								className="size-6"
								onClick={() => removeAttachment(att)}
								title="Remove"
								disabled={att.uploading}
							>
								<XMarkIcon className="h-3.5 w-3.5" />
							</Button>
						</div>
					))}
				</div>
			)}

			<div className="px-4 py-3 border-t border-border bg-sidebar shrink-0">
				<div className="flex items-center gap-1 mb-2">
					<Button
						variant={isRecording ? "destructive" : "ghost"}
						size="icon"
						className="size-8"
						onClick={isRecording ? stopRecording : startRecording}
						title={isRecording ? "Stop recording" : "Voice input"}
						disabled={isStreaming}
					>
						{isRecording ? (
							<MicOff className="size-4" />
						) : (
							<Mic className="size-4" />
						)}
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="size-8"
						onClick={() => fileInputRef.current?.click()}
						title="Attach file"
						disabled={isStreaming}
					>
						<Attach className="size-4" />
					</Button>
					<input
						ref={fileInputRef}
						type="file"
						multiple
						accept="audio/*,image/*,video/*,.json,.txt,.md,.pdf"
						onChange={(e) => handleFileSelect(e.target.files)}
						className="hidden"
					/>
				</div>
				<div className="flex items-end gap-2">
					<textarea
						ref={inputRef}
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={
							isRecording
								? "Recording... speak now"
								: "Ask about audio generation..."
						}
						rows={1}
						className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[36px] max-h-[120px]"
						style={{ fieldSizing: "content" } as React.CSSProperties}
						disabled={isStreaming}
					/>
					<Button
						size="icon"
						className="size-9 shrink-0"
						onClick={() => sendMessage()}
						disabled={
							(!input.trim() && attachments.length === 0) || isStreaming
						}
						title="Send"
					>
						{isStreaming ? <Spinner size="md" /> : <Send className="size-4" />}
					</Button>
				</div>
			</div>
		</>
	);
}
