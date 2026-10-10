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
	Squares2X2Icon,
	WrenchIcon,
} from "@heroicons/react/24/outline";
import { Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils/cn";
import { usePlatform } from "@/platform/PlatformContext";

interface SettingsTab {
	labelKey: string;
	icon: typeof Cog6ToothIcon;
	path: string;
	tauriOnly?: boolean;
}

/**
 * Settings shell: grouped category rail + content pane. Groups tame the
 * 16-tab surface; active tab = filled segment + rose edge bar.
 */
const TAB_GROUPS: { label: string; tabs: SettingsTab[] }[] = [
	{
		label: "General",
		tabs: [
			{
				labelKey: "settings.tabs.general",
				path: "/settings",
				icon: Cog6ToothIcon,
			},
			{
				labelKey: "settings.tabs.workspace",
				path: "/settings/workspace",
				icon: Squares2X2Icon,
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
				labelKey: "settings.tabs.privacy",
				path: "/settings/privacy",
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
	const matchRoute = useMatchRoute();

	return (
		<div className="flex h-full min-h-0">
			<nav
				aria-label="Settings sections"
				className="w-48 shrink-0 overflow-y-auto border-r border-border px-1.5 py-2"
			>
				{TAB_GROUPS.map((group) => {
					const visible = group.tabs.filter(
						(tab) => !(tab.tauriOnly && !platform.metadata.isTauri),
					);
					if (visible.length === 0) {
						return null;
					}
					return (
						<div key={group.label} className="mb-2 last:mb-0">
							<p className="px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
								{group.label}
							</p>
							<ul className="flex flex-col gap-px">
								{visible.map((tab) => {
									const active =
										tab.path === "/settings"
											? Boolean(matchRoute({ to: tab.path, fuzzy: false }))
											: Boolean(matchRoute({ to: tab.path }));
									return (
										<li key={tab.path}>
											<Link
												to={tab.path}
												aria-current={active ? "page" : undefined}
												title={t(tab.labelKey)}
												className={cn(
													"relative flex items-center gap-2 rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors duration-150",
													"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
													active
														? "bg-secondary text-foreground"
														: "text-muted-foreground hover:bg-secondary hover:text-foreground",
												)}
											>
												{active ? (
													<span
														aria-hidden="true"
														className="absolute left-0 top-0.5 bottom-0.5 w-[3px] rounded-r bg-accent"
													/>
												) : null}
												<tab.icon
													className="size-3.5 shrink-0"
													aria-hidden="true"
												/>
												<span className="truncate">{t(tab.labelKey)}</span>
											</Link>
										</li>
									);
								})}
							</ul>
						</div>
					);
				})}
			</nav>
			<div className="min-w-0 flex-1 overflow-y-auto px-4 pb-4 pt-3">
				<Outlet />
			</div>
		</div>
	);
}
