import {
	BookOpenIcon as BookOpen,
	ChevronDoubleLeftIcon,
	ChevronLeftIcon,
	FolderOpenIcon as FolderOpen,
	GlobeAltIcon as Translate,
	HomeIcon as Home,
	LanguageIcon as Language,
	MicrophoneIcon as Mic,
	MusicalNoteIcon as Music,
	PencilSquareIcon as PenLine,
	PlayCircleIcon as PlayCircle,
	PuzzlePieceIcon as PuzzlePiece,
	RectangleStackIcon as RectangleStack,
	CogIcon as Settings,
	ShoppingBagIcon as ShoppingBag,
	SignalIcon as Signal,
	SparklesIcon as Sparkles,
	SpeakerWaveIcon as SpeakerWave,
	Squares2X2Icon as Squares,
} from "@heroicons/react/24/outline";
import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils/cn";
import { useUIStore } from "@/stores/uiStore";
import { type TabPath, useWorkspaceStore } from "@/stores/workspaceStore";
import { ClipboardIndicator } from "@/features/clipboard/ClipboardIndicator";

interface NavItem {
	/** i18n key under "sidebar.*" */
	label: string;
	/** Heroicon component */
	icon: typeof Home;
	/** Route path */
	path: TabPath;
}

/** Logical groups for visual separation in the sidebar. */
const NAV_GROUPS: { items: NavItem[] }[] = [
	{
		items: [
			{ path: "/", label: "sidebar.generate", icon: Home },
			{ path: "/audio-studio", label: "sidebar.audioStudio", icon: Music },
		],
	},
	{
		items: [
			{ path: "/stories", label: "sidebar.stories", icon: BookOpen },
			{ path: "/songwriter", label: "sidebar.songwriter", icon: PenLine },
			{ path: "/launcher", label: "sidebar.launcher", icon: Squares },
			{ path: "/instruments", label: "sidebar.instruments", icon: Music },
			{
				path: "/audiobooks",
				label: "sidebar.audiobooks",
				icon: RectangleStack,
			},
		],
	},
	{
		items: [
			{ path: "/voices", label: "sidebar.voices", icon: Mic },
			{ path: "/captures", label: "sidebar.captures", icon: Signal },
			{ path: "/dubbing", label: "sidebar.dubbing", icon: Language },
		],
	},
	{
		items: [
			{ path: "/effects", label: "sidebar.effects", icon: Sparkles },
			{ path: "/workspace", label: "sidebar.workspace", icon: SpeakerWave },
			{ path: "/sounds", label: "sidebar.sounds", icon: PlayCircle },
			{ path: "/translate", label: "sidebar.translate", icon: Translate },
		],
	},
	{
		items: [
			{ path: "/library", label: "sidebar.library", icon: FolderOpen },
			{ path: "/store", label: "sidebar.store", icon: ShoppingBag },
		],
	},
	{
		items: [{ path: "/settings", label: "sidebar.settings", icon: Settings }],
	},
];

export function Sidebar() {
	const { t } = useTranslation();
	const router = useRouter();
	const location = router.state.location;
	const sidebarOpen = useUIStore((s) => s.sidebarOpen);
	const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
	const storeSidebarWidth = useUIStore((s) => s.sidebarWidth);
	const setStoreSidebarWidth = useUIStore((s) => s.setSidebarWidth);
	const [sidebarWidth, setSidebarWidth] = useState(() => storeSidebarWidth);
	const isResizing = useRef(false);
	const visibleTabs = useWorkspaceStore((s) => s.visibleTabs);

	// Filter NAV_GROUPS by visible tabs. null = show all.
	const filteredGroups =
		visibleTabs === null
			? NAV_GROUPS
			: NAV_GROUPS.map((group) => ({
					items: group.items.filter((item) => visibleTabs.includes(item.path)),
				})).filter((group) => group.items.length > 0);

	const hiddenCount =
		visibleTabs === null
			? 0
			: NAV_GROUPS.reduce(
					(acc, group) =>
						acc +
						group.items.filter((item) => !visibleTabs.includes(item.path))
							.length,
					0,
				);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}
		if (window.innerWidth < 1000 && sidebarOpen) {
			setSidebarOpen(false);
		}
		const onResize = () => {
			if (window.innerWidth < 1000 && useUIStore.getState().sidebarOpen) {
				setSidebarOpen(false);
			}
		};
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, [sidebarOpen, setSidebarOpen]);

	useEffect(() => {
		localStorage.setItem("otoyin-sidebar-width", String(sidebarWidth));
		setStoreSidebarWidth(sidebarWidth);
	}, [sidebarWidth, setStoreSidebarWidth]);

	const isActive = (path: string) =>
		location.pathname === path || location.pathname.startsWith(`${path}/`);

	return (
		<aside
			className={cn(
				"shrink-0 flex flex-col h-full bg-background border-r border-border sticky top-0 z-30 transition-[width] duration-200 relative pt-2",
			)}
			style={{ width: sidebarOpen ? sidebarWidth : 64 }}
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
								Math.max(240, startWidth + ev.clientX - startX),
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
				{/* Navigation */}
				<nav
					className="flex-1 overflow-y-auto py-4 px-2 scrollbar-thin"
					aria-label={t("sidebar.navigation")}
				>
					<div className="space-y-1">
						{filteredGroups.map((group, gi) => (
							<div key={group.items[0]?.path ?? gi}>
								{gi > 0 && (
									<div
										className="my-2 border-t border-border/50 mx-2"
										aria-hidden="true"
									/>
								)}
								<ul className="space-y-0.5">
									{group.items.map((item) => {
										const active = isActive(item.path);
										return (
											<li key={item.path}>
												<Link
													to={item.path}
													title={!sidebarOpen ? t(item.label) : undefined}
													className={cn(
														"flex items-center gap-3 min-w-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors border-l-2 relative",
														active
															? "bg-accent-muted text-accent border-accent"
															: "text-muted-foreground hover:text-foreground hover:bg-muted/50 border-transparent",
													)}
													aria-current={active ? "page" : undefined}
													data-active={active ? "true" : undefined}
												>
													<item.icon
														className="size-5 shrink-0"
														aria-hidden="true"
													/>
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
							</div>
						))}
						{hiddenCount > 0 && sidebarOpen && (
							<Link
								to="/settings/workspace"
								className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
							>
								<Squares className="size-3.5" aria-hidden="true" />
								<span>{t("sidebar.showMoreTabs", { count: hiddenCount })}</span>
							</Link>
						)}
					</div>
				</nav>

				{/* Clipboard indicator — shows clip status + opens panel */}
				{sidebarOpen && (
					<div className="px-2 pb-1">
						<ClipboardIndicator />
					</div>
				)}

				{/* Mini-game — tiny access, smaller than a normal tab */}
				<div className="border-t border-border/50 mx-2 pt-2 pb-1">
					<button
						type="button"
						onClick={() => useUIStore.getState().setMiniGameOpen(true)}
						className={cn(
							"flex items-center rounded-md border border-dashed border-border bg-secondary hover:bg-secondary-hover hover:border-border transition-colors",
							sidebarOpen
								? "w-full gap-2 px-3 py-1.5"
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
							<span className="text-xs font-medium tracking-wide text-muted-foreground truncate">
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
						"flex h-12 items-center justify-center border-t border-border mx-2 rounded-lg hover:bg-muted/50 transition-colors",
						sidebarOpen ? "justify-start pl-3" : "justify-center",
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
						<span className="ml-3 text-sm font-medium text-muted-foreground">
							{t("sidebar.collapse")}
						</span>
					)}
				</button>
			</div>
		</aside>
	);
}

export default Sidebar;
