import {
	AdjustmentsHorizontalIcon,
	ArrowDownTrayIcon,
	ArrowsRightLeftIcon,
	ArrowUpCircleIcon,
	BoltIcon,
	ChartBarIcon,
	Cog6ToothIcon,
	DocumentTextIcon,
	FilmIcon,
	GlobeAltIcon,
	LinkIcon,
	ListBulletIcon,
	MicrophoneIcon,
	MusicalNoteIcon,
	NoSymbolIcon,
	RadioIcon,
	ScissorsIcon,
	SignalIcon,
	SparklesIcon,
	Square2StackIcon,
	UserCircleIcon,
	UsersIcon,
} from "@heroicons/react/24/outline";
import type { ElementType } from "react";

export type NavIcon = ElementType<{ className?: string }>;

export interface WorkspaceTool {
	id: string;
	path: string;
	icon: NavIcon;
	label: string;
	description: string;
}

export interface WorkspaceGroup {
	label: string;
	tools: WorkspaceTool[];
}

/**
 * Single source for workspace navigation: the rail (layout) and the
 * landing cards read the same groups. Paths are the route contract.
 */
export const WORKSPACE_GROUPS: WorkspaceGroup[] = [
	{
		label: "Core",
		tools: [
			{
				id: "timeline",
				path: "/workspace/timeline",
				icon: SignalIcon,
				label: "Timeline",
				description: "Arrange tracks and scrub your session",
			},
			{
				id: "mixer",
				path: "/workspace/mixer",
				icon: AdjustmentsHorizontalIcon,
				label: "Mixer",
				description: "Channel strips with volume, pan, and VU meters",
			},
			{
				id: "effects",
				path: "/workspace/effects",
				icon: SparklesIcon,
				label: "Effects chain",
				description: "Build, preview, and save effects chains",
			},
			{
			id: "versions",
			path: "/workspace/versions",
			icon: DocumentTextIcon,
			label: "Versions",
			description: "Browse generated audio versions",
		},
		{
			id: "studio",
			path: "/workspace/studio",
			icon: MicrophoneIcon,
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
				icon: UserCircleIcon,
				label: "Voice Changer",
				description: "Real-time pitch and formant shifting",
			},
			{
				id: "voice-converter",
				path: "/voice-converter",
				icon: ArrowsRightLeftIcon,
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
				icon: MusicalNoteIcon,
				label: "Pitch Map",
				description: "Piano-roll pitch analysis of audio",
			},
			{
				id: "spatial",
				path: "/workspace/spatial",
				icon: GlobeAltIcon,
				label: "Spatial",
				description: "3D binaural and doppler positioning",
			},
			{
				id: "dsp",
				path: "/workspace/dsp",
				icon: MusicalNoteIcon,
				label: "Synth / DSP",
				description: "Offline synthesis and DSP processing",
			},
		],
	},
	{
		label: "Processing",
		tools: [
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
				icon: ScissorsIcon,
				label: "Stems",
				description: "Split audio into vocals, drums, bass, other",
			},
			{
				id: "transcript",
				path: "/workspace/transcript",
				icon: DocumentTextIcon,
				label: "Transcript",
				description: "Edit audio by manipulating word timestamps",
			},
			{
				id: "live-transcript",
				path: "/workspace/live-transcript",
				icon: MicrophoneIcon,
				label: "Live Transcript",
				description: "Real-time Whisper speech-to-text",
			},
			{
				id: "diarize",
				path: "/workspace/diarize",
				icon: UsersIcon,
				label: "Diarize",
				description: "Speaker diarization and identification",
			},
		],
	},
	{
		label: "Advanced",
		tools: [
			{
				id: "music-gen",
				path: "/workspace/music-gen",
				icon: MusicalNoteIcon,
				label: "Music Generator",
				description: "Generate music from a text prompt",
			},
			{
				id: "adr",
				path: "/workspace/adr",
				icon: RadioIcon,
				label: "ADR",
				description: "Automated dialogue replacement over picture",
			},
			{
				id: "audio-plan",
				path: "/workspace/audio-plan",
				icon: BoltIcon,
				label: "Audio Plan",
				description: "AI scene-based audio planning",
			},
			{
				id: "conversation",
				path: "/workspace/conversation",
				icon: UsersIcon,
				label: "Conversation",
				description: "Multi-speaker dialogue arrangement",
			},
			{
				id: "comping",
				path: "/workspace/comping",
				icon: Square2StackIcon,
				label: "Comping",
				description: "Multi-take lane selection and assembly",
			},
			{
				id: "automation",
				path: "/workspace/automation",
				icon: Cog6ToothIcon,
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
				icon: ListBulletIcon,
				label: "Batch",
				description: "Process multiple files at once",
			},
			{
				id: "export",
				path: "/workspace/export",
				icon: ArrowDownTrayIcon,
				label: "Export",
				description: "One-tap platform export presets",
			},
			{
				id: "video",
				path: "/workspace/video",
				icon: FilmIcon,
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
