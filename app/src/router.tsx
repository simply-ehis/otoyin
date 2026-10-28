import {
	createRootRoute,
	createRoute,
	createRouter,
	redirect,
} from "@tanstack/react-router";
import { lazy } from "react";
import { RootLayout } from "@/layouts/RootLayout/RootLayout";

// Direct imports for page components referenced by createRoute (not lazy-loaded)
import { StorePage } from "@/features/store/StorePage";
import { LibraryTab } from "@/features/library/LibraryTab";
import { StoryEditor } from "@/features/stories/StoryEditor";
import { HelpPage } from "@/features/help/HelpPage";
import { DubPage } from "@/features/dubbing/DubPage";
import { SupportPage } from "@/features/settings/SupportPage";
import { CloudModelsPage } from "@/features/settings/CloudModelsPage";
import { ShortcutsPage } from "@/features/settings/ShortcutsPage";
import { ScriptingPage } from "@/features/settings/ScriptingPage";
import { PluginsPage } from "@/features/settings/PluginsPage";
import { LottieExportPage } from "@/features/settings/LottieExportPage";
import { TelemetryPage } from "@/features/settings/TelemetryPage";
import { PrivacyPage } from "@/features/settings/PrivacyPage";
import { ApiKeysPage } from "@/features/settings/ApiKeysPage";
import { ModelHealthPage } from "@/features/settings/ModelHealthPage";
import { TimecodeDisplay } from "@/features/settings/TimecodeDisplay";
import { AudioEnhanceView } from "@/features/workspace/AudioEnhanceView";
import { VocalIsolationView } from "@/features/workspace/VocalIsolationView";
import { ConversationView } from "@/features/workspace/ConversationView";
import { PlatformExportView } from "@/features/workspace/PlatformExportView";
import { TranscriptEditView } from "@/features/workspace/TranscriptEditView";
import { SpatialView } from "@/features/workspace/SpatialView";
import { MusicGenView } from "@/features/workspace/MusicGenView";
import { AutomationView } from "@/features/workspace/AutomationView";
import { MultiTakeCompingView } from "@/features/workspace/MultiTakeCompingView";
import { DiarizationView } from "@/features/workspace/DiarizationView";
import { VideoPreviewView } from "@/features/workspace/VideoPreviewView";
import { YouTubeDownloadView } from "@/features/workspace/YouTubeDownloadView";
import { VoiceConverterView } from "@/features/workspace/VoiceConverterView";
import { SoundEffectsView } from "@/features/workspace/SoundEffectsView";
import { TranslateView } from "@/features/translate/TranslateView";
import { StandaloneProjectPage } from "@/features/content/StandaloneProjectPage";
import { CommunityPresetsPage } from "@/features/content/CommunityPresetsPage";
import { WhatsNewPage } from "@/features/content/WhatsNewPage";
import { OffersPage } from "@/features/content/OffersPage";

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
const WorkspaceLayout = lazy(() =>
	import("@/features/workspace/WorkspaceLayout").then((m) => ({
		default: m.WorkspaceLayout,
	})),
);
const TimelineView = lazy(() =>
	import("@/features/workspace/TimelineView").then((m) => ({
		default: m.TimelineView,
	})),
);
const WorkspaceLanding = lazy(() =>
	import("@/features/workspace/WorkspaceLanding").then((m) => ({
		default: m.WorkspaceLanding,
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
const EffectsView = lazy(() =>
	import("@/features/effects/EffectsTab").then((m) => ({
		default: m.EffectsTab,
	})),
);
const StudioView = lazy(() =>
	import("@/features/workspace/StudioView").then((m) => ({
		default: m.StudioView,
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

// Workspace layout route (parent for workspace sub-views)
const workspaceRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/workspace",
	component: WorkspaceLayout,
});

// Workspace sub-routes
const workspaceIndexRoute = createRoute({
	getParentRoute: () => workspaceRoute,
	path: "/",
	component: WorkspaceLanding,
});

const timelineRoute = createRoute({
	getParentRoute: () => workspaceRoute,
	path: "/timeline",
	component: TimelineView,
});

const pitchMapRoute = createRoute({
	getParentRoute: () => workspaceRoute,
	path: "/pitch",
	component: PitchMapView,
});

const mixerRoute = createRoute({
	getParentRoute: () => workspaceRoute,
	path: "/mixer",
	component: MixerView,
});

const effectsRouteWs = createRoute({
	getParentRoute: () => workspaceRoute,
	path: "/effects",
	component: EffectsView,
});

const studioRoute = createRoute({
	getParentRoute: () => workspaceRoute,
	path: "/studio",
	component: StudioView,
});

const dspRoute = createRoute({
	getParentRoute: () => workspaceRoute,
	path: "/dsp",
	component: DspView,
});

const adrRoute = createRoute({
	getParentRoute: () => workspaceRoute,
	path: "/adr",
	validateSearch: (search: Record<string, unknown>): { session?: string } => ({
		session: typeof search.session === "string" ? search.session : undefined,
	}),
	component: ADRView,
});

const audioPlanRoute = createRoute({
	getParentRoute: () => workspaceRoute,
	path: "/audio-plan",
	component: AudioPlanView,
});

const batchRoute = createRoute({
	getParentRoute: () => workspaceRoute,
	path: "/batch",
	component: BatchQueueView,
});

const noiseReductionRoute = createRoute({
	getParentRoute: () => workspaceRoute,
	path: "/noise-reduction",
	beforeLoad: () => {
		throw redirect({ to: "/workspace/audio-enhance" });
	},
});

const audioEnhanceRoute = createRoute({
	getParentRoute: () => workspaceRoute,
	path: "/audio-enhance",
	component: AudioEnhanceView,
});

const _vocalIsolationRoute = createRoute({
	getParentRoute: () => workspaceRoute,
	path: "/vocal-isolation",
	component: VocalIsolationView,
});

const workspaceSpectrogramRoute = createRoute({
	getParentRoute: () => workspaceRoute,
	path: "/spectrogram",
	beforeLoad: () => {
		throw redirect({ to: "/workspace/pitch" });
	},
});

const conversationRoute = createRoute({
	getParentRoute: () => workspaceRoute,
	path: "/conversation",
	component: ConversationView,
});

const platformExportRoute = createRoute({
	getParentRoute: () => workspaceRoute,
	path: "/export",
	component: PlatformExportView,
});

const transcriptEditRoute = createRoute({
	getParentRoute: () => workspaceRoute,
	path: "/transcript",
	component: TranscriptEditView,
});

const spatialRoute = createRoute({
	getParentRoute: () => workspaceRoute,
	path: "/spatial",
	component: SpatialView,
});

const musicGenRoute = createRoute({
	getParentRoute: () => workspaceRoute,
	path: "/music-gen",
	component: MusicGenView,
});

const automationRoute = createRoute({
	getParentRoute: () => workspaceRoute,
	path: "/automation",
	component: AutomationView,
});

const multiTakeCompingRoute = createRoute({
	getParentRoute: () => workspaceRoute,
	path: "/comping",
	component: MultiTakeCompingView,
});

const liveTranscriptRoute = createRoute({
	getParentRoute: () => workspaceRoute,
	path: "/live-transcript",
	beforeLoad: () => {
		throw redirect({ to: "/workspace/transcript" });
	},
});

const diarizationRoute = createRoute({
	getParentRoute: () => workspaceRoute,
	path: "/diarize",
	component: DiarizationView,
});

// Video preview route (plays video audio on the shared bus + extract to studio)
const videoPreviewRoute = createRoute({
	getParentRoute: () => workspaceRoute,
	path: "/video",
	component: VideoPreviewView,
});

// YouTube / URL download route
const youtubeDownloadRoute = createRoute({
	getParentRoute: () => workspaceRoute,
	path: "/download",
	component: YouTubeDownloadView,
});

// Voice changer route (standalone, outside workspace tabs)
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
		throw redirect({ to: "/workspace/vocal-isolation" });
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

// Route tree
const routeTree = rootRoute.addChildren([
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
	workspaceRoute.addChildren([
		workspaceIndexRoute,
		timelineRoute,
		pitchMapRoute,
		mixerRoute,
		effectsRouteWs,
		studioRoute,
		dspRoute,
		adrRoute,
		audioPlanRoute,
		batchRoute,
		noiseReductionRoute,
		audioEnhanceRoute,
		_vocalIsolationRoute,
		workspaceSpectrogramRoute,
		conversationRoute,
		platformExportRoute,
		transcriptEditRoute,
		spatialRoute,
		musicGenRoute,
		automationRoute,
		multiTakeCompingRoute,
		liveTranscriptRoute,
		diarizationRoute,
		videoPreviewRoute,
		youtubeDownloadRoute,
	]),
	voiceChangerRoute,
	voiceConverterRoute,
	soundEffectsRoute,
	translateRoute,
	audioStudioRoute,
	helpRoute,
	settingsRoute.addChildren([
		settingsGeneralRoute,
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
