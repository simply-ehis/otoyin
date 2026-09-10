import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import {
	ALL_TAB_PATHS,
	USE_CASE_PROFILES,
	type TabPath,
	type UseCaseKey,
	useWorkspaceStore,
} from "@/stores/workspaceStore";
import { Button } from "@/ui/button";
import { Switch } from "@/ui/controls";
import { SettingRow, SettingSection } from "./rows";

/** Human-readable labels for each tab path. */
const TAB_LABELS: Record<TabPath, string> = {
	"/": "Generate",
	"/audio-studio": "Audio Studio",
	"/stories": "Stories",
	"/songwriter": "Songwriter",
	"/launcher": "Launcher",
	"/instruments": "Instruments",
	"/audiobooks": "Audiobooks",
	"/voices": "Voices",
	"/captures": "Captures",
	"/dubbing": "Dubbing",
	"/effects": "Effects",
	"/workspace": "Workspace",
	"/sounds": "Sounds",
	"/library": "Library",
	"/store": "Store",
	"/settings": "Settings",
};

export function WorkspacePage() {
	const { t } = useTranslation();
	const visibleTabs = useWorkspaceStore((s) => s.visibleTabs);
	const selectedUseCases = useWorkspaceStore((s) => s.selectedUseCases);
	const toggleTab = useWorkspaceStore((s) => s.toggleTab);
	const applyUseCases = useWorkspaceStore((s) => s.applyUseCases);
	const resetToAll = useWorkspaceStore((s) => s.resetToAll);

	const isTabVisible = (tab: TabPath) =>
		visibleTabs === null || visibleTabs.includes(tab);

	return (
		<div className="space-y-6">
			<SettingSection
				title={t("settings.workspace.title", "Sidebar tabs")}
				description={t(
					"settings.workspace.description",
					"Choose which tabs appear in the sidebar. Uncheck to hide a tab.",
				)}
			>
				{ALL_TAB_PATHS.filter((p) => p !== "/settings").map((tab) => (
					<SettingRow
						key={tab}
						title={TAB_LABELS[tab]}
						action={
							<Switch
								checked={isTabVisible(tab)}
								onCheckedChange={() => toggleTab(tab)}
								label={`Show ${TAB_LABELS[tab]} in sidebar`}
							/>
						}
					/>
				))}
			</SettingSection>

			<SettingSection
				title={t("settings.workspace.profiles", "Quick profiles")}
				description={t(
					"settings.workspace.profilesDescription",
					"Apply a preset combination of tabs for a specific use case.",
				)}
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
								className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
									isActive
										? "border-accent bg-accent/10 text-accent"
										: "border-border hover:bg-secondary text-muted-foreground hover:text-foreground"
								}`}
							>
								{profile.label}
							</button>
						);
					})}
				</div>
			</SettingSection>

			<div className="flex justify-end">
				<Button variant="outline" onClick={resetToAll}>
					<ArrowPathIcon className="mr-1.5 size-3.5" aria-hidden="true" />
					{t("settings.workspace.reset", "Show all tabs")}
				</Button>
			</div>
		</div>
	);
}
