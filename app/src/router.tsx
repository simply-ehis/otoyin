import {
	createRootRoute,
	createRoute,
	createRouter,
	redirect,
} from "@tanstack/react-router";
import { lazy } from "react";
import { CommunityPresetsPage } from "@/features/content/CommunityPresetsPage";
import { OffersPage } from "@/features/content/OffersPage";
import { StandaloneProjectPage } from "@/features/content/StandaloneProjectPage";
import { WhatsNewPage } from "@/features/content/WhatsNewPage";
import { DubPage } from "@/features/dubbing/DubPage";
import { HelpPage } from "@/features/help/HelpPage";
import { LibraryTab } from "@/features/library/LibraryTab";
import { ApiKeysPage } from "@/features/settings/ApiKeysPage";
import { CloudModelsPage } from "@/features/settings/CloudModelsPage";
import { LottieExportPage } from "@/features/settings/LottieExportPage";
import { ModelHealthPage } from "@/features/settings/ModelHealthPage";
import { PluginsPage } from "@/features/settings/PluginsPage";
import { PrivacyPage } from "@/features/settings/PrivacyPage";
import { SchemaSettingsPage } from "@/features/settings/SchemaSettingsPage";
import { ScriptingPage } from "@/features/settings/ScriptingPage";
import { ShortcutsPage } from "@/features/settings/ShortcutsPage";
import { SupportPage } from "@/features/settings/SupportPage";
import { TelemetryPage } from "@/features/settings/TelemetryPage";
import { TimecodeDisplay } from "@/features/settings/TimecodeDisplay";
// Direct imports for page components referenced by createRoute (not lazy-loaded)
import { StorePage } from "@/features/store/StorePage";
import { StoryEditor } from "@/features/stories/StoryEditor";
import { TranslateView } from "@/features/translate/TranslateView";
import { RootLayout } from "@/layouts/RootLayout/RootLayout";
import { REGISTRY } from "@/lib/tabs/registry";
import { useWorkspaceStore } from "@/stores/workspaceStore";

// Lazy-loaded page components for code splitting
const CapturesTab = lazy(() =>
	import("@/features/captures/CapturesTab").then((m) => ({
		default: m.CapturesTab,
	})),
);
const EffectsTab = lazy(() =>
	import("@/features/effects/EffectsTab").then((m) => ({
		default: m.EffectsTab,
	})),
);
const AudioEnhanceView = lazy(() =>
	import("@/features/workspace/AudioEnhanceView").then((m) => ({
		default: m.AudioEnhanceView,
	})),
);
const AutomationView = lazy(() =>
	import("@/features/workspace/AutomationView").then((m) => ({
		default: m.AutomationView,
	})),
);
const ConversationView = lazy(() =>
	import("@/features/workspace/ConversationView").then((m) => ({
		default: m.ConversationView,
	})),
);
const DiarizationView = lazy(() =>
	import("@/features/workspace/DiarizationView").then((m) => ({
		default: m.DiarizationView,
	})),
);
const MultiTakeCompingView = lazy(() =>
	import("@/features/workspace/MultiTakeCompingView").then((m) => ({
		default: m.MultiTakeCompingView,
	})),
);
const MusicGenView = lazy(() =>
	import("@/features/workspace/MusicGenView").then((m) => ({
		default: m.MusicGenView,
	})),
);
const NoiseReductionView = lazy(() =>
	import("@/features/workspace/NoiseReductionView").then((m) => ({
		default: m.NoiseReductionView,
	})),
);
const PlatformExportView = lazy(() =>
	import("@/features/workspace/PlatformExportView").then((m) => ({
		default: m.PlatformExportView,
	})),
);
const SoundEffectsView = lazy(() =>
	import("@/features/workspace/SoundEffectsView").then((m) => ({
		default: m.SoundEffectsView,
	})),
);
const SpatialView = lazy(() =>
	import("@/features/workspace/SpatialView").then((m) => ({
		default: m.SpatialView,
	})),
);
const SpectrogramView = lazy(() =>
	import("@/features/workspace/SpectrogramView").then((m) => ({
		default: m.SpectrogramView,
	})),
);
const TranscriptEditView = lazy(() =>
	import("@/features/workspace/TranscriptEditView").then((m) => ({
		default: m.TranscriptEditView,
	})),
);
const VideoPreviewView = lazy(() =>
	import("@/features/workspace/VideoPreviewView").then((m) => ({
		default: m.VideoPreviewView,
	})),
);
const VocalIsolationView = lazy(() =>
	import("@/features/workspace/VocalIsolationView").then((m) => ({
		default: m.VocalIsolationView,
	})),
);
const VoiceConverterView = lazy(() =>
	import("@/features/workspace/VoiceConverterView").then((m) => ({
		default: m.VoiceConverterView,
	})),
);
const YouTubeDownloadView = lazy(() =>
	import("@/features/workspace/YouTubeDownloadView").then((m) => ({
		default: m.YouTubeDownloadView,
	})),
);
const MainEditor = lazy(() =>
	import("@/features/generate/GeneratePage").then((m) => ({
		default: m.GeneratePage,
	})),
);
const AudioStudio = lazy(() =>
	import("@/features/audioStudio/AudioStudio").then((m) => ({
		default: m.AudioStudio,
	})),
);
const AboutPage = lazy(() =>
	import("@/features/settings/AboutPage").then((m) => ({
		default: m.AboutPage,
	})),
);
const CapturesPage = lazy(() =>
	import("@/features/settings/CapturesPage").then((m) => ({
		default: m.CapturesPage,
	})),
);
const GeneralPage = lazy(() =>
	import("@/features/settings/GeneralPage").then((m) => ({
		default: m.GeneralPage,
	})),
);
const GenerationPage = lazy(() =>
	import("@/features/settings/GenerationPage").then((m) => ({
		default: m.GenerationPage,
	})),
);
const GpuPage = lazy(() =>
	import("@/features/settings/GpuPage").then((m) => ({
		default: m.GpuPage,
	})),
);
const LogsPage = lazy(() =>
	import("@/features/settings/LogsPage").then((m) => ({
		default: m.LogsPage,
	})),
);
const MCPPage = lazy(() =>
	import("@/features/settings/MCPPage").then((m) => ({
		default: m.MCPPage,
	})),
);
const WorkspaceSettingsPage = lazy(() =>
	import("@/features/settings/WorkspacePage").then((m) => ({
		default: m.WorkspacePage,
	})),
);
const SettingsLayout = lazy(() =>
	import("@/features/settings/SettingsLayout").then((m) => ({
		default: m.SettingsLayout,
	})),
);
const SongwriterTab = lazy(() =>
	import("@/features/songwriter/SongwriterTab").then((m) => ({
		default: m.SongwriterTab,
	})),
);
const LauncherTab = lazy(() =>
	import("@/features/launcher/LauncherTab").then((m) => ({
		default: m.LauncherTab,
	})),
);
const InstrumentLibraryTab = lazy(() =>
	import("@/features/instruments/InstrumentLibrary").then((m) => ({
		default: m.InstrumentLibrary,
	})),
);
const AudiobooksTab = lazy(() =>
	import("@/features/audiobooks/AudiobooksTab").then((m) => ({
		default: m.AudiobooksTab,
	})),
);
const ClonePage = lazy(() =>
	import("@/features/voices/ClonePage").then((m) => ({
		default: m.ClonePage,
	})),
);
const TimelineView = lazy(() =>
	import("@/features/workspace/TimelineView").then((m) => ({
		default: m.TimelineView,
	})),
);
const PitchMapView = lazy(() =>
	import("@/features/workspace/PitchMapView").then((m) => ({
		default: m.PitchMapView,
	})),
);
const MixerView = lazy(() =>
	import("@/features/workspace/MixerView").then((m) => ({
		default: m.MixerView,
	})),
);
const DspView = lazy(() =>
	import("@/features/workspace/DspView").then((m) => ({
		default: m.DspView,
	})),
);
const ADRView = lazy(() =>
	import("@/features/workspace/adr/ADRView").then((m) => ({
		default: m.ADRView,
	})),
);
const StudioView = lazy(() =>
	import("@/features/workspace/StudioView").then((m) => ({
		default: m.StudioView,
	})),
);
const AudioPlanView = lazy(() =>
	import("@/features/workspace/AudioPlanView").then((m) => ({
		default: m.AudioPlanView,
	})),
);
const BatchQueueView = lazy(() =>
	import("@/features/workspace/BatchQueueView").then((m) => ({
		default: m.BatchQueueView,
	})),
);

// Root route with layout
const rootRoute = createRootRoute({
	component: RootLayout,
	beforeLoad: ({ location }) => {
		// Hidden tabs redirect before render — nothing behind them loads.
		// Settings is the escape hatch: always allowed to render.
		const path = location.pathname;
		if (
			path.startsWith("/settings") ||
			path === "/help" ||
			path === "/whats-new" ||
			path === "/projects" ||
			path === "/community-presets"
		) {
			return;
		}
		const match = REGISTRY.find(
			(tab) => path === tab.path || path.startsWith(`${tab.path}/`),
		);
		if (!match) {
			return;
		}
		if (useWorkspaceStore.getState().hiddenTabs.includes(match.path)) {
			throw redirect({
				to: "/settings/workspace",
				search: { tab: match.path },
			});
		}
	},
});

// Index route (main/generate)
const indexRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: MainEditor,
});

// Stories route
const storiesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/stories",
	component: StoryEditor,
});

// Songwriter route (song DNA + lyrics craft, ported from Resonant)
const songwriterRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/songwriter",
	component: SongwriterTab,
});

// Launcher route
const launcherRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/launcher",
	component: LauncherTab,
});

// Instruments route
const instrumentsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/instruments",
	component: InstrumentLibraryTab,
});

// Audiobooks route
const audiobooksRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/audiobooks",
	component: AudiobooksTab,
});

// Voices route
const voicesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/voices",
	component: ClonePage,
});

// Captures route (prototype — will replace AudioTab once the new flow is ready)
const capturesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/captures",
	component: CapturesTab,
});

// Effects route
const effectsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/effects",
	validateSearch: (
		search: Record<string, unknown>,
	): { generation?: string; path?: string } => ({
		generation:
			typeof search.generation === "string" ? search.generation : undefined,
		path: typeof search.path === "string" ? search.path : undefined,
	}),
	component: EffectsTab,
});

// Models route — unified into Marketplace at /store (kept as redirect; the marketplace is the ONLY place to buy/download/delete)
const modelsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/models",
	beforeLoad: () => {
		throw redirect({ to: "/store" });
	},
});

// Settings layout route (parent for sub-tabs)
const settingsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/settings",
	component: SettingsLayout,
});

// Settings sub-routes
const settingsGeneralRoute = createRoute({
	getParentRoute: () => settingsRoute,
	path: "/",
	component: GeneralPage,
});

const settingsSchemaRoute = createRoute({
	getParentRoute: () => settingsRoute,
	path: "/schema",
	component: SchemaSettingsPage,
});

const settingsGenerationRoute = createRoute({
	getParentRoute: () => settingsRoute,
	path: "/generation",
	component: GenerationPage,
});

const settingsCapturesRoute = createRoute({
	getParentRoute: () => settingsRoute,
	path: "/captures",
	component: CapturesPage,
});

const settingsMCPRoute = createRoute({
	getParentRoute: () => settingsRoute,
	path: "/mcp",
	component: MCPPage,
});

const settingsGpuRoute = createRoute({
	getParentRoute: () => settingsRoute,
	path: "/gpu",
	component: GpuPage,
});

const settingsLogsRoute = createRoute({
	getParentRoute: () => settingsRoute,
	path: "/logs",
	component: LogsPage,
});

const settingsAboutRoute = createRoute({
	getParentRoute: () => settingsRoute,
	path: "/about",
	component: AboutPage,
});

const settingsShortcutsRoute = createRoute({
	getParentRoute: () => settingsRoute,
	path: "/shortcuts",
	component: ShortcutsPage,
});

const helpRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/help",
	component: HelpPage,
});

const settingsTimecodeRoute = createRoute({
	getParentRoute: () => settingsRoute,
	path: "/timecode",
	component: TimecodeDisplay,
});

const settingsScriptingRoute = createRoute({
	getParentRoute: () => settingsRoute,
	path: "/scripting",
	component: ScriptingPage,
});

const settingsPluginsRoute = createRoute({
	getParentRoute: () => settingsRoute,
	path: "/plugins",
	component: PluginsPage,
});

const settingsLottieExportRoute = createRoute({
	getParentRoute: () => settingsRoute,
	path: "/lottie-export",
	component: LottieExportPage,
});

const settingsTelemetryRoute = createRoute({
	getParentRoute: () => settingsRoute,
	path: "/telemetry",
	component: TelemetryPage,
});

const settingsPrivacyRoute = createRoute({
	getParentRoute: () => settingsRoute,
	path: "/privacy",
	component: PrivacyPage,
});

const settingsApiKeysRoute = createRoute({
	getParentRoute: () => settingsRoute,
	path: "/api-keys",
	component: ApiKeysPage,
});

const settingsWorkspaceRoute = createRoute({
	getParentRoute: () => settingsRoute,
	path: "/workspace",
	validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
		tab: typeof search.tab === "string" ? search.tab : undefined,
	}),
	component: WorkspaceSettingsPage,
});

const settingsSystemRoute = createRoute({
	getParentRoute: () => settingsRoute,
	path: "/system",
	component: ModelHealthPage,
});

// Dubbing route
const dubbingRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/dubbing",
	component: DubPage,
});

// Voice changer route (standalone, outside workspace tabs)
const liveTranscriptRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/live-transcript",
	beforeLoad: () => {
		throw redirect({ to: "/transcript" });
	},
});

const voiceChangerRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/voice-changer",
	beforeLoad: () => {
		throw redirect({ to: "/voice-converter" });
	},
});

// RVC voice converter route
const voiceConverterRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/voice-converter",
	component: VoiceConverterView,
});

// Sound effects (Freesound) route
const soundEffectsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/sounds",
	component: SoundEffectsView,
});

// Translation route (text ↔ text, offline packs via Store)
const translateRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/translate",
	component: TranslateView,
});

// Projects route
const projectsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/projects",
	component: StandaloneProjectPage,
});

// Community presets route
const communityPresetsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/community-presets",
	component: CommunityPresetsPage,
});

// Audio Studio route
const audioStudioRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/audio-studio",
	component: AudioStudio,
});

// What's New route
const whatsNewRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/whats-new",
	component: WhatsNewPage,
});

// Offers route
const offersRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/offers",
	component: OffersPage,
});

// Store / Marketplace route
const storeRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/store",
	component: StorePage,
});

// Library — unified audio library
const libraryRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/library",
	component: LibraryTab,
});

// Promoted workspace-only routes (top-level canonical paths)
const timelineRouteTop = createRoute({
	getParentRoute: () => rootRoute,
	path: "/timeline",
	component: TimelineView,
});

const pitchRouteTop = createRoute({
	getParentRoute: () => rootRoute,
	path: "/pitch",
	component: PitchMapView,
});

const mixerRouteTop = createRoute({
	getParentRoute: () => rootRoute,
	path: "/mixer",
	component: MixerView,
});

const studioRouteTop = createRoute({
	getParentRoute: () => rootRoute,
	path: "/studio",
	component: StudioView,
});

const dspRouteTop = createRoute({
	getParentRoute: () => rootRoute,
	path: "/dsp",
	component: DspView,
});

const adrRouteTop = createRoute({
	getParentRoute: () => rootRoute,
	path: "/adr",
	validateSearch: (search: Record<string, unknown>): { session?: string } => ({
		session: typeof search.session === "string" ? search.session : undefined,
	}),
	component: ADRView,
});

const audioPlanRouteTop = createRoute({
	getParentRoute: () => rootRoute,
	path: "/audio-plan",
	component: AudioPlanView,
});

const conversationRouteTop = createRoute({
	getParentRoute: () => rootRoute,
	path: "/conversation",
	component: ConversationView,
});

const compingRouteTop = createRoute({
	getParentRoute: () => rootRoute,
	path: "/comping",
	component: MultiTakeCompingView,
});

const automationRouteTop = createRoute({
	getParentRoute: () => rootRoute,
	path: "/automation",
	component: AutomationView,
});

const noiseReductionRouteTop = createRoute({
	getParentRoute: () => rootRoute,
	path: "/noise-reduction",
	validateSearch: (search: Record<string, unknown>): { path?: string } => ({
		path: typeof search.path === "string" ? search.path : undefined,
	}),
	component: NoiseReductionView,
});

const audioEnhanceRouteTop = createRoute({
	getParentRoute: () => rootRoute,
	path: "/audio-enhance",
	validateSearch: (search: Record<string, unknown>): { path?: string } => ({
		path: typeof search.path === "string" ? search.path : undefined,
	}),
	component: AudioEnhanceView,
});

const vocalIsolationRouteTop = createRoute({
	getParentRoute: () => rootRoute,
	path: "/vocal-isolation",
	validateSearch: (search: Record<string, unknown>): { path?: string } => ({
		path: typeof search.path === "string" ? search.path : undefined,
	}),
	component: VocalIsolationView,
});

const spectrogramRouteTop = createRoute({
	getParentRoute: () => rootRoute,
	path: "/spectrogram",
	component: SpectrogramView,
});

const exportRouteTop = createRoute({
	getParentRoute: () => rootRoute,
	path: "/export",
	component: PlatformExportView,
});

const transcriptRouteTop = createRoute({
	getParentRoute: () => rootRoute,
	path: "/transcript",
	validateSearch: (
		search: Record<string, unknown>,
	): { generation?: string } => ({
		generation:
			typeof search.generation === "string" ? search.generation : undefined,
	}),
	component: TranscriptEditView,
});

const spatialRouteTop = createRoute({
	getParentRoute: () => rootRoute,
	path: "/spatial",
	component: SpatialView,
});

const musicGenRouteTop = createRoute({
	getParentRoute: () => rootRoute,
	path: "/music-gen",
	component: MusicGenView,
});

const diarizeRouteTop = createRoute({
	getParentRoute: () => rootRoute,
	path: "/diarize",
	component: DiarizationView,
});

const videoRouteTop = createRoute({
	getParentRoute: () => rootRoute,
	path: "/video",
	component: VideoPreviewView,
});

const downloadRouteTop = createRoute({
	getParentRoute: () => rootRoute,
	path: "/download",
	component: YouTubeDownloadView,
});

const batchRouteTop = createRoute({
	getParentRoute: () => rootRoute,
	path: "/batch",
	component: BatchQueueView,
});

// Settings → Support sub-route
const settingsSupportRoute = createRoute({
	getParentRoute: () => settingsRoute,
	path: "/support",
	component: SupportPage,
});

// Stem separation sub-route
const stemSeparationRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/stem-separation",
	beforeLoad: () => {
		throw redirect({ to: "/vocal-isolation" });
	},
});

// Settings → Cloud models sub-route
const settingsCloudModelsRoute = createRoute({
	getParentRoute: () => settingsRoute,
	path: "/cloud-models",
	component: CloudModelsPage,
});

// Redirect old /server path to /settings
const serverRedirectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/server",
	beforeLoad: () => {
		throw redirect({ to: "/settings" });
	},
});

// Retired /workspace/* redirects → top-level canonical paths
const workspaceRedirectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspace",
	beforeLoad: () => {
		throw redirect({ to: "/" });
	},
});

const workspaceTimelineRedirectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspace/timeline",
	beforeLoad: () => {
		throw redirect({ to: "/timeline" });
	},
});

const workspacePitchRedirectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspace/pitch",
	beforeLoad: () => {
		throw redirect({ to: "/pitch" });
	},
});

const workspaceMixerRedirectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspace/mixer",
	beforeLoad: () => {
		throw redirect({ to: "/mixer" });
	},
});

const workspaceEffectsRedirectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspace/effects",
	beforeLoad: () => {
		throw redirect({ to: "/effects" });
	},
});

const workspaceStudioRedirectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspace/studio",
	beforeLoad: () => {
		throw redirect({ to: "/studio" });
	},
});

const workspaceDspRedirectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspace/dsp",
	beforeLoad: () => {
		throw redirect({ to: "/dsp" });
	},
});

const workspaceVoiceChangerRedirectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspace/voice-changer",
	beforeLoad: () => {
		throw redirect({ to: "/voice-converter" });
	},
});

const workspaceAdrRedirectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspace/adr",
	beforeLoad: () => {
		throw redirect({ to: "/adr" });
	},
});

const workspaceAudioPlanRedirectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspace/audio-plan",
	beforeLoad: () => {
		throw redirect({ to: "/audio-plan" });
	},
});

const workspaceConversationRedirectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspace/conversation",
	beforeLoad: () => {
		throw redirect({ to: "/conversation" });
	},
});

const workspaceCompingRedirectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspace/comping",
	beforeLoad: () => {
		throw redirect({ to: "/comping" });
	},
});

const workspaceAutomationRedirectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspace/automation",
	beforeLoad: () => {
		throw redirect({ to: "/automation" });
	},
});

const workspaceNoiseReductionRedirectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspace/noise-reduction",
	beforeLoad: () => {
		throw redirect({ to: "/noise-reduction" });
	},
});

const workspaceAudioEnhanceRedirectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspace/audio-enhance",
	beforeLoad: () => {
		throw redirect({ to: "/audio-enhance" });
	},
});

const workspaceVocalIsolationRedirectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspace/vocal-isolation",
	beforeLoad: () => {
		throw redirect({ to: "/vocal-isolation" });
	},
});

const workspaceSpectrogramRedirectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspace/spectrogram",
	beforeLoad: () => {
		throw redirect({ to: "/spectrogram" });
	},
});

const workspaceExportRedirectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspace/export",
	beforeLoad: () => {
		throw redirect({ to: "/export" });
	},
});

const workspaceTranscriptRedirectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspace/transcript",
	beforeLoad: () => {
		throw redirect({ to: "/transcript" });
	},
});

const workspaceSpatialRedirectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspace/spatial",
	beforeLoad: () => {
		throw redirect({ to: "/spatial" });
	},
});

const workspaceMusicGenRedirectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspace/music-gen",
	beforeLoad: () => {
		throw redirect({ to: "/music-gen" });
	},
});

const workspaceDiarizeRedirectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspace/diarize",
	beforeLoad: () => {
		throw redirect({ to: "/diarize" });
	},
});

const workspaceVideoRedirectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspace/video",
	beforeLoad: () => {
		throw redirect({ to: "/video" });
	},
});

const workspaceDownloadRedirectRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspace/download",
	beforeLoad: () => {
		throw redirect({ to: "/download" });
	},
});

// Route tree
const routeTree = rootRoute.addChildren([
	// Core top-level routes
	indexRoute,
	storiesRoute,
	songwriterRoute,
	launcherRoute,
	instrumentsRoute,
	audiobooksRoute,
	capturesRoute,
	voicesRoute,
	effectsRoute,
	modelsRoute,
	dubbingRoute,
	whatsNewRoute,
	offersRoute,
	libraryRoute,
	storeRoute,

	// Promoted workspace-only routes (top-level canonical paths)
	timelineRouteTop,
	pitchRouteTop,
	mixerRouteTop,
	studioRouteTop,
	dspRouteTop,
	adrRouteTop,
	audioPlanRouteTop,
	conversationRouteTop,
	compingRouteTop,
	automationRouteTop,
	noiseReductionRouteTop,
	audioEnhanceRouteTop,
	vocalIsolationRouteTop,
	spectrogramRouteTop,
	exportRouteTop,
	transcriptRouteTop,
	spatialRouteTop,
	musicGenRouteTop,
	diarizeRouteTop,
	videoRouteTop,
	downloadRouteTop,
	batchRouteTop,

	// Retired /workspace/* redirects → top-level canonical paths
	workspaceRedirectRoute,
	workspaceTimelineRedirectRoute,
	workspacePitchRedirectRoute,
	workspaceMixerRedirectRoute,
	workspaceEffectsRedirectRoute,
	workspaceStudioRedirectRoute,
	workspaceDspRedirectRoute,
	workspaceVoiceChangerRedirectRoute,
	workspaceAdrRedirectRoute,
	workspaceAudioPlanRedirectRoute,
	workspaceConversationRedirectRoute,
	workspaceCompingRedirectRoute,
	workspaceAutomationRedirectRoute,
	workspaceNoiseReductionRedirectRoute,
	workspaceAudioEnhanceRedirectRoute,
	workspaceVocalIsolationRedirectRoute,
	workspaceSpectrogramRedirectRoute,
	workspaceExportRedirectRoute,
	workspaceTranscriptRedirectRoute,
	workspaceSpatialRedirectRoute,
	workspaceMusicGenRedirectRoute,
	workspaceDiarizeRedirectRoute,
	workspaceVideoRedirectRoute,
	workspaceDownloadRedirectRoute,

	// Voice converter (top-level canonical)
	voiceChangerRoute,
	voiceConverterRoute,

	// Other top-level routes
	soundEffectsRoute,
	translateRoute,
	audioStudioRoute,
	helpRoute,
	liveTranscriptRoute,

	// Settings
	settingsRoute.addChildren([
		settingsGeneralRoute,
		settingsSchemaRoute,
		settingsGenerationRoute,
		settingsCapturesRoute,
		settingsMCPRoute,
		settingsGpuRoute,
		settingsSystemRoute,
		settingsLogsRoute,
		settingsAboutRoute,
		settingsShortcutsRoute,
		settingsTimecodeRoute,
		settingsScriptingRoute,
		settingsPluginsRoute,
		settingsLottieExportRoute,
		settingsTelemetryRoute,
		settingsPrivacyRoute,
		settingsApiKeysRoute,
		settingsWorkspaceRoute,
		settingsSupportRoute,
		stemSeparationRoute,
		settingsCloudModelsRoute,
	]),

	projectsRoute,
	communityPresetsRoute,
	serverRedirectRoute,
]);

// Create router
export const router = createRouter({ routeTree });

// Register router for type safety
declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
