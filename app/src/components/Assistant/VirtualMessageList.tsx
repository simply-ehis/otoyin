import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef } from "react";
import { AssistantMessage } from "./AssistantMessage";
import type { Msg } from "./AssistantPanel.types";

interface VirtualMessageListProps {
	messages: Msg[];
	isStreaming: boolean;
	onEditMessage: (id: string) => void;
	onDeleteMessage: (id: string) => void;
	onBranchMessage: (id: string) => void;
}

export function VirtualMessageList({
	messages,
	isStreaming,
	onEditMessage,
	onDeleteMessage,
	onBranchMessage,
}: VirtualMessageListProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const endRef = useRef<HTMLDivElement>(null);

	const virtualizer = useVirtualizer({
		count: messages.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => 80, // initial estimate, refined by measurement
		overscan: 5,
	});

	// Auto-scroll to bottom when new messages arrive or streaming updates
	useEffect(() => {
		if (messages.length === 0) {
			return;
		}
		// Use requestAnimationFrame to wait for DOM update
		const raf = requestAnimationFrame(() => {
			const el = scrollRef.current;
			if (!el) {
				return;
			}
			const isNearBottom =
				el.scrollHeight - el.scrollTop - el.clientHeight < 200;
			if (isNearBottom || isStreaming) {
				virtualizer.scrollToIndex(messages.length - 1, {
					align: "end",
					behavior: "smooth",
				});
			}
		});
		return () => cancelAnimationFrame(raf);
	}, [messages.length, isStreaming, virtualizer]);

	const measureRef = useCallback(
		(node: HTMLDivElement | null) => {
			if (!node) {
				return;
			}
			const id = node.dataset.msgId;
			if (id) {
				virtualizer.measureElement(node);
			}
		},
		[virtualizer],
	);

	const items = virtualizer.getVirtualItems();

	return (
		<div
			ref={scrollRef}
			role="log"
			aria-label="Conversation messages"
			className="flex-1 overflow-y-auto px-4 py-4"
			style={{ contain: "strict" }}
		>
			<div
				style={{
					height: `${virtualizer.getTotalSize()}px`,
					width: "100%",
					position: "relative",
				}}
			>
				{items.map((virtualRow) => {
					const msg = messages[virtualRow.index];
					return (
						<div
							key={virtualRow.key}
							data-msg-id={msg.id}
							ref={measureRef}
							style={{
								position: "absolute",
								top: 0,
								left: 0,
								width: "100%",
								transform: `translateY(${virtualRow.start}px)`,
							}}
						>
							<div className="pb-4">
								<AssistantMessage
									msg={msg}
									onEditMessage={onEditMessage}
									onDeleteMessage={onDeleteMessage}
									onBranchMessage={onBranchMessage}
								/>
							</div>
						</div>
					);
				})}
			</div>
			<div ref={endRef} style={{ height: 1 }} />
		</div>
	);
}
