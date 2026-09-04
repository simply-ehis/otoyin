import {
	ChartBarIcon,
	ClockIcon,
	Cog6ToothIcon,
	CommandLineIcon,
	CpuChipIcon,
	EnvelopeIcon,
	GlobeAltIcon,
	InformationCircleIcon,
	KeyIcon,
	ShieldCheckIcon,
	WrenchIcon,
} from "@heroicons/react/24/outline";
import { Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { BOTTOM_SAFE_AREA_PADDING } from "@/lib/constants/ui";
import { cn } from "@/lib/utils/cn";
import { usePlatform } from "@/platform/PlatformContext";
import { usePlayerStore } from "@/stores/playerStore";

interface SettingsTab {
	labelKey?: string;
	label?: string;
	icon: ComponentType<Record<string, unknown>>;
	path:
		| "/settings"
		| "/settings/generation"
		| "/settings/captures"
		| "/settings/mcp"
		| "/settings/gpu"
		| "/settings/system"
		| "/settings/logs"
		| "/settings/about"
		| "/settings/shortcuts"
		| "/settings/timecode"
		| "/settings/scripting"
		| "/settings/plugins"
		| "/settings/lottie-export"
		| "/settings/telemetry"
		| "/settings/api-keys"
		| "/settings/support";
	tauriOnly?: boolean;
}

interface SettingsGroup {
	label: string;
	tabs: SettingsTab[];
}

const tabGroups: SettingsGroup[] = [
	{
		label: "General",
		tabs: [
			{
				labelKey: "settings.tabs.general",
				path: "/settings",
				icon: Cog6ToothIcon,
			},
		],
	},
	{
		label: "Audio",
		tabs: [
			{
				labelKey: "settings.tabs.generation",
				path: "/settings/generation",
				icon: CommandLineIcon,
			},
		],
	},
	{
		label: "Capture",
		tabs: [
			{
				labelKey: "settings.tabs.captures",
				path: "/settings/captures",
				icon: ChartBarIcon,
			},
			{
				labelKey: "settings.tabs.shortcuts",
				path: "/settings/shortcuts",
				icon: WrenchIcon,
			},
			{
				labelKey: "settings.tabs.timecode",
				path: "/settings/timecode",
				icon: ClockIcon,
			},
		],
	},
	{
		label: "AI & Integration",
		tabs: [
			{
				labelKey: "settings.tabs.mcp",
				path: "/settings/mcp",
				icon: GlobeAltIcon,
			},
			{
				labelKey: "settings.tabs.apiKeys",
				path: "/settings/api-keys",
				icon: KeyIcon,
			},
		],
	},
	{
		label: "System",
		tabs: [
			{
				labelKey: "settings.tabs.gpu",
				path: "/settings/gpu",
				icon: CpuChipIcon,
				tauriOnly: true,
			},
			{
				labelKey: "settings.tabs.system",
				path: "/settings/system",
				icon: CpuChipIcon,
			},
			{
				labelKey: "settings.tabs.logs",
				path: "/settings/logs",
				icon: ChartBarIcon,
				tauriOnly: true,
			},
		],
	},
	{
		label: "Advanced",
		tabs: [
			{
				labelKey: "settings.tabs.scripting",
				path: "/settings/scripting",
				icon: CommandLineIcon,
			},
			{
				labelKey: "settings.tabs.plugins",
				path: "/settings/plugins",
				icon: CpuChipIcon,
			},
			{
				labelKey: "settings.tabs.lottieExport",
				path: "/settings/lottie-export",
				icon: WrenchIcon,
			},
		],
	},
	{
		label: "Privacy & Info",
		tabs: [
			{
				labelKey: "settings.tabs.telemetry",
				path: "/settings/telemetry",
				icon: ShieldCheckIcon,
			},
			{
				labelKey: "settings.tabs.about",
				path: "/settings/about",
				icon: InformationCircleIcon,
			},
			{
				labelKey: "settings.tabs.support",
				path: "/settings/support",
				icon: EnvelopeIcon,
			},
		],
	},
];

export function SettingsLayout() {
	const { t } = useTranslation();
	const platform = usePlatform();
	const isPlayerVisible = !!usePlayerStore((state) => state.audioUrl);
	const matchRoute = useMatchRoute();

	return (
		<div className="flex h-full min-h-0">
			{/* Left vertical nav — grouped 7 sections to tame warfront */}
			<nav className="w-52 shrink-0 border-r border-border py-3 px-2 overflow-y-auto">
				<div className="flex flex-col gap-3">
					{tabGroups.map((group) => {
						const visibleTabs = group.tabs.filter(
							(tab) => !(tab.tauriOnly && !platform.metadata.isTauri),
						);
						if (visibleTabs.length === 0) {
							return null;
						}
						return (
							<div key={group.label} className="space-y-1">
								<div className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
									{group.label}
								</div>
								{visibleTabs.map((tab) => {
									const Icon = tab.icon;
									const isActive =
										tab.path === "/settings"
											? matchRoute({ to: tab.path, fuzzy: false })
											: matchRoute({ to: tab.path });
									return (
										<Link
											key={tab.path}
											to={tab.path}
											className={cn(
												"flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
												isActive
													? "bg-white/[0.08] text-foreground"
													: "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
											)}
										>
											<Icon className="size-4 shrink-0" />
											<span className="truncate">
												{tab.label ?? (tab.labelKey ? t(tab.labelKey) : "")}
											</span>
										</Link>
									);
								})}
							</div>
						);
					})}
				</div>
			</nav>

			{/* Right content pane */}
			<div
				className={cn(
					"flex-1 overflow-y-auto pt-6 pb-6 px-6",
					isPlayerVisible && BOTTOM_SAFE_AREA_PADDING,
				)}
			>
				<Outlet />
			</div>
		</div>
	);
}
