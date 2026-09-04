import {
	ArrowUpCircleIcon,
	BoltIcon as AudioWaveform,
	ChartBarIcon as BarChart3,
	LightBulbIcon as Brain,
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
	UserGroupIcon as Users,
	UserCircleIcon as UserVoice,
	SparklesIcon as Wand2,
} from "@heroicons/react/24/outline";
import { Link } from "@tanstack/react-router";
import type { ElementType } from "react";
import { cn } from "@/lib/utils/cn";

type HeroIcon = ElementType<{ className?: string }>;

interface ToolCard {
	id: string;
	path: string;
	icon: HeroIcon;
	label: string;
	description: string;
}

interface ToolGroup {
	label: string;
	tools: ToolCard[];
}

const TOOL_GROUPS: ToolGroup[] = [
	{
		label: "Core",
		tools: [
			{
				id: "timeline",
				path: "/workspace/timeline",
				icon: AudioWaveform,
				label: "Timeline",
				description: "Arrange tracks and scrub your session",
			},
			{
				id: "mixer",
				path: "/workspace/mixer",
				icon: SlidersHorizontal,
				label: "Mixer",
				description: "Channel strips with volume, pan, and VU meters",
			},
			{
				id: "effects",
				path: "/workspace/effects",
				icon: Wand2,
				label: "Effects",
				description: "Build and preview effects chains",
			},
			{
				id: "studio",
				path: "/workspace/studio",
				icon: MicVocal,
				label: "Studio",
				description: "Piano, drum pads, synth, and SFX generator",
			},
		],
	},
	{
		label: "Voice",
		tools: [
			{
				id: "voice-changer",
				path: "/voice-changer",
				icon: UserVoice,
				label: "Voice Changer",
				description: "Real-time pitch and formant shifting",
			},
			{
				id: "voice-converter",
				path: "/voice-converter",
				icon: Swap,
				label: "Voice Converter",
				description: "AI voice-to-voice conversion",
			},
		],
	},
	{
		label: "Analysis",
		tools: [
			{
				id: "pitch",
				path: "/workspace/pitch",
				icon: Music,
				label: "Pitch Map",
				description: "Piano roll pitch analysis of audio",
			},
			{
				id: "spectrogram",
				path: "/workspace/spectrogram",
				icon: BarChart3,
				label: "Spectrogram",
				description: "Frequency spectrum visualization",
			},
			{
				id: "spatial",
				path: "/workspace/spatial",
				icon: Globe,
				label: "Spatial",
				description: "3D binaural and doppler positioning",
			},
			{
				id: "dsp",
				path: "/workspace/dsp",
				icon: Music,
				label: "Synth / DSP",
				description: "Offline synthesis and DSP processing",
			},
		],
	},
	{
		label: "Processing",
		tools: [
			{
				id: "noise-reduction",
				path: "/workspace/noise-reduction",
				icon: EarOff,
				label: "Noise Reduction",
				description: "RNNoise-based speech cleanup",
			},
			{
				id: "audio-enhance",
				path: "/workspace/audio-enhance",
				icon: ArrowUpCircleIcon,
				label: "Enhance",
				description: "Bandwidth extension and denoising",
			},
			{
				id: "vocal-isolation",
				path: "/workspace/vocal-isolation",
				icon: Scissors,
				label: "Isolate",
				description: "Demucs stem separation",
			},
			{
				id: "transcript",
				path: "/workspace/transcript",
				icon: FileText,
				label: "Transcript",
				description: "Edit audio by manipulating word timestamps",
			},
			{
				id: "live-transcript",
				path: "/workspace/live-transcript",
				icon: MicVocal,
				label: "Live Transcript",
				description: "Real-time Whisper speech-to-text",
			},
			{
				id: "diarize",
				path: "/workspace/diarize",
				icon: Users,
				label: "Diarize",
				description: "Speaker diarization and identification",
			},
		],
	},
	{
		label: "Advanced",
		tools: [
			{
				id: "adr",
				path: "/workspace/adr",
				icon: Radio,
				label: "ADR",
				description: "Automated dialogue replacement over picture",
			},
			{
				id: "audio-plan",
				path: "/workspace/audio-plan",
				icon: Brain,
				label: "Audio Plan",
				description: "AI scene-based audio planning",
			},
			{
				id: "conversation",
				path: "/workspace/conversation",
				icon: Users,
				label: "Conversation",
				description: "Multi-speaker dialogue arrangement",
			},
			{
				id: "comping",
				path: "/workspace/comping",
				icon: Layers,
				label: "Comping",
				description: "Multi-take lane selection and assembly",
			},
			{
				id: "automation",
				path: "/workspace/automation",
				icon: Cog,
				label: "Automation",
				description: "Parameter lanes and cue matrix",
			},
		],
	},
	{
		label: "Export",
		tools: [
			{
				id: "batch",
				path: "/workspace/batch",
				icon: ListTree,
				label: "Batch",
				description: "Process multiple files at once",
			},
			{
				id: "export",
				path: "/workspace/export",
				icon: Download,
				label: "Export",
				description: "One-tap platform export presets",
			},
			{
				id: "video",
				path: "/workspace/video",
				icon: Film,
				label: "Video",
				description: "Video preview and audio extraction",
			},
			{
				id: "download",
				path: "/workspace/download",
				icon: LinkIcon,
				label: "Download",
				description: "Import from YouTube, SoundCloud, and more",
			},
		],
	},
];

function ToolCardLink({ tool }: { tool: ToolCard }) {
	const Icon = tool.icon;
	return (
		<Link
			to={tool.path}
			className={cn(
				"group flex flex-col gap-2 p-3 rounded-xl border border-border bg-card",
				"hover:border-[hsl(var(--theme-accent)/0.3)] hover:bg-[hsl(var(--theme-accent)/0.04)]",
				"transition-all duration-200",
			)}
		>
			<div className="flex items-center gap-3">
				<div
					className={cn(
						"size-8 rounded-lg flex items-center justify-center shrink-0",
						"bg-muted group-hover:bg-[hsl(var(--theme-accent)/0.1)]",
						"transition-colors duration-200",
					)}
				>
					<Icon className="size-4 text-muted-foreground group-hover:text-[hsl(var(--theme-accent))] transition-colors duration-200" />
				</div>
				<span className="text-sm font-medium text-foreground group-hover:text-[hsl(var(--theme-accent))] transition-colors duration-200">
					{tool.label}
				</span>
			</div>
			<p className="text-xs text-muted-foreground leading-relaxed pl-[42px]">
				{tool.description}
			</p>
		</Link>
	);
}

export function WorkspaceLanding() {
	return (
		<div className="flex flex-col h-full p-6 gap-6 overflow-y-auto">
			<div>
				<h1 className="text-xl font-bold tracking-tight">Workspace</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Audio production tools — pick a tool to get started
				</p>
			</div>

			<div className="flex flex-col gap-6">
				{TOOL_GROUPS.map((group) => (
					<section key={group.label}>
						<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3">
							{group.label}
						</h2>
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
							{group.tools.map((tool) => (
								<ToolCardLink key={tool.id} tool={tool} />
							))}
						</div>
					</section>
				))}
			</div>
		</div>
	);
}
