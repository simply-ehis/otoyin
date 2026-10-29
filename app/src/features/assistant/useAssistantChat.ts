import { useCallback, useEffect, useRef, useState } from "react";
import { getCloudSubscriptionKey } from "@/features/settings/CloudModelsPage";
import { apiClient } from "@/lib/api/client";
import { showStudioErrorToast } from "@/lib/errors";
import { debug } from "@/lib/utils/debug";
import type { FileAttachment, Msg } from "./AssistantPanel.types";
import { makeId } from "./AssistantPanel.types";
import type { HarnessState, StreamEventData } from "./assistantStreamEvents";
import { applyStreamEvent } from "./assistantStreamEvents";
import { tabLabelForPath } from "./assistantTabs";
import { useAssistantMessageActions } from "./useAssistantMessageActions";

interface UseAssistantChatOptions {
	open: boolean;
	selectedModel: string;
	selectedProvider: string;
	apiKey: string;
	apiBaseUrl: string;
	useCloudModel?: boolean;
}

export function useAssistantChat({
	open,
	selectedModel,
	selectedProvider,
	apiKey,
	apiBaseUrl,
	useCloudModel = false,
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
	const [harnessState, setHarnessState] = useState<HarnessState | null>(null);
	const [historyLoading, setHistoryLoading] = useState(false);

	const endRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const streamingRef = useRef(false);
	const streamingBufferRef = useRef<string>("");
	const streamingFlushTimerRef = useRef<number | null>(null);
	const abortRef = useRef<AbortController | null>(null);
	const streamReaderRef =
		useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
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
			setHistoryLoading(true);
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
								serverId: m.id,
								role: m.role as Msg["role"],
								content: m.content,
							})),
						);
					}
				})
				.catch((err) => {
					debug.warn("[assistant] load conversations failed:", err);
				})
				.finally(() => setHistoryLoading(false));
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
			abortRef.current = new AbortController();

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
			const userMsgId = makeId();
			setMessages((prev) => [
				...prev,
				{ id: userMsgId, role: "user", content: finalContent },
			]);

			if (convId) {
				try {
					const saved = await apiClient.addMessage(
						convId,
						"user",
						finalContent,
					);
					if (saved?.id) {
						setMessages((prev) =>
							prev.map((m) =>
								m.id === userMsgId ? { ...m, serverId: saved.id } : m,
							),
						);
					}
				} catch {
					// Non-critical: message already in local state, server sync is best-effort
				}
			}

			await uploadAttachments();
			setAttachments([]);

			const currentPath = window.location.pathname;
			const tabName = tabLabelForPath(currentPath);

			const history = [
				{
					role: "system" as const,
					content: `The user is currently on the ${tabName} tab (${currentPath}). When they ask "what can I do here?" or similar, describe the features and actions available on this specific tab.`,
				},
				...messages,
				{ id: "", role: "user" as const, content: finalContent },
			].map((m) => ({ role: m.role, content: m.content }));

			// Cloud model path: streaming via /cloud/llm/stream (SSE).
			if (useCloudModel) {
				const assistantId = makeId();
				setMessages((prev) => [
					...prev,
					{ id: assistantId, role: "assistant", content: "" },
				]);
				lastAssistantIdxRef.current = -1;
				try {
					const reader = await apiClient.cloudLlmStream(
						history as { role: string; content: string }[],
						{ temperature: 0.7 },
						getCloudSubscriptionKey() || undefined,
					);
					const decoder = new TextDecoder();
					let buffer = "";
					let full = "";
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
							const payload = line.slice(6).trim();
							if (payload === "[DONE]") {
								continue;
							}
							try {
								const json = JSON.parse(payload);
								const delta = json?.choices?.[0]?.delta?.content;
								if (delta) {
									full += delta;
									setMessages((prev) =>
										prev.map((m) =>
											m.id === assistantId ? { ...m, content: full } : m,
										),
									);
								}
							} catch {
								// ignore non-JSON
							}
						}
					}
					if (convId && full) {
						void apiClient
							.addMessage(convId, "assistant", full)
							.catch(() => {});
					}
				} catch (e) {
					showStudioErrorToast(e);
				} finally {
					streamingRef.current = false;
					setIsStreaming(false);
					abortRef.current = null;
				}
				return;
			}

			try {
				const stream = apiClient.assistantChat(
					history,
					selectedModel,
					useApiKey ? apiKey : undefined,
					useApiKey ? apiBaseUrl : undefined,
					true,
					abortRef.current?.signal,
				);
				const reader = stream.getReader();
				streamReaderRef.current = reader;
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
							const data = JSON.parse(dataStr) as StreamEventData;
							applyStreamEvent(data, {
								setMessages,
								setHarnessState,
								streamingBufferRef,
								streamingFlushTimerRef,
								flushStreamingBuffer,
							});
						} catch {
							// SSE parse error — ignore heartbeats and malformed chunks
						}
					}
				}
			} catch (e: unknown) {
				flushStreamingBuffer();
				// A user-initiated Stop aborts the fetch: keep the partial reply
				// and stay silent instead of posting an error bubble.
				if (!abortRef.current?.signal.aborted) {
					setMessages((prev) => [
						...prev,
						{
							id: makeId(),
							role: "error",
							content: e instanceof Error ? e.message : "Stream failed",
						},
					]);
				}
			} finally {
				flushStreamingBuffer();
				if (convId) {
					setMessages((prev) => {
						const lastAssistant = [...prev]
							.reverse()
							.find((m) => m.role === "assistant");
						if (lastAssistant?.content) {
							const assistantId = lastAssistant.id;
							apiClient
								.addMessage(convId, "assistant", lastAssistant.content)
								.then((saved) => {
									if (saved?.id) {
										setMessages((prev) =>
											prev.map((m) =>
												m.id === assistantId ? { ...m, serverId: saved.id } : m,
											),
										);
									}
								})
								.catch((err) => {
									debug.warn("[assistant] add message failed:", err);
								});
						}
						return prev;
					});
				}
				streamingRef.current = false;
				setIsStreaming(false);
				abortRef.current = null;
				streamReaderRef.current = null;
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
			useCloudModel,
		],
	);

	const stopStreaming = useCallback(() => {
		abortRef.current?.abort();
		const reader = streamReaderRef.current;
		streamReaderRef.current = null;
		if (reader) {
			void reader.cancel().catch(() => {
				// Reader already closed — the abort above already ended the stream.
			});
		}
	}, []);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				sendMessage();
			}
		},
		[sendMessage],
	);

	const {
		editMessage,
		saveEditMessage,
		cancelEditMessage,
		deleteMessage,
		branchMessage,
	} = useAssistantMessageActions(messages, setMessages, conversationId);

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
		historyLoading,
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
		stopStreaming,
		handleKeyDown,
		editMessage,
		saveEditMessage,
		cancelEditMessage,
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
