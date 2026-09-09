import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { dispatchAssistantCommand } from "@/lib/assistantCommands";
import { showStudioErrorToast } from "@/lib/errors";
import { debug } from "@/lib/utils/debug";
import type { FileAttachment, Msg } from "./AssistantPanel.types";
import { makeId } from "./AssistantPanel.types";

interface UseAssistantChatOptions {
	open: boolean;
	selectedModel: string;
	selectedProvider: string;
	apiKey: string;
	apiBaseUrl: string;
}

export function useAssistantChat({
	open,
	selectedModel,
	selectedProvider,
	apiKey,
	apiBaseUrl,
}: UseAssistantChatOptions) {
	const [messages, setMessages] = useState<Msg[]>([]);
	const [input, setInput] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const [conversationId, setConversationId] = useState<string | null>(null);
	const [attachments, setAttachments] = useState<FileAttachment[]>([]);
	const [isRecording, setIsRecording] = useState(false);
	const [_audioChunks, setAudioChunks] = useState<Blob[]>([]);
	const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(
		null,
	);
	const [harnessState, setHarnessState] = useState<{
		session_id: string;
		n_ctx: number;
		context_pressure: number;
		budget_remaining: number;
		total_tool_calls: number;
		successful_calls: number;
		failed_calls: number;
		tool_confidence: Record<string, number>;
		steering_hints: string[];
	} | null>(null);

	const endRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const streamingRef = useRef(false);
	const streamingBufferRef = useRef<string>("");
	const streamingFlushTimerRef = useRef<number | null>(null);
	const lastAssistantIdxRef = useRef<number>(-1);

	const flushStreamingBuffer = useCallback(() => {
		if (streamingBufferRef.current) {
			const content = streamingBufferRef.current;
			streamingBufferRef.current = "";
			setMessages((prev) => {
				const idx = lastAssistantIdxRef.current;
				if (idx >= 0 && idx < prev.length && prev[idx].role === "assistant") {
					const next = [...prev];
					next[idx] = { ...next[idx], content: next[idx].content + content };
					return next;
				}
				return [...prev, { id: makeId(), role: "assistant", content }];
			});
		}
		if (streamingFlushTimerRef.current) {
			window.clearTimeout(streamingFlushTimerRef.current);
			streamingFlushTimerRef.current = null;
		}
	}, []);

	useEffect(() => {
		endRef.current?.scrollIntoView({ behavior: "smooth" });
	}, []);

	useEffect(() => {
		if (open) {
			setTimeout(() => inputRef.current?.focus(), 100);
		}
	}, [open]);

	useEffect(() => {
		if (open && messages.length === 0) {
			apiClient
				.listConversations("assistant", 1)
				.then((convs) => {
					if (convs.length > 0) {
						const recent = convs[0];
						setConversationId(recent.id);
						return apiClient.getHistory(recent.id, 50);
					}
					return null;
				})
				.then((history) => {
					if (history && history.length > 0) {
						setMessages(
							history.map((m) => ({
								id: makeId(),
								role: m.role as Msg["role"],
								content: m.content,
							})),
						);
					}
				})
				.catch((err) => {
					debug.warn("[assistant] load conversations failed:", err);
				});
		}
	}, [open, messages.length]);

	const handleFileSelect = useCallback((files: File[] | FileList | null) => {
		if (!files) {
			return;
		}
		const newAttachments: FileAttachment[] = [];
		for (const file of Array.from(files)) {
			if (file.size > 50 * 1024 * 1024) {
				showStudioErrorToast(`File ${file.name} exceeds 50MB limit`);
				continue;
			}
			const preview =
				file.type.startsWith("image/") ||
				file.type.startsWith("audio/") ||
				file.type.startsWith("video/")
					? URL.createObjectURL(file)
					: undefined;
			newAttachments.push({ file, preview });
		}
		setAttachments((prev) => [...prev, ...newAttachments]);
	}, []);

	const removeAttachment = useCallback((attToRemove: FileAttachment) => {
		setAttachments((prev) => {
			const idx = prev.indexOf(attToRemove);
			if (idx === -1) {
				return prev;
			}
			const att = prev[idx];
			if (att?.preview) {
				URL.revokeObjectURL(att.preview);
			}
			return prev.filter((_, i) => i !== idx);
		});
	}, []);

	const uploadAttachments = useCallback(async () => {
		const uploaded: string[] = [];
		for (const att of attachments) {
			if (att.serverPath) {
				uploaded.push(att.serverPath);
				continue;
			}
			setAttachments((prev) =>
				prev.map((a, i) =>
					i === attachments.indexOf(att) ? { ...a, uploading: true } : a,
				),
			);
			try {
				const res = await apiClient.uploadAudio(att.file);
				uploaded.push(res.audio_path);
				setAttachments((prev) =>
					prev.map((a, i) =>
						i === attachments.indexOf(att)
							? { ...a, serverPath: res.audio_path, uploading: false }
							: a,
					),
				);
			} catch {
				showStudioErrorToast(`Failed to upload ${att.file.name}`);
			}
		}
		return uploaded;
	}, [attachments]);

	const startRecording = useCallback(async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					sampleRate: 16000,
				},
			});
			const recorder = new MediaRecorder(stream, {
				mimeType: "audio/webm;codecs=opus",
			});
			const chunks: Blob[] = [];
			recorder.ondataavailable = (e) => {
				if (e.data.size > 0) {
					chunks.push(e.data);
				}
			};
			recorder.onstop = () => {
				const blob = new Blob(chunks, { type: "audio/webm" });
				const file = new File([blob], `voice_${Date.now()}.webm`, {
					type: "audio/webm",
				});
				handleFileSelect([file]);
				chunks.length = 0;
			};
			recorder.start(250);
			setMediaRecorder(recorder);
			setIsRecording(true);
			setAudioChunks(chunks);
		} catch {
			showStudioErrorToast(new Error("Microphone access denied"));
		}
	}, [handleFileSelect]);

	const stopRecording = useCallback(() => {
		if (mediaRecorder && mediaRecorder.state === "recording") {
			mediaRecorder.stop();
			for (const track of mediaRecorder.stream.getTracks()) {
				track.stop();
			}
		}
		setIsRecording(false);
		setMediaRecorder(null);
	}, [mediaRecorder]);

	const useApiKey = Boolean(selectedProvider);

	const sendMessage = useCallback(
		async (text?: string, filePaths?: string[]) => {
			const content = (text || input).trim();
			if (!content && attachments.length === 0 && !filePaths?.length) {
				return;
			}
			if (streamingRef.current) {
				return;
			}

			streamingRef.current = true;
			setInput("");
			setIsStreaming(true);

			let convId = conversationId;
			if (!convId) {
				try {
					const conv = await apiClient.createConversation({
						agent_type: "assistant",
						model_id: selectedModel,
						provider_id: selectedProvider || undefined,
					});
					convId = conv.id;
					setConversationId(convId);
				} catch {
					// Memory unavailable, continue without persistence
				}
			}

			const finalContent = content || "Uploaded file(s)";
			setMessages((prev) => [
				...prev,
				{ id: makeId(), role: "user", content: finalContent },
			]);

			if (convId) {
				try {
					await apiClient.addMessage(convId, "user", finalContent);
				} catch {
					// Non-critical: message already in local state, server sync is best-effort
				}
			}

			await uploadAttachments();
			setAttachments([]);

			const currentPath = window.location.pathname;
			const TAB_NAMES: Record<string, string> = {
				"/": "Generate",
				"/voices": "Voices",
				"/stories": "Stories",
				"/audiobooks": "Audiobooks",
				"/audio-studio": "Audio Studio",
				"/workspace": "Workspace",
				"/instruments": "Instruments",
				"/effects": "Effects",
				"/captures": "Captures",
				"/dubbing": "Dubbing",
				"/library": "Library",
				"/store": "Store",
				"/settings": "Settings",
				"/songwriter": "Songwriter",
				"/launcher": "Launcher",
				"/sounds": "Sounds",
			};
			const tabName = TAB_NAMES[currentPath] ?? currentPath;

			const history = [
				{ role: "system" as const, content: `The user is currently on the ${tabName} tab (${currentPath}). When they ask "what can I do here?" or similar, describe the features and actions available on this specific tab.` },
				...messages,
				{ id: "", role: "user" as const, content: finalContent },
			].map((m) => ({ role: m.role, content: m.content }));

			try {
				const stream = apiClient.assistantChat(
					history,
					selectedModel,
					useApiKey ? apiKey : undefined,
					useApiKey ? apiBaseUrl : undefined,
				);
				const reader = stream.getReader();
				const decoder = new TextDecoder();
				let buffer = "";

				while (true) {
					const { done, value } = await reader.read();
					if (done) {
						break;
					}
					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() || "";
					for (const line of lines) {
						if (!line.startsWith("data: ")) {
							continue;
						}
						const dataStr = line.slice(6).trim();
						if (dataStr === "[DONE]") {
							flushStreamingBuffer();
							continue;
						}
						try {
							const data = JSON.parse(dataStr);
							if (data.type === "text") {
								// Accumulate in ref, flush periodically to avoid per-chunk re-renders
								streamingBufferRef.current += data.content;
								if (streamingFlushTimerRef.current === null) {
									// Schedule first flush in 50ms, subsequent flushes handled by flush function
									streamingFlushTimerRef.current = window.setTimeout(
										flushStreamingBuffer,
										50,
									);
								}
							} else if (data.type === "tool_call") {
								setMessages((prev) => [
									...prev,
									{
										id: makeId(),
										role: "tool_call",
										content: data.content,
										toolName: data.tool_name,
										toolArgs: data.tool_args,
									},
								]);
							} else if (data.type === "tool_result") {
								if (
									data.tool_name &&
									(data.tool_name === "generate_speech" ||
										data.tool_name === "generate_sfx" ||
										data.tool_name === "transcribe")
								) {
									setMessages((prev) => [
										...prev,
										{
											id: makeId(),
											role: "audio_preview",
											content: data.tool_result,
										},
									]);
								} else {
									setMessages((prev) => [
										...prev,
										{
											id: makeId(),
											role: "tool_result",
											content: data.content,
											toolName: data.tool_name,
											toolResult: data.tool_result,
										},
									]);
								}
							} else if (data.type === "thinking") {
								setMessages((prev) => [
									...prev,
									{
										id: makeId(),
										role: "thinking",
										content: data.content,
									},
								]);
							} else if (data.type === "error") {
								setMessages((prev) => [
									...prev,
									{ id: makeId(), role: "error", content: data.content },
								]);
							} else if (data.type === "command") {
								dispatchAssistantCommand(data.intent, data.tool_args ?? {});
							} else if (data.type === "harness_session") {
								setHarnessState((prev) => ({
									...(prev ?? {}),
									session_id: data.session_id ?? prev?.session_id ?? "",
									n_ctx: data.n_ctx ?? prev?.n_ctx ?? 0,
									context_pressure: prev?.context_pressure ?? 0,
									budget_remaining: prev?.budget_remaining ?? 100,
									total_tool_calls: prev?.total_tool_calls ?? 0,
									successful_calls: prev?.successful_calls ?? 0,
									failed_calls: prev?.failed_calls ?? 0,
									tool_confidence: prev?.tool_confidence ?? {},
									steering_hints: prev?.steering_hints ?? [],
								}));
							} else if (data.type === "harness_summary") {
								const s = data.summary ?? data;
								setHarnessState({
									session_id: s.session_id ?? "",
									n_ctx: s.n_ctx ?? 0,
									context_pressure: s.context_pressure ?? 0,
									budget_remaining: s.budget_remaining ?? 100,
									total_tool_calls: s.total_tool_calls ?? 0,
									successful_calls: s.successful_calls ?? 0,
									failed_calls: s.failed_calls ?? 0,
									tool_confidence: s.tool_confidence ?? {},
									steering_hints: s.steering_hints ?? [],
								});
							}
						} catch {
							// SSE parse error — ignore heartbeats and malformed chunks
						}
					}
				}
			} catch (e: unknown) {
				flushStreamingBuffer();
				setMessages((prev) => [
					...prev,
					{
						id: makeId(),
						role: "error",
						content: e instanceof Error ? e.message : "Stream failed",
					},
				]);
			} finally {
				flushStreamingBuffer();
				if (convId) {
					setMessages((prev) => {
						const lastAssistant = [...prev]
							.reverse()
							.find((m) => m.role === "assistant");
						if (lastAssistant?.content) {
							apiClient
								.addMessage(convId, "assistant", lastAssistant.content)
								.catch((err) => {
									debug.warn("[assistant] add message failed:", err);
								});
						}
						return prev;
					});
				}
				streamingRef.current = false;
				setIsStreaming(false);
			}
		},
		[
			input,
			messages,
			selectedModel,
			selectedProvider,
			useApiKey,
			apiKey,
			apiBaseUrl,
			conversationId,
			attachments,
			uploadAttachments,
			flushStreamingBuffer,
		],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				sendMessage();
			}
		},
		[sendMessage],
	);

	const editMessage = useCallback((id: string) => {
		setMessages((prev) =>
			prev.map((m) =>
				m.id === id ? { ...m, isEditing: true, branchPoint: true } : m,
			),
		);
	}, []);

	const deleteMessage = useCallback((id: string) => {
		setMessages((prev) => prev.filter((m) => m.id !== id));
	}, []);

	const branchMessage = useCallback((id: string) => {
		setMessages((prev) => {
			const idx = prev.findIndex((m) => m.id === id);
			if (idx === -1) {
				return prev;
			}
			return prev
				.slice(0, idx + 1)
				.map((m, i) => (i === idx ? { ...m, branchPoint: true } : m));
		});
	}, []);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (e.dataTransfer.files.length > 0) {
				handleFileSelect(e.dataTransfer.files);
			}
		},
		[handleFileSelect],
	);

	return {
		messages,
		setMessages,
		input,
		setInput,
		isStreaming,
		harnessState,
		conversationId,
		setConversationId,
		attachments,
		isRecording,
		mediaRecorder,
		endRef,
		inputRef,
		fileInputRef,
		sendMessage,
		handleKeyDown,
		editMessage,
		deleteMessage,
		branchMessage,
		uploadAttachments,
		removeAttachment,
		startRecording,
		stopRecording,
		handleFileSelect,
		handleDragOver,
		handleDragLeave,
		handleDrop,
		useApiKey,
	};
}
