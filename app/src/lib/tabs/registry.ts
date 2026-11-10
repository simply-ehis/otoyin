/**
 * Tab registry — single source of truth for the app's user-facing tabs.
 *
 * Consumed by:
 *  - Sidebar nav (filter: hidden tabs are dropped, groups with no visible
 *    items disappear entirely)
 *  - Settings → Workspace (toggle hidden/visible per tab)
 *  - Router guard (hidden tabs redirect to /settings/workspace before render)
 *  - Search (keywords are required — see the "every tab searchable" goal)
 *
 * `alwaysOn` tabs can never be hidden: /library, /store, /settings.
 * Hidden ≠ deleted: hiding only removes the nav entry + blocks render; the
 * tab, its backend, and its data stay intact.
 */
import {
	ArchiveBoxIcon,
	BoltIcon,
	BookOpenIcon,
	ChartBarIcon,
	ClockIcon,
	CloudArrowDownIcon,
	Cog6ToothIcon,
	DocumentTextIcon,
	FilmIcon,
	GlobeAltIcon,
	HomeIcon,
	MicrophoneIcon,
	MusicalNoteIcon,
	QuestionMarkCircleIcon,
	ScissorsIcon,
	ShoppingBagIcon,
	SparklesIcon,
	WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType, SVGProps } from "react";

export type TabIcon = ComponentType<SVGProps<SVGSVGElement>>;

export interface TabEntry {
	/** Route path (unique). */
	path: string;
	/** i18n key for the sidebar label. */
	labelKey: string;
	/** Icon component reference. */
	icon: TabIcon;
	/** Group id (key of TAB_GROUPS). */
	group: string;
	/** Search keywords — required so every tab is findable in Ctrl+K. */
	keywords: string[];
	/** Always-on tabs can never be hidden (/library, /store, /settings). */
	alwaysOn?: boolean;
}

export interface TabGroup {
	id: string;
	label: string;
	icon: TabIcon;
	/** One-line description shown in Settings → Workspace. */
	description: string;
}

export const TAB_GROUPS: TabGroup[] = [
	{
		id: "create",
		label: "Create",
		icon: SparklesIcon,
		description: "Generate speech, clone voices, write songs",
	},
	{
		id: "studio",
		label: "Studio",
		icon: MusicalNoteIcon,
		description: "Record, arrange, and produce audio",
	},
	{
		id: "voice",
		label: "Voice & Transcription",
		icon: MicrophoneIcon,
		description: "Capture, translate, analyze spoken audio",
	},
	{
		id: "processing",
		label: "Processing",
		icon: WrenchScrewdriverIcon,
		description: "Clean, enhance, isolate audio",
	},
	{
		id: "video",
		label: "Video",
		icon: FilmIcon,
		description: "Dub, preview, and import video",
	},
	{
		id: "music",
		label: "Music",
		icon: MusicalNoteIcon,
		description: "Generate and arrange music",
	},
	{
		id: "library",
		label: "Library",
		icon: ArchiveBoxIcon,
		description: "Your audio library and captured clips",
	},
	{
		id: "store",
		label: "Store",
		icon: ShoppingBagIcon,
		description: "Marketplace for models and voice packs",
	},
	{
		id: "settings",
		label: "Settings",
		icon: Cog6ToothIcon,
		description: "App configuration and account",
	},
	{
		id: "help",
		label: "Help",
		icon: QuestionMarkCircleIcon,
		description: "Support, docs, and what's new",
	},
];

const T = (
	path: string,
	labelKey: string,
	icon: TabIcon,
	group: string,
	keywords: string[],
	alwaysOn = false,
): TabEntry => ({ path, labelKey, icon, group, keywords, alwaysOn });

export const REGISTRY: TabEntry[] = [
	// Create
	T("/", "sidebar.generate", HomeIcon, "create", [
		"generate",
		"speech",
		"tts",
		"voice",
		"synthesis",
	]),
	T("/voices", "sidebar.voices", MicrophoneIcon, "create", [
		"voices",
		"clone",
		"voice profiles",
		"reference",
	]),
	T("/voice-converter", "sidebar.voiceConverter", MicrophoneIcon, "create", [
		"voice converter",
		"rvc",
		"seed-vc",
		"openvoice",
		"change voice",
	]),
	T("/songwriter", "sidebar.songwriter", BookOpenIcon, "create", [
		"songwriter",
		"lyrics",
		"song",
		"ace step",
	]),
	T("/sounds", "sidebar.sounds", MusicalNoteIcon, "create", [
		"sounds",
		"sfx",
		"sound effects",
		"freesound",
	]),
	// Studio
	T("/audio-studio", "sidebar.audioStudio", MusicalNoteIcon, "studio", [
		"audio studio",
		"daw",
		"edit",
		"arrange",
		"timeline",
	]),
	T("/stories", "sidebar.stories", BookOpenIcon, "studio", [
		"stories",
		"longform",
		"narrative",
		"story",
	]),
	T("/launcher", "sidebar.launcher", MusicalNoteIcon, "studio", [
		"launcher",
		"session",
	]),
	T("/instruments", "sidebar.instruments", MusicalNoteIcon, "studio", [
		"instruments",
		"soundfont",
		"gm",
		"keyboard",
	]),
	T("/audiobooks", "sidebar.audiobooks", BookOpenIcon, "studio", [
		"audiobooks",
		"narrate",
		"book",
		"read aloud",
	]),
	T("/mixer", "sidebar.mixer", MusicalNoteIcon, "studio", [
		"mixer",
		"mix",
		"loudness",
		"fader",
	]),
	T("/studio", "sidebar.studio", MusicalNoteIcon, "studio", ["studio"]),
	T("/comping", "sidebar.comping", MusicalNoteIcon, "studio", [
		"comping",
		"takes",
		"comp",
		"best take",
	]),
	T("/spatial", "sidebar.spatial", GlobeAltIcon, "studio", [
		"spatial",
		"3d",
		"ambisonic",
		"position",
	]),
	T("/dsp", "sidebar.dsp", MusicalNoteIcon, "studio", [
		"dsp",
		"synth",
		"dsp effect",
		"synthesizer",
	]),
	T("/automation", "sidebar.automation", BoltIcon, "studio", [
		"automation",
		"macro",
		"batch",
	]),
	// Voice & Transcription
	T("/captures", "sidebar.captures", MicrophoneIcon, "voice", [
		"captures",
		"record",
		"dictate",
		"capture pill",
	]),
	T("/translate", "sidebar.translate", GlobeAltIcon, "voice", [
		"translate",
		"translation",
		"language",
	]),
	T("/pitch", "sidebar.pitchMap", ClockIcon, "voice", [
		"pitch",
		"pitch map",
		"contour",
		"note tracking",
	]),
	T("/spectrogram", "sidebar.spectrogram", ChartBarIcon, "voice", [
		"spectrogram",
		"spectrum",
		"frequency",
	]),
	T("/diarize", "sidebar.diarize", GlobeAltIcon, "voice", [
		"diarize",
		"speaker diarization",
		"speakers",
	]),
	// Processing
	T("/effects", "sidebar.effects", SparklesIcon, "processing", [
		"effects",
		"effect preset",
		"chain",
		"preview",
	]),
	T("/noise-reduction", "sidebar.noiseReduction", ScissorsIcon, "processing", [
		"noise reduction",
		"denoise",
		"reduce noise",
		"clean",
	]),
	T("/audio-enhance", "sidebar.audioEnhance", SparklesIcon, "processing", [
		"enhance",
		"lavasr",
		"deepfilter",
		"polish",
		"enhance audio",
	]),
	T("/vocal-isolation", "sidebar.vocalIsolation", ScissorsIcon, "processing", [
		"vocal isolation",
		"stem",
		"demucs",
		"separate stems",
	]),
	// Video
	T("/dubbing", "sidebar.dubbing", FilmIcon, "video", [
		"dubbing",
		"dub",
		"video",
		"revoice",
	]),
	T("/video", "sidebar.video", FilmIcon, "video", ["video", "preview"]),
	T("/download", "sidebar.download", CloudArrowDownIcon, "video", [
		"download",
		"youtube",
		"yt",
		"convert",
	]),
	// Music
	T("/music-gen", "sidebar.musicGen", MusicalNoteIcon, "music", [
		"music generation",
		"acestep",
		"heartmula",
		"compose",
	]),
	// Library (always on)
	T(
		"/library",
		"sidebar.library",
		ArchiveBoxIcon,
		"library",
		["library", "files", "captures", "clips"],
		true,
	),
	// Store (always on)
	T(
		"/store",
		"sidebar.store",
		ShoppingBagIcon,
		"store",
		["store", "marketplace", "models", "packs"],
		true,
	),
	// Settings (always on)
	T(
		"/settings",
		"sidebar.settings",
		Cog6ToothIcon,
		"settings",
		["settings", "config", "preferences"],
		true,
	),
	// Help
	T("/help", "sidebar.help", QuestionMarkCircleIcon, "help", [
		"help",
		"docs",
		"support",
	]),
	T("/whats-new", "sidebar.whatsNew", QuestionMarkCircleIcon, "help", [
		"what's new",
		"changelog",
		"release notes",
	]),
	T("/projects", "sidebar.projects", DocumentTextIcon, "help", ["projects"]),
	T(
		"/community-presets",
		"sidebar.communityPresets",
		QuestionMarkCircleIcon,
		"help",
		["community presets", "presets"],
	),
];

export const ALWAYS_ON_PATHS = REGISTRY.filter((t) => t.alwaysOn).map(
	(t) => t.path,
);

const BY_PATH = new Map(REGISTRY.map((entry) => [entry.path, entry]));

/** Look up a tab by its route path (exact match). */
export function tabByPath(path: string): TabEntry | undefined {
	return BY_PATH.get(path);
}

/** True if `path` is an always-on tab that can never be hidden. */
export function isAlwaysOn(path: string): boolean {
	return BY_PATH.get(path)?.alwaysOn === true;
}

/** All tabs belonging to a group, in registry order. */
export function tabsInGroup(groupId: string): TabEntry[] {
	return REGISTRY.filter((t) => t.group === groupId);
}
