import { ArrowsPointingOutIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUIStore } from "@/stores/uiStore";

const DEFAULT_W = 920;
const DEFAULT_H = 680;
const MIN_W = 360;
const MIN_H = 320;

export function MiniGame() {
	const open = useUIStore((s) => s.miniGameOpen);
	const setOpen = useUIStore((s) => s.setMiniGameOpen);
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });
	const [maximized, setMaximized] = useState(false);
	const dragRef = useRef<{
		startX: number;
		startY: number;
		startW: number;
		startH: number;
	} | null>(null);

	// Clamp default to viewport on mount and when maximized toggles off
	useEffect(() => {
		if (maximized) {
			return;
		}
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const w = Math.min(DEFAULT_W, Math.floor(vw * 0.92));
		const h = Math.min(DEFAULT_H, Math.floor(vh * 0.88));
		setSize({ w, h });
	}, [maximized]);

	// ESC to close, focus iframe on open
	useEffect(() => {
		if (!open) {
			return;
		}
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setOpen(false);
			}
		};
		window.addEventListener("keydown", onKey);
		// focus iframe for keyboard controls
		const t = window.setTimeout(() => iframeRef.current?.focus(), 120);
		return () => {
			window.removeEventListener("keydown", onKey);
			window.clearTimeout(t);
		};
	}, [open, setOpen]);

	const onPointerDown = useCallback(
		(e: React.PointerEvent) => {
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
			dragRef.current = {
				startX: e.clientX,
				startY: e.clientY,
				startW: size.w,
				startH: size.h,
			};
			const onMove = (ev: PointerEvent) => {
				if (!dragRef.current) {
					return;
				}
				const dx = ev.clientX - dragRef.current.startX;
				const dy = ev.clientY - dragRef.current.startY;
				const vw = window.innerWidth;
				const vh = window.innerHeight;
				const w = Math.max(
					MIN_W,
					Math.min(Math.floor(vw * 0.96), dragRef.current.startW + dx),
				);
				const h = Math.max(
					MIN_H,
					Math.min(Math.floor(vh * 0.92), dragRef.current.startH + dy),
				);
				setSize({ w, h });
			};
			const onUp = () => {
				dragRef.current = null;
				window.removeEventListener("pointermove", onMove);
				window.removeEventListener("pointerup", onUp);
			};
			window.addEventListener("pointermove", onMove);
			window.addEventListener("pointerup", onUp);
		},
		[size.w, size.h],
	);

	if (!open) {
		return null;
	}

	return (
		<AnimatePresence>
			{open && (
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.18 }}
					className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 -[2px] p-3"
					onClick={() => setOpen(false)}
					aria-modal="true"
					role="dialog"
					aria-label="Brick Survivors"
				>
					<motion.div
						ref={containerRef}
						initial={{ scale: 0.97, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						exit={{ scale: 0.97, opacity: 0 }}
						transition={{ duration: 0.2, ease: "easeOut" }}
						onClick={(e) => e.stopPropagation()}
						className="relative flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0a0a0f] shadow-[0_20px_80px_rgba(0,0,0,0.6)]"
						style={
							maximized
								? { width: "96vw", height: "92vh" }
								: { width: size.w, height: size.h }
						}
					>
						{/* header */}
						<div className="flex h-9 shrink-0 items-center justify-between border-b border-white/10 bg-[#0a0a0f] px-3">
							<div className="flex items-center gap-2 min-w-0">
								<span
									className="size-2 rounded-full bg-[#4a9eff] shadow-[0_0_8px_rgba(74,158,255,0.6)]"
									aria-hidden
								/>
								<span className="text-xs font-semibold tracking-widest text-white/90">
									BRICK SURVIVORS
								</span>
								<span className="hidden sm:inline text-xs tracking-wide text-white/30">
									— play while you generate
								</span>
							</div>
							<div className="flex items-center gap-1">
								<button
									type="button"
									onClick={() => setMaximized((v) => !v)}
									className="inline-flex size-7 items-center justify-center rounded-md text-white/60 hover:bg-secondary-hover hover:text-white transition-colors"
									title={maximized ? "Restore" : "Maximize"}
									aria-label={maximized ? "Restore" : "Maximize"}
								>
									<ArrowsPointingOutIcon className="size-4" />
								</button>
								<button
									type="button"
									onClick={() => setOpen(false)}
									className="inline-flex size-7 items-center justify-center rounded-md bg-secondary text-white/80 hover:bg-secondary-hover hover:text-white transition-colors"
									title="Close (Esc)"
									aria-label="Close"
								>
									<XMarkIcon className="size-4" />
								</button>
							</div>
						</div>

						{/* iframe — keep original game design untouched */}
						<div className="relative flex-1 bg-[#0a0a0f] overflow-hidden">
							<iframe
								ref={iframeRef}
								src="/game/game.html"
								title="Brick Survivors"
								className="h-full w-full border-0"
								allow="autoplay; fullscreen"
								loading="lazy"
							/>
						</div>

						{/* resize handle — visible when not maximized */}
						{!maximized && (
							<button
								type="button"
								onPointerDown={onPointerDown}
								className="absolute bottom-1 right-1 size-6 rounded-md bg-secondary hover:bg-secondary-hover text-white/50 hover:text-white/80 flex items-center justify-center touch-none select-none"
								title="Drag to resize"
								aria-label="Resize"
							>
								<svg
									width="12"
									height="12"
									viewBox="0 0 12 12"
									fill="none"
									aria-hidden="true"
								>
									<title>Resize</title>
									<path
										d="M10 2 L10 10 L2 10"
										stroke="currentColor"
										strokeWidth="1.3"
										strokeLinecap="round"
										strokeLinejoin="round"
										opacity="0.9"
									/>
									<path
										d="M7 10 L10 7"
										stroke="currentColor"
										strokeWidth="1.1"
										strokeLinecap="round"
										opacity="0.7"
									/>
								</svg>
							</button>
						)}
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}

/** Floating nudge shown while generation is in-flight. */
export function GenerationGameNudge({ onOpen }: { onOpen: () => void }) {
	return (
		<motion.button
			type="button"
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: 8 }}
			onClick={onOpen}
			className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#1a1a1f]/90 px-3.5 py-1.5 text-xs font-medium text-white/90 shadow-lg hover:bg-[#23232a] transition-colors"
			title="Play Brick Survivors while you wait"
		>
			<span
				className="size-1.5 rounded-full bg-emerald-400 animate-pulse"
				aria-hidden
			/>
			Generating… play Brick Survivors?
			<span className="ml-1 hidden sm:inline text-white/50">↗</span>
		</motion.button>
	);
}
