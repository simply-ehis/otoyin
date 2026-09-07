import {
	BookOpenIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	Cog6ToothIcon,
	CubeTransparentIcon,
	FolderOpenIcon,
	HomeIcon,
	LanguageIcon,
	MicrophoneIcon,
	MusicalNoteIcon,
	PencilSquareIcon,
	PlayCircleIcon,
	PuzzlePieceIcon,
	RectangleStackIcon,
	Squares2X2Icon,
	ShoppingBagIcon,
	SignalIcon,
	SparklesIcon,
	SpeakerWaveIcon,
} from "@heroicons/react/24/outline";
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils/cn";
import { useUIStore } from "@/stores/uiStore";

interface NavItem {
	label: string;
	icon: typeof HomeIcon;
	path: string;
}

/**
 * Primary navigation: grouped sidebar, icon rail when collapsed.
 * Active item = tinted fill + rose edge bar (never color alone).
 * Resize handle is keyboard-operable; width persists in the store.
 */
const NAV_GROUPS: { items: NavItem[] }[] = [
	{
		items: [
			{ path: "/", label: "sidebar.generate", icon: HomeIcon },
			{
				path: "/audio-studio",
				label: "sidebar.audioStudio",
				icon: MusicalNoteIcon,
			},
		],
	},
	{
		items: [
			{ path: "/stories", label: "sidebar.stories", icon: BookOpenIcon },
			{
				path: "/songwriter",
				label: "sidebar.songwriter",
				icon: PencilSquareIcon,
			},
			{
				path: "/launcher",
				label: "sidebar.launcher",
				icon: Squares2X2Icon,
			},
			{
				path: "/instruments",
				label: "sidebar.instruments",
				icon: MusicalNoteIcon,
			},
			{
				path: "/audiobooks",
				label: "sidebar.audiobooks",
				icon: RectangleStackIcon,
			},
		],
	},
	{
		items: [
			{ path: "/voices", label: "sidebar.voices", icon: MicrophoneIcon },
			{ path: "/captures", label: "sidebar.captures", icon: SignalIcon },
			{ path: "/dubbing", label: "sidebar.dubbing", icon: LanguageIcon },
		],
	},
	{
		items: [
			{ path: "/effects", label: "sidebar.effects", icon: SparklesIcon },
			{
				path: "/instruments",
				label: "sidebar.instruments",
				icon: CubeTransparentIcon,
			},
			{ path: "/workspace", label: "sidebar.workspace", icon: SpeakerWaveIcon },
			{ path: "/sounds", label: "sidebar.sounds", icon: PlayCircleIcon },
		],
	},
	{
		items: [
			{ path: "/library", label: "sidebar.library", icon: FolderOpenIcon },
			{ path: "/store", label: "sidebar.store", icon: ShoppingBagIcon },
		],
	},
	{
		items: [
			{ path: "/settings", label: "sidebar.settings", icon: Cog6ToothIcon },
		],
	},
];

const MIN_WIDTH = 200;
const MAX_WIDTH = 360;
const RAIL_WIDTH = 56;

export function Sidebar() {
	const { t } = useTranslation();
	const { location } = useRouterState();
	const sidebarOpen = useUIStore((s) => s.sidebarOpen);
	const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
	const storeWidth = useUIStore((s) => s.sidebarWidth);
	const setStoreWidth = useUIStore((s) => s.setSidebarWidth);
	const setMiniGameOpen = useUIStore((s) => s.setMiniGameOpen);
	const [width, setWidth] = useState(storeWidth);
	const dragStart = useRef<{ x: number; w: number } | null>(null);

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
		try {
			localStorage.setItem("otoyin-sidebar-width", String(width));
		} catch {
			// Private mode — width simply won't persist.
		}
		setStoreWidth(width);
	}, [width, setStoreWidth]);

	const isActive = (path: string) =>
		location.pathname === path || location.pathname.startsWith(`${path}/`);

	const onHandleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "ArrowLeft") {
			e.preventDefault();
			setWidth((w) => Math.max(MIN_WIDTH, w - 16));
		} else if (e.key === "ArrowRight") {
			e.preventDefault();
			setWidth((w) => Math.min(MAX_WIDTH, w + 16));
		}
	};

	return (
		<aside
			aria-label={t("sidebar.ariaLabel")}
			className="relative z-30 flex h-full shrink-0 flex-col border-r border-border bg-sidebar"
			style={{ width: sidebarOpen ? width : RAIL_WIDTH }}
		>
			{sidebarOpen ? (
				<div
					role="slider"
					tabIndex={0}
					aria-label="Resize sidebar"
					aria-valuemin={MIN_WIDTH}
					aria-valuemax={MAX_WIDTH}
					aria-valuenow={width}
					onKeyDown={onHandleKeyDown}
					onMouseDown={(e) => {
						dragStart.current = { x: e.clientX, w: width };
						const onMove = (ev: MouseEvent) => {
							if (!dragStart.current) {
								return;
							}
							setWidth(
								Math.min(
									MAX_WIDTH,
									Math.max(
										MIN_WIDTH,
										dragStart.current.w + ev.clientX - dragStart.current.x,
									),
								),
							);
						};
						const onUp = () => {
							dragStart.current = null;
							window.removeEventListener("mousemove", onMove);
							window.removeEventListener("mouseup", onUp);
						};
						window.addEventListener("mousemove", onMove);
						window.addEventListener("mouseup", onUp);
					}}
					className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none focus-visible:outline-none focus-visible:bg-accent/40"
				/>
			) : null}

			<div className="flex h-14 shrink-0 items-center justify-center border-b border-border px-3">
				<Link
					to="/"
					aria-label="Otoyin home"
					className={cn(
						"flex items-center gap-2.5",
						!sidebarOpen && "pointer-events-none opacity-0",
					)}
				>
					<span
						aria-hidden="true"
						className="grid size-7 shrink-0 place-items-center rounded-md bg-accent"
					>
						<SparklesIcon className="size-4 text-white" />
					</span>
					<span className="whitespace-nowrap text-sm font-medium tracking-tight text-foreground">
						Otoyin
					</span>
				</Link>
				{!sidebarOpen ? (
					<span
						aria-hidden="true"
						className="grid size-7 shrink-0 place-items-center rounded-md bg-accent"
					>
						<SparklesIcon className="size-4 text-white" />
					</span>
				) : null}
			</div>

			<nav
				aria-label={t("sidebar.navigation")}
				className="flex-1 overflow-y-auto px-2 py-3"
			>
				{NAV_GROUPS.map((group, gi) => (
					<div key={group.items[0]?.path ?? gi}>
						{gi > 0 ? (
							<div
								aria-hidden="true"
								className="mx-2 my-2 border-t border-border"
							/>
						) : null}
						<ul className="flex flex-col gap-0.5">
							{group.items.map((item) => {
								const active = isActive(item.path);
								return (
									<li key={item.path}>
										<Link
											to={item.path}
											title={!sidebarOpen ? t(item.label) : undefined}
											aria-current={active ? "page" : undefined}
											className={cn(
												"relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150",
												"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
												active
													? "bg-secondary text-foreground"
													: "text-muted-foreground hover:bg-secondary hover:text-foreground",
												!sidebarOpen && "justify-center px-0",
											)}
										>
											{active ? (
												<span
													aria-hidden="true"
													className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-accent"
												/>
											) : null}
											<item.icon
												className="size-5 shrink-0"
												aria-hidden="true"
											/>
											<span
												className={cn("truncate", !sidebarOpen && "sr-only")}
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
			</nav>

			<div className="mx-2 border-t border-border px-1 pb-1 pt-2">
				<button
					type="button"
					onClick={() => setMiniGameOpen(true)}
					title="Brick Survivors — play while you generate"
					aria-label="Open Brick Survivors"
					className={cn(
						"flex items-center rounded-md border border-dashed border-strong bg-transparent transition-colors hover:bg-secondary",
						sidebarOpen
							? "w-full gap-2 px-3 py-1.5"
							: "mx-auto size-7 justify-center",
					)}
				>
					<PuzzlePieceIcon
						className="size-3.5 shrink-0 text-muted-foreground"
						aria-hidden="true"
					/>
					{sidebarOpen ? (
						<span className="truncate text-xs font-medium text-muted-foreground">
							Brick Survivors
						</span>
					) : null}
				</button>
			</div>

			<button
				type="button"
				onClick={() => setSidebarOpen(!sidebarOpen)}
				aria-label={sidebarOpen ? t("sidebar.collapse") : t("sidebar.expand")}
				aria-expanded={sidebarOpen}
				title={sidebarOpen ? t("sidebar.collapse") : t("sidebar.expand")}
				className={cn(
					"mx-2 mb-2 flex h-10 items-center rounded-md border-t border-border transition-colors hover:bg-secondary",
					sidebarOpen ? "justify-start gap-3 px-3" : "justify-center",
				)}
			>
				{sidebarOpen ? (
					<ChevronLeftIcon
						className="size-4 text-muted-foreground"
						aria-hidden="true"
					/>
				) : (
					<ChevronRightIcon
						className="size-4 text-muted-foreground"
						aria-hidden="true"
					/>
				)}
				{sidebarOpen ? (
					<span className="text-sm font-medium text-muted-foreground">
						{t("sidebar.collapse")}
					</span>
				) : null}
			</button>
		</aside>
	);
}
