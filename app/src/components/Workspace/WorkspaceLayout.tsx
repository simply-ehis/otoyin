import {
	ArrowUpCircleIcon,
	BoltIcon as AudioWaveform,
	ChartBarIcon as BarChart3,
	LightBulbIcon as Brain,
	ChevronRightIcon,
	CogIcon as Cog,
	ArrowDownTrayIcon as Download,
	NoSymbolIcon as EarOff,
	DocumentTextIcon as FileText,
	FilmIcon as Film,
	GlobeAmericasIcon as Globe,
	Square2StackIcon as Layers,
	LinkIcon,
	ListBulletIcon as ListTree,
	MicrophoneIcon as MicVocal,
	MusicalNoteIcon as Music,
	RadioIcon as Radio,
	ScissorsIcon as Scissors,
	AdjustmentsHorizontalIcon as SlidersHorizontal,
	ArrowsRightLeftIcon as Swap,
	UsersIcon as Users,
	UserCircleIcon as UserVoice,
	SparklesIcon as Wand2,
} from "@heroicons/react/24/outline";
import { Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import type { ElementType } from "react";
import { Fragment, useState } from "react";
import { cn } from "@/lib/utils/cn";

type HeroIcon = ElementType<{ className?: string }>;

interface TabGroup {
	label: string;
	tabs: Array<{
		id: string;
		path: string;
		icon: HeroIcon;
		label: string;
	}>;
}

const workspaceTabGroups: TabGroup[] = [
	{
		label: "Core",
		tabs: [
			{
				id: "timeline",
				path: "/workspace/timeline",
				icon: AudioWaveform,
				label: "Timeline",
			},
			{
				id: "mixer",
				path: "/workspace/mixer",
				icon: SlidersHorizontal,
				label: "Mixer",
			},
			{
				id: "effects",
				path: "/workspace/effects",
				icon: Wand2,
				label: "Effects",
			},
			{
				id: "studio",
				path: "/workspace/studio",
				icon: MicVocal,
				label: "Studio",
			},
		],
	},
	{
		label: "Voice",
		tabs: [
			{
				id: "voice-changer",
				path: "/voice-changer",
				icon: UserVoice,
				label: "Voice Changer",
			},
			{
				id: "voice-converter",
				path: "/voice-converter",
				icon: Swap,
				label: "Voice Converter",
			},
		],
	},
	{
		label: "Analysis",
		tabs: [
			{ id: "pitch", path: "/workspace/pitch", icon: Music, label: "Pitch" },
			{
				id: "spectrogram",
				path: "/workspace/spectrogram",
				icon: BarChart3,
				label: "Spectrogram",
			},
			{
				id: "spatial",
				path: "/workspace/spatial",
				icon: Globe,
				label: "Spatial",
			},
			{ id: "dsp", path: "/workspace/dsp", icon: Music, label: "Synth / DSP" },
		],
	},
	{
		label: "Processing",
		tabs: [
			{
				id: "noise-reduction",
				path: "/workspace/noise-reduction",
				icon: EarOff,
				label: "Noise Reduction",
			},
			{
				id: "audio-enhance",
				path: "/workspace/audio-enhance",
				icon: ArrowUpCircleIcon,
				label: "Enhance",
			},
			{
				id: "vocal-isolation",
				path: "/workspace/vocal-isolation",
				icon: Scissors,
				label: "Stems",
			},
			{
				id: "transcript",
				path: "/workspace/transcript",
				icon: FileText,
				label: "Transcript",
			},
			{
				id: "live-transcript",
				path: "/workspace/live-transcript",
				icon: MicVocal,
				label: "Live Transcript",
			},
			{
				id: "diarize",
				path: "/workspace/diarize",
				icon: Users,
				label: "Diarize",
			},
		],
	},
	{
		label: "Advanced",
		tabs: [
			{ id: "adr", path: "/workspace/adr", icon: Radio, label: "ADR" },
			{
				id: "audio-plan",
				path: "/workspace/audio-plan",
				icon: Brain,
				label: "Audio Plan",
			},
			{
				id: "conversation",
				path: "/workspace/conversation",
				icon: Users,
				label: "Conversation",
			},
			{
				id: "comping",
				path: "/workspace/comping",
				icon: Layers,
				label: "Comping",
			},
			{
				id: "automation",
				path: "/workspace/automation",
				icon: Cog,
				label: "Automation",
			},
		],
	},
	{
		label: "Export",
		tabs: [
			{ id: "batch", path: "/workspace/batch", icon: ListTree, label: "Batch" },
			{
				id: "export",
				path: "/workspace/export",
				icon: Download,
				label: "Export",
			},
			{ id: "video", path: "/workspace/video", icon: Film, label: "Video" },
			{
				id: "download",
				path: "/workspace/download",
				icon: LinkIcon,
				label: "Download",
			},
		],
	},
];

function TabLink({
	tab,
	isActive,
}: {
	tab: {
		id: string;
		path: string;
		icon: HeroIcon;
		label: string;
	};
	isActive: boolean;
}) {
	const Icon = tab.icon;
	return (
		<Link
			to={tab.path}
			title={tab.label}
			aria-label={tab.label}
			aria-current={isActive ? "page" : undefined}
			className={cn(
				"flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200",
				isActive
					? "bg-[hsl(var(--theme-accent)/0.12)] text-[hsl(var(--theme-accent))] border border-[hsl(var(--theme-accent)/0.3)] shadow-sm shadow-[hsl(var(--theme-accent)/0.1)]"
					: "text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--theme-surface-elevated))] hover:border-[hsl(var(--theme-border))] border border-transparent",
			)}
		>
			<Icon
				className={cn(
					"h-4 w-4 shrink-0",
					isActive && "text-[hsl(var(--theme-accent))]",
				)}
			/>
			<span>{tab.label}</span>
		</Link>
	);
}

function TabGroupHeader({
	label,
	isOpen,
	onClick,
}: {
	label: string;
	isOpen: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 hover:text-muted-foreground transition-colors",
				"rounded-lg hover:bg-[hsl(var(--theme-surface-elevated))]",
			)}
			aria-expanded={isOpen}
		>
			<ChevronRightIcon
				className={cn(
					"h-3.5 w-3.5 shrink-0 transition-transform duration-200",
					isOpen && "rotate-90",
				)}
			/>
			<span>{label}</span>
		</button>
	);
}

export function WorkspaceLayout() {
	const matchRoute = useMatchRoute();
	const [openGroups, setOpenGroups] = useState<Set<string>>(
		new Set(workspaceTabGroups.map((g) => g.label)),
	);

	const isTabActive = (path: string): boolean => {
		return Boolean(matchRoute({ to: path, fuzzy: true }));
	};

	const toggleGroup = (label: string) => {
		setOpenGroups((prev) => {
			const next = new Set(prev);
			if (next.has(label)) {
				next.delete(label);
			} else {
				next.add(label);
			}
			return next;
		});
	};

	return (
		<div className="flex flex-col h-full font-geist">
			<nav
				className="flex flex-col gap-1 px-3 py-2 border-r border-[hsl(var(--theme-border))] bg-[hsl(var(--theme-surface))] shrink-0 overflow-y-auto"
				aria-label="Workspace navigation"
			>
				{workspaceTabGroups.map((group) => {
					const isGroupOpen = openGroups.has(group.label);
					const hasActiveTab = group.tabs.some((tab) => isTabActive(tab.path));

					return (
						<Fragment key={group.label}>
							<TabGroupHeader
								label={group.label}
								isOpen={isGroupOpen || hasActiveTab}
								onClick={() => toggleGroup(group.label)}
							/>
							{(isGroupOpen || hasActiveTab) && (
								<div className="pl-2 space-y-1 pb-2 border-l border-[hsl(var(--theme-border))/0.3] ml-3">
									{group.tabs.map((tab) => {
										const isActive = isTabActive(tab.path);
										return (
											<TabLink key={tab.id} tab={tab} isActive={isActive} />
										);
									})}
								</div>
							)}
						</Fragment>
					);
				})}
			</nav>

			<div className="flex-1 overflow-auto">
				<Outlet />
			</div>
		</div>
	);
}
