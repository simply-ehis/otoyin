import {
	ArrowPathIcon,
	LockClosedIcon,
	MagnifyingGlassIcon,
	SparklesIcon,
} from "@heroicons/react/24/outline";
import { useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ALWAYS_ON_PATHS, REGISTRY, TAB_GROUPS } from "@/lib/tabs/registry";
import { cn } from "@/lib/utils/cn";
import {
	USE_CASE_PROFILES,
	type UseCaseKey,
	useWorkspaceStore,
} from "@/stores/workspaceStore";
import { Button } from "@/ui/button";
import { Switch } from "@/ui/controls";
import { SearchInput } from "@/ui/input";
import { Badge } from "@/ui/primitives";
import { EmptyState, ScreenHeader } from "@/ui/states";
import { SettingRow, SettingSection } from "./rows";

/**
 * Settings → Workspace: hide tabs you never use.
 *
 * A hidden tab disappears from the sidebar and its route redirects here
 * before anything loads — but hidden ≠ deleted: data, models, and settings
 * are untouched, and one toggle restores it.
 *
 * ?tab=<path> highlights a tab that was hidden and that the user (or an
 * old bookmark / send-to handoff) just tried to reach.
 */
export function WorkspacePage() {
	const { t } = useTranslation();
	const queryString = useSearch({ from: "/settings/workspace" });
	const highlight =
		typeof queryString.tab === "string" ? queryString.tab : null;
	const [query, setQuery] = useState("");

	const hiddenTabs = useWorkspaceStore((s) => s.hiddenTabs);
	const toggleTab = useWorkspaceStore((s) => s.toggleTab);
	const applyUseCases = useWorkspaceStore((s) => s.applyUseCases);
	const resetToAll = useWorkspaceStore((s) => s.resetToAll);
	const reopenOnboarding = useWorkspaceStore((s) => s.reopenOnboarding);
	const selectedUseCases = useWorkspaceStore((s) => s.selectedUseCases);

	const q = query.trim().toLowerCase();
	const visibleCount = REGISTRY.length - hiddenTabs.length;

	const groups = useMemo(
		() =>
			TAB_GROUPS.map((group) => {
				const tabs = REGISTRY.filter((tab) => tab.group === group.id);
				const matching = q
					? tabs.filter((tab) => {
							const label = t(tab.labelKey, {
								defaultValue: tab.path,
							}).toLowerCase();
							const haystack = `${tab.path} ${tab.keywords.join(
								" ",
							)} ${label}`.toLowerCase();
							return haystack.includes(q);
						})
					: tabs;
				return { group, tabs: matching };
			}).filter(({ tabs }) => tabs.length > 0),
		[q, t],
	);

	const highlightedTab =
		highlight !== null
			? REGISTRY.find((entry) => entry.path === highlight)
			: undefined;

	return (
		<div className="space-y-6">
			<ScreenHeader
				title={t("settings.workspace.title", {
					defaultValue: "Sidebar tabs",
				})}
				description={t("settings.workspace.description", {
					defaultValue:
						"Hide tabs you never use — the sidebar stays short and their code never loads. Nothing is deleted; toggle any tab back on.",
				})}
			/>

			{highlightedTab && hiddenTabs.includes(highlightedTab.path) ? (
				<output className="flex flex-wrap items-center gap-3 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-xs">
					<MagnifyingGlassIcon
						className="size-4 shrink-0 text-warning-text"
						aria-hidden="true"
					/>
					<span className="min-w-0 flex-1 text-sm text-foreground">
						{t("settings.workspace.highlightBody", {
							name: t(highlightedTab.labelKey, {
								defaultValue: highlightedTab.path,
							}),
							defaultValue:
								'"{{name}}" is hidden. Turn it back on to reach it.',
						})}
					</span>
					<Button
						size="sm"
						variant="outline"
						className="h-7 shrink-0 text-xs"
						onClick={() => toggleTab(highlightedTab.path)}
					>
						{t("settings.workspace.enable", { defaultValue: "Enable" })}
					</Button>
				</output>
			) : null}

			<SettingSection
				description={t("settings.workspace.searchHint", {
					defaultValue:
						"Search by name or keyword — {{visible}} of {{total}} tabs visible.",
					visible: visibleCount,
					total: REGISTRY.length,
				})}
			>
				<div className="flex flex-wrap items-center gap-2 pb-2">
					<SearchInput
						aria-label={t("settings.workspace.searchLabel", {
							defaultValue: "Filter tabs",
						})}
						placeholder={t("settings.workspace.searchPlaceholder", {
							defaultValue: "Filter tabs…",
						})}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onClear={() => setQuery("")}
						className="h-9 max-w-xs"
					/>
					<span className="text-xs tabular-nums text-muted-foreground">
						{t("settings.workspace.count", {
							defaultValue: "{{visible}}/{{total}} visible",
							visible: visibleCount,
							total: REGISTRY.length,
						})}
					</span>
				</div>
			</SettingSection>

			{groups.length === 0 ? (
				<EmptyState
					title={t("settings.workspace.noMatches", {
						defaultValue: "No tabs match",
					})}
					body={t("settings.workspace.noMatchesBody", {
						defaultValue:
							"Try a different word — keywords like “denoise” or “dub” find tabs.",
					})}
				/>
			) : (
				groups.map(({ group, tabs }) => (
					<SettingSection
						key={group.id}
						title={group.label}
						description={group.description}
					>
						{tabs.map((tab) => {
							const locked = ALWAYS_ON_PATHS.includes(tab.path);
							const checked = !hiddenTabs.includes(tab.path);
							const highlighted = highlight === tab.path;
							return (
								<SettingRow
									key={tab.path}
									title={t(tab.labelKey, { defaultValue: tab.path })}
									description={tab.keywords.slice(0, 4).join(" · ")}
									action={
										<div className="flex items-center gap-1.5">
											{locked ? (
												<Badge tone="neutral" className="gap-1">
													<LockClosedIcon
														className="size-3"
														aria-hidden="true"
													/>
													{t("settings.workspace.alwaysOn", {
														defaultValue: "Always on",
													})}
												</Badge>
											) : (
												<Switch
													checked={checked}
													label={t(tab.labelKey, {
														defaultValue: tab.path,
													})}
													onCheckedChange={() => toggleTab(tab.path)}
												/>
											)}
										</div>
									}
								>
									<div
										className={cn(
											"flex items-center gap-2 rounded-md border p-1.5",
											highlighted
												? "border-accent bg-accent/5"
												: "border-transparent",
											!checked && "opacity-60",
										)}
									>
										<tab.icon
											className="size-4 shrink-0 text-muted-foreground"
											aria-hidden="true"
										/>
										<span className="font-mono text-[11px] text-muted-foreground">
											{tab.path}
										</span>
									</div>
								</SettingRow>
							);
						})}
					</SettingSection>
				))
			)}

			<SettingSection
				title={t("settings.workspace.profiles", {
					defaultValue: "Quick profiles",
				})}
				description={t("settings.workspace.profilesDescription", {
					defaultValue:
						"Turn on the tabs for a use case — everything else hides.",
				})}
			>
				<div className="flex flex-wrap gap-2 py-2">
					{(Object.keys(USE_CASE_PROFILES) as UseCaseKey[]).map((key) => {
						const profile = USE_CASE_PROFILES[key];
						const isActive =
							selectedUseCases.length > 0 && selectedUseCases.includes(key);
						return (
							<button
								key={key}
								type="button"
								onClick={() => applyUseCases([key])}
								className={cn(
									"rounded-lg border px-3 py-1.5 text-sm transition-colors",
									isActive
										? "border-accent bg-accent/10 text-accent"
										: "border-border hover:bg-secondary text-muted-foreground hover:text-foreground",
								)}
							>
								{profile.label}
							</button>
						);
					})}
				</div>
			</SettingSection>

			<div className="flex justify-end gap-2">
				<Button variant="outline" onClick={reopenOnboarding}>
					<SparklesIcon className="mr-1.5 size-3.5" aria-hidden="true" />
					{t("settings.workspace.replayTour", {
						defaultValue: "Replay welcome tour",
					})}
				</Button>
				<Button variant="outline" onClick={resetToAll}>
					<ArrowPathIcon className="mr-1.5 size-3.5" aria-hidden="true" />
					{t("settings.workspace.reset", { defaultValue: "Show all tabs" })}
				</Button>
			</div>
		</div>
	);
}
