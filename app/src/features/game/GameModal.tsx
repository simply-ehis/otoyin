import { ArrowsPointingOutIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { useUIStore } from "@/stores/uiStore";
import { GAMES, getGame } from "./registry";

const MIN_W = 360;
const MIN_H = 320;

/** Generic game shell — resolves the open game through the registry. */
export function GameModal() {
	const open = useUIStore((s) => s.miniGameOpen);
	const setOpen = useUIStore((s) => s.setMiniGameOpen);
	const openGameId = useUIStore((s) => s.openGameId);
	const game = getGame(openGameId);

	const iframeRef = useRef<HTMLIFrameElement>(null);

	const [size, setSize] = useState({
		w: game.defaultWidth,
		h: game.defaultHeight,
	});
	const [maximized, setMaximized] = useState(false);
	const dragRef = useRef<{
		startX: number;
		startY: number;
		startW: number;
		startH: number;
	} | null>(null);

	useEffect(() => {
		if (maximized) {
			return;
		}
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		setSize({
			w: Math.min(game.defaultWidth, Math.floor(vw * 0.92)),
			h: Math.min(game.defaultHeight, Math.floor(vh * 0.88)),
		});
	}, [maximized, game.defaultWidth, game.defaultHeight]);

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
		const t = window.setTimeout(() => iframeRef.current?.focus(), 120);
		return () => {
			window.removeEventListener("keydown", onKey);
			window.clearTimeout(t);
		};
	}, [open, setOpen]);

	function onPointerDown(e: React.PointerEvent) {
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
			setSize({
				w: Math.max(
					MIN_W,
					Math.min(Math.floor(vw * 0.96), dragRef.current.startW + dx),
				),
				h: Math.max(
					MIN_H,
					Math.min(Math.floor(vh * 0.92), dragRef.current.startH + dy),
				),
			});
		};
		const onUp = () => {
			dragRef.current = null;
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
		};
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
	}

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
					className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3"
					onClick={() => setOpen(false)}
					aria-modal="true"
					role="dialog"
					aria-label={game.label}
				>
					<motion.div
						initial={{ scale: 0.97, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						exit={{ scale: 0.97, opacity: 0 }}
						transition={{ duration: 0.2, ease: "easeOut" }}
						onClick={(e) => e.stopPropagation()}
						className="relative flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[0_12px_32px_rgba(0,0,0,0.55),0_2px_6px_rgba(0,0,0,0.35)]"
						style={
							maximized
								? { width: "96vw", height: "92vh" }
								: { width: size.w, height: size.h }
						}
					>
						<div className="flex h-9 shrink-0 items-center justify-between border-b border-border bg-card px-3">
							<div className="flex min-w-0 items-center gap-2">
								<span
									className="size-2 rounded-full bg-accent"
									aria-hidden="true"
								/>
								<span className="text-xs font-semibold tracking-widest text-foreground">
									{game.wordmark}
								</span>
								<span className="hidden text-xs tracking-wide text-muted-foreground sm:inline">
									{game.tagline}
								</span>
								<GamePicker />
							</div>
							<div className="flex items-center gap-1">
								<button
									type="button"
									onClick={() => setMaximized((v) => !v)}
									className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									title={maximized ? "Restore" : "Maximize"}
									aria-label={maximized ? "Restore" : "Maximize"}
								>
									<ArrowsPointingOutIcon
										className="size-4"
										aria-hidden="true"
									/>
								</button>
								<button
									type="button"
									onClick={() => setOpen(false)}
									className="inline-flex size-7 items-center justify-center rounded-md bg-secondary text-foreground transition-all hover:bg-secondary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
									title="Close (Esc)"
									aria-label="Close"
								>
									<XMarkIcon className="size-4" aria-hidden="true" />
								</button>
							</div>
						</div>

						<div className="relative flex-1 overflow-hidden bg-sunken">
							<iframe
								key={game.id}
								ref={iframeRef}
								src={game.src}
								title={game.label}
								className="h-full w-full border-0"
								allow="autoplay; fullscreen"
								loading="lazy"
							/>
						</div>

						{!maximized && (
							<button
								type="button"
								onPointerDown={onPointerDown}
								className="absolute bottom-1 right-1 flex size-6 touch-none select-none items-center justify-center rounded-md bg-secondary text-muted-foreground transition-colors hover:bg-secondary-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

/** Game picker row — shown in the modal header once a second game lands. */
export function GamePicker() {
	const openGameId = useUIStore((s) => s.openGameId);
	const setOpenGameId = useUIStore((s) => s.setOpenGameId);
	if (GAMES.length < 2) {
		return null;
	}
	return (
		<fieldset
			className="m-0 flex min-w-0 items-center gap-1 border-0 p-0"
			aria-label="Pick a game"
		>
			{GAMES.map((g) => (
				<button
					key={g.id}
					type="button"
					aria-pressed={
						openGameId === g.id || (!openGameId && g.id === GAMES[0].id)
					}
					className={cn(
						"rounded-sm px-2 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						(openGameId ?? GAMES[0].id) === g.id
							? "bg-accent-muted text-foreground"
							: "text-muted-foreground hover:text-foreground",
					)}
					onClick={() => setOpenGameId(g.id)}
				>
					{g.label}
				</button>
			))}
		</fieldset>
	);
}
