import {
	BookOpenIcon as BookOpen,
	SignalIcon as Captures,
	ChevronDoubleLeftIcon,
	ChevronLeftIcon,
	SparklesIcon as Effects,
	HomeIcon as Home,
	MicrophoneIcon as Mic,
	MusicalNoteIcon as Music,
	PuzzlePieceIcon as PuzzlePiece,
	CogIcon as Settings,
	ShoppingBagIcon as Store,
} from "@heroicons/react/24/outline";
import { Link, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardIndicator } from "@/features/clipboard/ClipboardIndicator";
import { cn } from "@/lib/utils/cn";
import { useUIStore } from "@/stores/uiStore";

interface NavItem {
	label: string;
	icon: typeof Home;
	path: string;
}

/** 8 primary destinations. The long tail (audiobooks, songwriter, launcher,
 *  instruments, dubbing, sounds, translate, workspace sub-views …) lives
 *  inside each workspace's internal navigation — not as top-level peers.
 *  One icon per destination keeps the rail scannable at a glance. */
const NAV_ITEMS: NavItem[] = [
	{ path: "/", label: "sidebar.generate", icon: Home },
	{ path: "/stories", label: "sidebar.stories", icon: BookOpen },
	{ path: "/audio-studio", label: "sidebar.audioStudio", icon: Music },
	{ path: "/voices", label: "sidebar.voices", icon: Mic },
	{ path: "/captures", label: "sidebar.captures", icon: Captures },
	{ path: "/effects", label: "sidebar.effects", icon: Effects },
	{ path: "/store", label: "sidebar.store", icon: Store },
	{ path: "/settings", label: "sidebar.settings", icon: Settings },
];

export function Sidebar() {
	const { t } = useTranslation();
	const router = useRouter();
	const location = router.state.location;
	const sidebarOpen = useUIStore((s) => s.sidebarOpen);
	const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
	const storeSidebarWidth = useUIStore((s) => s.sidebarWidth);
	const [sidebarWidth, setSidebarWidth] = useState(() => storeSidebarWidth);
	const isResizing = useRef(false);

	const isActive = (path: string) =>
		location.pathname === path || location.pathname.startsWith(`${path}/`);

	return (
		<aside
			className={cn(
				"shrink-0 flex flex-col h-full bg-background border-r border-border sticky top-0 z-30 transition-[width] duration-200 relative",
			)}
			style={{ width: sidebarOpen ? sidebarWidth : 56 }}
			aria-label={t("sidebar.ariaLabel")}
		>
			{sidebarOpen && (
				<hr
					aria-orientation="vertical"
					aria-label="Resize sidebar"
					tabIndex={0}
					className="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:w-1.5 hover:bg-border bg-transparent transition-colors touch-none border-none"
					onMouseDown={(e) => {
						isResizing.current = true;
						const startX = e.clientX;
						const startWidth = sidebarWidth;
						const onMove = (ev: MouseEvent) => {
							if (!isResizing.current) {
								return;
							}
							const next = Math.min(
								400,
								Math.max(200, startWidth + ev.clientX - startX),
							);
							setSidebarWidth(next);
						};
						const onUp = () => {
							isResizing.current = false;
							window.removeEventListener("mousemove", onMove);
							window.removeEventListener("mouseup", onUp);
						};
						window.addEventListener("mousemove", onMove);
						window.addEventListener("mouseup", onUp);
					}}
				/>
			)}
			<div className="flex h-full flex-col">
				{/* Navigation — 8 destinations, icon + label when open */}
				<nav
					className="flex-1 overflow-y-auto py-2 px-1.5 scrollbar-thin"
					aria-label={t("sidebar.navigation")}
				>
					<ul className="space-y-0.5">
						{NAV_ITEMS.map((item) => {
							const active = isActive(item.path);
							return (
								<li key={item.path}>
									<Link
										to={item.path}
										title={t(item.label)}
										aria-label={t(item.label)}
										className={cn(
											"flex items-center gap-2.5 min-w-0 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors border-l-2 relative",
											active
												? "bg-accent-muted text-accent-ink border-accent"
												: "text-muted-foreground hover:text-foreground hover:bg-muted/50 border-transparent",
										)}
										aria-current={active ? "page" : undefined}
										data-active={active ? "true" : undefined}
									>
										<item.icon className="size-4 shrink-0" aria-hidden="true" />
										<span
											className={cn(
												"truncate transition-opacity duration-150",
												sidebarOpen ? "opacity-100" : "sr-only",
											)}
										>
											{t(item.label)}
										</span>
									</Link>
								</li>
							);
						})}
					</ul>
				</nav>

				{/* Clipboard indicator — shows clip status + opens panel */}
				{sidebarOpen && (
					<div className="px-1.5 pb-0.5">
						<ClipboardIndicator />
					</div>
				)}

				{/* Mini-game — tiny access, smaller than a normal tab */}
				<div className="border-t border-border/50 mx-1.5 pt-1.5 pb-0.5">
					<button
						type="button"
						onClick={() => useUIStore.getState().setMiniGameOpen(true)}
						className={cn(
							"flex items-center rounded-md border border-dashed border-border bg-secondary hover:bg-secondary-hover hover:border-border transition-colors",
							sidebarOpen
								? "w-full gap-2 px-2.5 py-1"
								: "mx-auto size-7 justify-center",
						)}
						title="Brick Survivors — play while you generate"
						aria-label="Open Brick Survivors"
					>
						<PuzzlePiece
							className="size-3.5 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
						{sidebarOpen ? (
							<span className="text-[11px] font-medium tracking-wide text-muted-foreground truncate">
								Brick Survivors
							</span>
						) : null}
					</button>
				</div>

				{/* Collapse/Expand toggle */}
				<button
					type="button"
					onClick={() => setSidebarOpen(!sidebarOpen)}
					className={cn(
						"flex h-9 items-center justify-center border-t border-border mx-1.5 mb-1 rounded-md hover:bg-muted/50 transition-colors",
						sidebarOpen ? "justify-start pl-2.5" : "justify-center",
					)}
					aria-label={sidebarOpen ? t("sidebar.collapse") : t("sidebar.expand")}
					aria-expanded={sidebarOpen}
					title={sidebarOpen ? t("sidebar.collapse") : t("sidebar.expand")}
				>
					{sidebarOpen ? (
						<ChevronLeftIcon
							className="size-4 text-muted-foreground"
							aria-hidden="true"
						/>
					) : (
						<ChevronDoubleLeftIcon
							className="size-4 text-muted-foreground rotate-180"
							aria-hidden="true"
						/>
					)}
					{sidebarOpen && (
						<span className="ml-2 text-xs font-medium text-muted-foreground">
							{t("sidebar.collapse")}
						</span>
					)}
				</button>
			</div>
		</aside>
	);
}

export default Sidebar;
