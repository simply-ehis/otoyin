import { Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils/cn";
import { WORKSPACE_GROUPS } from "./nav";

/**
 * Workspace shell: collapsible group rail + outlet. Groups stay open
 * while one of their tabs is active. Active tab = filled segment +
 * rose edge bar.
 */
export function WorkspaceLayout() {
	const matchRoute = useMatchRoute();
	const [openGroups, setOpenGroups] = useState<Set<string>>(
		() => new Set(WORKSPACE_GROUPS.map((g) => g.label)),
	);
	const active = (path: string): boolean => Boolean(matchRoute({ to: path, fuzzy: true }));

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex min-h-0 flex-1">
				<nav
					aria-label="Workspace tools"
					className="flex w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border bg-sidebar px-3 py-2"
				>
					{WORKSPACE_GROUPS.map((group) => {
						const open = openGroups.has(group.label) || group.tools.some((t) => active(t.path));
						return (
							<Fragment key={group.label}>
								<button
									type="button"
									aria-expanded={open}
									onClick={() =>
										setOpenGroups((prev) => {
											const next = new Set(prev);
											if (next.has(group.label)) {
												next.delete(group.label);
											} else {
												next.add(group.label);
											}
											return next;
										})
									}
									className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 transition-colors hover:bg-secondary hover:text-muted-foreground"
								>
									<ChevronRightIcon
										className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", open && "rotate-90")}
										aria-hidden="true"
									/>
									{group.label}
								</button>
								{open ? (
									<ul className="mb-1 ml-3 flex flex-col gap-0.5 border-l border-border pl-2">
										{group.tools.map((tool) => {
											const isActive = active(tool.path);
											return (
												<li key={tool.id}>
													<Link
														to={tool.path}
														title={tool.label}
														aria-label={tool.label}
														aria-current={isActive ? "page" : undefined}
														className={cn(
															"relative flex items-center gap-2 rounded-sm px-2.5 py-2 text-sm font-medium transition-colors duration-150",
															"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
															isActive
																? "bg-secondary text-foreground"
																: "text-muted-foreground hover:bg-secondary hover:text-foreground",
														)}
													>
														{isActive ? (
															<span
																aria-hidden="true"
																className="absolute bottom-1 left-0 top-1 w-[3px] rounded-r bg-accent"
															/>
														) : null}
														<tool.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
														{tool.label}
													</Link>
												</li>
											);
										})}
									</ul>
								) : null}
							</Fragment>
						);
					})}
				</nav>
				<div className="min-w-0 flex-1 overflow-auto p-4">
					<Outlet />
				</div>
			</div>
		</div>
	);
}
