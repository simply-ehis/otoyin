import {
	ChevronDoubleLeftIcon,
	ChevronLeftIcon,
	PuzzlePieceIcon as PuzzlePiece,
	type SparklesIcon as Sparkles,
	XMarkIcon as XMark,
} from "@heroicons/react/24/outline";
import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardIndicator } from "@/features/clipboard/ClipboardIndicator";
import { REGISTRY, TAB_GROUPS } from "@/lib/tabs/registry";
import { cn } from "@/lib/utils/cn";
import { useUIStore } from "@/stores/uiStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";

type Icon = typeof Sparkles;

interface NavItem {
	label: string;
	icon: Icon;
	path: string;
}

interface NavGroup {
	label: string;
	description: string;
	icon: Icon;
	items: NavItem[];
}

/**
 * Unified navigation: every discoverable route lives under a category group,
 * consumed from the tab registry. Hidden tabs are filtered out — groups with
 * no visible items disappear entirely. Filtered once per render; the store
 * subscribes to hiddenTabs.
 *
 * Collapsed mode: an icon rail — tapping a group unfolds the sidebar and
 * opens that group's sub-tabs beneath it. Accordion: opening one group closes all others.
 */
function buildNavGroups(hiddenTabs: string[]): NavGroup[] {
	return TAB_GROUPS.map((group) => ({
		label: group.label,
		description: group.description,
		icon: group.icon as Icon,
		items: REGISTRY.filter(
			(entry) => entry.group === group.id && !hiddenTabs.includes(entry.path),
		).map((entry) => ({
			label: entry.labelKey,
			icon: entry.icon as Icon,
			path: entry.path,
		})),
	})).filter((group) => group.items.length > 0);
}

export function Sidebar() {
	const { t } = useTranslation();
	const router = useRouter();
	const location = router.state.location;
	const sidebarOpen = useUIStore((s) => s.sidebarOpen);
	const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
	const hiddenTabs = useWorkspaceStore((s) => s.hiddenTabs);
	const navGroups = useMemo(() => buildNavGroups(hiddenTabs), [hiddenTabs]);
	const storeSidebarWidth = useUIStore((s) => s.sidebarWidth);
	const [sidebarWidth] = useState(() => storeSidebarWidth);
	const mobileDrawerOpen = useUIStore((s) => s.mobileDrawerOpen);
	const setMobileDrawerOpen = useUIStore((s) => s.setMobileDrawerOpen);
	const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
	const [isMobile, setIsMobile] = useState(false);

	useEffect(() => {
		const check = () => setIsMobile(window.innerWidth < 768);
		check();
		window.addEventListener("resize", check);
		return () => window.removeEventListener("resize", check);
	}, []);

	const isActive = (path: string) =>
		location.pathname === path || location.pathname.startsWith(`${path}/`);

	const toggleGroup = (label: string) => {
		if (!sidebarOpen && !isMobile) {
			// Collapsed rail: tapping a folded group unfolds the sidebar and
			// opens that group's sub-tabs beneath it (accordion semantics).
			setSidebarOpen(true);
			setOpenGroups(new Set([label]));
			return;
		}
		setOpenGroups((prev) => {
			const next = new Set(prev);
			if (next.has(label)) {
				next.delete(label);
			} else {
				// Accordion: close all others when opening one
				next.clear();
				next.add(label);
			}
			return next;
		});
	};

	const handleItemClick = () => {
		if (isMobile) {
			setMobileDrawerOpen(false);
		}
	};

	return (
		<>
			{/* Mobile hamburger */}
			{isMobile && (
				<button
					type="button"
					onClick={() => setMobileDrawerOpen(true)}
					className="fixed top-4 left-4 z-[60] flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors"
					aria-label={t("sidebar.expand")}
					aria-expanded={mobileDrawerOpen}
				>
					<svg
						className="size-5 shrink-0"
						aria-hidden="true"
						xmlns="http://www.w3.org/2000/svg"
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<line x1="3" y1="12" x2="21" y2="12" />
						<line x1="3" y1="6" x2="21" y2="6" />
						<line x1="3" y1="18" x2="21" y2="18" />
					</svg>
					<span className="sr-only">{t("sidebar.expand")}</span>
				</button>
			)}

			{/* Backdrop — closes drawer on mobile */}
			{isMobile && mobileDrawerOpen && (
				<div
					className="fixed inset-0 z-[55] bg-black/40 backdrop-blur-sm transition-opacity"
					onClick={() => setMobileDrawerOpen(false)}
					aria-hidden="true"
				/>
			)}

			<aside
				className={cn(
					"shrink-0 flex flex-col h-full bg-background border-r border-border transition-[width] duration-200 relative",
					isMobile
						? "fixed inset-0 z-[60] w-[280px] border-r-0 transform transition-transform duration-300"
						: "sticky top-0 z-30",
					!sidebarOpen && !isMobile ? "w-16" : "",
					!mobileDrawerOpen && isMobile ? "-translate-x-full" : "",
				)}
				style={{ width: isMobile ? 280 : sidebarOpen ? sidebarWidth : 64 }}
				aria-label={t("sidebar.ariaLabel")}
			>
				{/* Header — brand + close on mobile */}
				{isMobile && mobileDrawerOpen && (
					<div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background">
						<span className="text-sm font-semibold tracking-tight text-foreground">
							Otoyin
						</span>
						<button
							type="button"
							onClick={() => setMobileDrawerOpen(false)}
							className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
							aria-label={t("sidebar.collapse")}
						>
							<XMark className="size-5" aria-hidden="true" />
						</button>
					</div>
				)}

				{/* Navigation — category groups */}
				<nav
					className="flex-1 overflow-y-auto py-2 px-2 scrollbar-thin"
					aria-label={t("sidebar.navigation")}
				>
					<ul className="space-y-1">
						{navGroups.map((group) => {
							const open = openGroups.has(group.label);
							// Single-tab groups (e.g. Settings, Library, Store, Music) don't
							// pretend to be folders — they navigate directly.
							if (group.items.length === 1) {
								const item = group.items[0];
								const active = isActive(item.path);
								return (
									<li key={group.label} className="relative mb-1">
										<Link
											to={item.path}
											title={t(item.label)}
											aria-label={t(item.label)}
											aria-current={active ? "page" : undefined}
											data-active={active ? "true" : undefined}
											onClick={handleItemClick}
											className={cn(
												"flex w-full h-8 items-center gap-2 rounded-md px-2 text-[11px] font-semibold uppercase tracking-wider transition-colors border-l-2",
												active
													? "bg-accent-muted text-accent-ink border-accent"
													: "text-muted-foreground/80 border-transparent hover:bg-muted/50 hover:text-foreground",
												!sidebarOpen && !isMobile && "justify-center px-2",
											)}
										>
											<item.icon
												className="size-4 shrink-0"
												aria-hidden="true"
											/>
											{sidebarOpen && (
												<span className="truncate transition-opacity duration-150 opacity-100">
													{t(item.label)}
												</span>
											)}
										</Link>
									</li>
								);
							}
							return (
								<li key={group.label} className="relative mb-1">
									{/* Group header button */}
									<button
										type="button"
										aria-expanded={open}
										aria-label={group.label}
										title={group.label}
										onClick={() => toggleGroup(group.label)}
										className={cn(
											"flex w-full h-8 items-center gap-2 rounded-md px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 transition-colors hover:bg-muted/50 hover:text-foreground",
											!sidebarOpen && !isMobile && "justify-center px-2",
										)}
									>
										<group.icon
											className="size-4 shrink-0"
											aria-hidden="true"
										/>
										{sidebarOpen && (
											<span className="truncate">{group.label}</span>
										)}
										{sidebarOpen && (
											<svg
												className={cn(
													"size-3.5 shrink-0 transition-transform duration-200 ml-auto",
													open && "rotate-90",
												)}
												xmlns="http://www.w3.org/2000/svg"
												width="16"
												height="16"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="2"
												strokeLinecap="round"
												strokeLinejoin="round"
												aria-hidden="true"
											>
												<polyline points="6 9 12 15 18 9" />
											</svg>
										)}
									</button>

									{/* Expanded mode: show child items */}
									{sidebarOpen && open && (
										<ul className="mt-1 space-y-0.5 pl-4 border-l border-border/50">
											{group.items.map((item) => {
												const active = isActive(item.path);
												return (
													<li key={item.path}>
														<Link
															to={item.path}
															title={t(item.label)}
															aria-label={t(item.label)}
															className={cn(
																"flex items-center gap-2 min-w-0 rounded-md px-2 py-2 text-[13px] font-medium transition-colors border-l-2 relative",
																active
																	? "bg-accent-muted text-accent-ink border-accent"
																	: "text-muted-foreground hover:text-foreground hover:bg-muted/50 border-transparent",
															)}
															aria-current={active ? "page" : undefined}
															data-active={active ? "true" : undefined}
															onClick={handleItemClick}
														>
															<item.icon
																className="size-4 shrink-0"
																aria-hidden="true"
															/>
															<span className="truncate transition-opacity duration-150 opacity-100">
																{t(item.label)}
															</span>
														</Link>
													</li>
												);
											})}
											{group.description && (
												<li>
													<p
														className="px-2 py-1 text-[10px] text-muted-foreground/60 truncate"
														title={group.description}
													>
														{group.description}
													</p>
												</li>
											)}
										</ul>
									)}
								</li>
							);
						})}
					</ul>
				</nav>

				{/* Single compact footer row: clipboard + mini-game + collapse (desktop) */}
				{!isMobile && (
					<div className="mx-1.5 mt-1 flex items-center gap-1 border-t border-border/50 pt-1.5 pb-1">
						<ClipboardIndicator compact />
						<button
							type="button"
							onClick={() => useUIStore.getState().setMiniGameOpen(true)}
							className="flex size-7 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-secondary transition-colors hover:border-border hover:bg-secondary-hover"
							title="Brick Survivors — play while you generate"
							aria-label="Open Brick Survivors"
						>
							<PuzzlePiece
								className="size-3.5 text-muted-foreground"
								aria-hidden="true"
							/>
						</button>
						<button
							type="button"
							onClick={() => setSidebarOpen(!sidebarOpen)}
							className="ml-auto flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-muted/50 transition-colors"
							aria-label={
								sidebarOpen ? t("sidebar.collapse") : t("sidebar.expand")
							}
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
									className="size-4 rotate-180 text-muted-foreground"
									aria-hidden="true"
								/>
							)}
						</button>
					</div>
				)}

				{/* Mobile drawer close — bottom bar keeps the collapse affordance reachable */}
				{isMobile && (
					<div className="flex items-center gap-1 border-t border-border/50 px-3 py-2">
						<ClipboardIndicator compact />
						<button
							type="button"
							onClick={() => setMobileDrawerOpen(false)}
							className="ml-auto flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-muted/50 transition-colors"
							aria-label={t("sidebar.collapse")}
						>
							<XMark
								className="size-5 text-muted-foreground"
								aria-hidden="true"
							/>
						</button>
					</div>
				)}
			</aside>
		</>
	);
}

export default Sidebar;
