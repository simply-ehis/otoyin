import {
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	redirect,
	useLocation,
} from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { AppFrame } from "@/components/AppFrame/AppFrame";
import { AnnouncementBanner } from "@/components/Banner/AnnouncementBanner";
import { ServerStatusBanner } from "@/components/Banner/ServerStatusBanner";
import { ErrorBoundary } from "@/components/ErrorBoundary/ErrorBoundary";
import { RecommendedModelsBanner } from "@/components/RecommendedModelsBanner/RecommendedModelsBanner";
import { AppLoadingScreen } from "@/components/ui/AppLoadingScreen";
import { Toaster } from "@/components/ui/toaster";
import { TabIntroMount } from "@/features/onboarding/TabIntro";
import { AutoUpdateFlow } from "@/features/settings/AutoUpdateFlow";

const MiniGame = lazy(() =>
	import("@/features/game/GameModal").then((m) => ({
		default: m.GameModal,
	})),
);
const GenerationGameNudge = lazy(() =>
	import("@/features/game/GameNudge").then((m) => ({
		default: m.GameNudge,
	})),
);

import { useAssistantCommands } from "@/lib/assistantCommands";
import { useGenerationProgress } from "@/lib/hooks/useGenerationProgress";
import { useModelDownloadToast } from "@/lib/hooks/useModelDownloadToast";
import {
	MODEL_DISPLAY_NAMES,
	useRestoreActiveTasks,
} from "@/lib/hooks/useRestoreActiveTasks";
import { useGenerationStore } from "@/stores/generationStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useUIStore } from "@/stores/uiStore";

// Lazy-load Sidebar — large component with heroicons, only visible on desktop
const Sidebar = lazy(() =>
	import("@/components/Sidebar").then((m) => ({
		default: m.Sidebar,
	})),
);

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
const SettingsLayout = lazy(() =>
	import("@/features/settings/SettingsLayout").then((m) => ({
		default: m.SettingsLayout,
	})),
);
const StoriesTab = lazy(() =>
	import("@/features/stories/StoriesTab").then((m) => ({
		default: m.StoriesTab,
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
const AudiobooksTab = lazy(() =>
	import("@/features/audiobooks/AudiobooksTab").then((m) => ({
		default: m.AudiobooksTab,
	})),
);
const VoicesTab = lazy(() =>
	import("@/features/voices/VoicesTab").then((m) => ({
		default: m.VoicesTab,
	})),
);
const WorkspaceLayout = lazy(() =>
	import("@/components/Workspace/WorkspaceLayout").then((m) => ({
		default: m.WorkspaceLayout,
	})),
);
const TimelineView = lazy(() =>
	import("@/components/Workspace/TimelineView").then((m) => ({
		default: m.TimelineView,
	})),
);
const WorkspaceLanding = lazy(() =>
	import("@/components/Workspace/WorkspaceLanding").then((m) => ({
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
const VoiceChangerView = lazy(() =>
	import("@/features/workspace/VoiceChangerView").then((m) => ({
		default: m.VoiceChangerView,
	})),
);
const NoiseReductionView = lazy(() =>
	import("@/features/workspace/NoiseReductionView").then((m) => ({
		default: m.NoiseReductionView,
	})),
);
const ConversationView = lazy(() =>
	import("@/features/workspace/ConversationView").then((m) => ({
		default: m.ConversationView,
	})),
);
const PlatformExportView = lazy(() =>
	import("@/features/workspace/PlatformExportView").then((m) => ({
		default: m.PlatformExportView,
	})),
);
const TranscriptEditView = lazy(() =>
	import("@/features/workspace/TranscriptEditView").then((m) => ({
		default: m.TranscriptEditView,
	})),
);
const SpatialView = lazy(() =>
	import("@/features/workspace/SpatialView").then((m) => ({
		default: m.SpatialView,
	})),
);
const VoiceConverterView = lazy(() =>
	import("@/features/workspace/VoiceConverterView").then((m) => ({
		default: m.VoiceConverterView,
	})),
);
const SoundEffectsView = lazy(() =>
	import("@/features/workspace/SoundEffectsView").then((m) => ({
		default: m.SoundEffectsView,
	})),
);
const AudioEnhanceView = lazy(() =>
	import("@/features/workspace/AudioEnhanceView").then((m) => ({
		default: m.AudioEnhanceView,
	})),
);
const VocalIsolationView = lazy(() =>
	import("@/features/workspace/VocalIsolationView").then((m) => ({
		default: m.VocalIsolationView,
	})),
);
const AutomationView = lazy(() =>
	import("@/features/workspace/AutomationView").then((m) => ({
		default: m.AutomationView,
	})),
);
const MultiTakeCompingView = lazy(() =>
	import("@/features/workspace/MultiTakeCompingView").then((m) => ({
		default: m.MultiTakeCompingView,
	})),
);
const LiveTranscriptView = lazy(() =>
	import("@/features/workspace/LiveTranscriptView").then((m) => ({
		default: m.LiveTranscriptView,
	})),
);
const DiarizationView = lazy(() =>
	import("@/features/workspace/DiarizationView").then((m) => ({
		default: m.DiarizationView,
	})),
);
const StandaloneProjectPage = lazy(() =>
	import("@/features/content/StandaloneProjectPage").then((m) => ({
		default: m.StandaloneProjectPage,
	})),
);
const CommunityPresetsPage = lazy(() =>
	import("@/features/content/CommunityPresetsPage").then((m) => ({
		default: m.CommunityPresetsPage,
	})),
);
const ShortcutsPage = lazy(() =>
	import("@/features/settings/ShortcutsPage").then((m) => ({
		default: m.ShortcutsPage,
	})),
);
const HelpPage = lazy(() =>
	import("@/features/help/HelpPage").then((m) => ({
		default: m.HelpPage,
	})),
);
const TimecodeDisplay = lazy(() =>
	import("@/features/settings/TimecodePage").then((m) => ({
		default: m.TimecodeDisplay,
	})),
);
const SpectrogramView = lazy(() =>
	import("@/features/workspace/SpectrogramView").then((m) => ({
		default: m.SpectrogramView,
	})),
);
const ScriptingPage = lazy(() =>
	import("@/features/settings/ScriptingPage").then((m) => ({
		default: m.ScriptingPage,
	})),
);
const PluginsPage = lazy(() =>
	import("@/features/settings/PluginsPage").then((m) => ({
		default: m.PluginsPage,
	})),
);
const LottieExportPage = lazy(() =>
	import("@/features/settings/LottieExportPage").then((m) => ({
		default: m.LottieExportPage,
	})),
);
const TelemetryPage = lazy(() =>
	import("@/features/settings/TelemetryPage").then((m) => ({
		default: m.TelemetryPage,
	})),
);
const ApiKeysPage = lazy(() =>
	import("@/features/settings/ApiKeysPage").then((m) => ({
		default: m.ApiKeysPage,
	})),
);
const VideoPreviewView = lazy(() =>
	import("@/features/workspace/VideoPreviewView").then((m) => ({
		default: m.VideoPreviewView,
	})),
);
const YouTubeDownloadView = lazy(() =>
	import("@/features/workspace/YouTubeDownloadView").then((m) => ({
		default: m.YouTubeDownloadView,
	})),
);

const DubbingTab = lazy(() =>
	import("@/features/dubbing/DubbingTab").then((m) => ({
		default: m.DubbingTab,
	})),
);
const WhatsNewPage = lazy(() =>
	import("@/features/content/WhatsNewPage").then((m) => ({
		default: m.WhatsNewPage,
	})),
);
const OffersPage = lazy(() =>
	import("@/features/content/OffersPage").then((m) => ({
		default: m.OffersPage,
	})),
);
const StorePage = lazy(() =>
	import("@/features/store/StorePage").then((m) => ({
		default: m.StorePage,
	})),
);
const LibraryTab = lazy(() =>
	import("@/features/library/LibraryTab").then((m) => ({
		default: m.LibraryTab,
	})),
);
const SupportPage = lazy(() =>
	import("@/features/settings/SupportPage").then((m) => ({
		default: m.SupportPage,
	})),
);
const ModelHealthPage = lazy(() =>
	import("@/features/settings/ModelHealthPage").then((m) => ({
		default: m.ModelHealthPage,
	})),
);

// Platform check that works in both web and Tauri
// navigator.platform is deprecated; prefer userAgentData with fallback
function getIsMacOS(): boolean {
	if (typeof navigator === "undefined") {
		return false;
	}
	// Modern API
	if ("userAgentData" in navigator) {
		const uaData = (navigator as { userAgentData?: { platform?: string } })
			.userAgentData;
		return uaData?.platform?.toLowerCase().includes("mac") ?? false;
	}
	// Fallback for older browsers
	return navigator.platform?.toLowerCase().includes("mac") ?? false;
}

function useIsMacOS(): boolean {
	const [isMac, setIsMac] = useState(getIsMacOS);
	useEffect(() => {
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		// Re-check on any media change (covers platform changes in Tauri)
		const handler = () => setIsMac(getIsMacOS());
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}, []);
	return isMac;
}

// Root layout component
function RootLayout() {
	const isMacOS = useIsMacOS();
	// Monitor active downloads/generations and show toasts for them
	const activeDownloads = useRestoreActiveTasks();

	// Subscribe to SSE for pending generations — handles completion, auto-play, and history refresh
	useGenerationProgress();

	// Handle lower-risk assistant UI commands (navigation, Audio Studio, store setters)
	useAssistantCommands();

	// Pause global audio player on route change
	const location = useLocation();
	const prevLocationRef = useRef(location.href);
	useEffect(() => {
		if (prevLocationRef.current !== location.href) {
			prevLocationRef.current = location.href;
			const { isPlaying, setIsPlaying } = usePlayerStore.getState();
			if (isPlaying) {
				setIsPlaying(false);
			}
		}
	}, [location.href]);

	const isGenerating = useGenerationStore((s) => s.isGenerating);
	const miniGameOpen = useUIStore((s) => s.miniGameOpen);
	const setMiniGameOpen = useUIStore((s) => s.setMiniGameOpen);

	return (
		<AppFrame>
			<div className="flex flex-1 min-h-0 overflow-hidden">
				<Suspense fallback={<div className="w-16 bg-secondary shrink-0" />}>
					<Sidebar isMacOS={isMacOS} />
				</Suspense>

				<main className="flex-1 overflow-hidden flex flex-col min-w-0">
					<RecommendedModelsBanner />
					<AnnouncementBanner />
					<ServerStatusBanner />
					<TabIntroMount />
					<div className="container mx-auto px-8 max-w-[1800px] h-full overflow-hidden flex flex-col">
						<Suspense fallback={<AppLoadingScreen />}>
							<ErrorBoundary>
								<Outlet />
							</ErrorBoundary>
						</Suspense>
					</div>
				</main>
			</div>

			{/* Show download toasts for any active downloads (from anywhere) */}
			{activeDownloads.map((download) => {
				const displayName =
					MODEL_DISPLAY_NAMES[download.model_name] || download.model_name;
				return (
					<DownloadToastRestorer
						key={download.model_name}
						modelName={download.model_name}
						displayName={displayName}
					/>
				);
			})}

			{/* Mini-game: manual via sidebar + popup when generating */}
			{isGenerating && !miniGameOpen && (
				<div className="relative z-40 float-right mr-4 mb-4">
					<Suspense>
						<GenerationGameNudge onOpen={() => setMiniGameOpen(true)} />
					</Suspense>
				</div>
			)}
			<Suspense>
				<MiniGame />
			</Suspense>
			<AutoUpdateFlow />
			<Toaster />
		</AppFrame>
	);
}

/**
 * Component that restores a download toast for a specific model.
 */
function DownloadToastRestorer({
	modelName,
	displayName,
}: {
	modelName: string;
	displayName: string;
}) {
	// Use the download toast hook to restore the toast
	useModelDownloadToast({
		modelName,
		displayName,
		enabled: true,
	});

	return null;
}

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
	component: StoriesTab,
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
	component: VoicesTab,
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

const settingsApiKeysRoute = createRoute({
	getParentRoute: () => settingsRoute,
	path: "/api-keys",
	component: ApiKeysPage,
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
	component: DubbingTab,
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

const instrumentsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/instruments",
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
	component: NoiseReductionView,
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
	component: SpectrogramView,
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
	component: LiveTranscriptView,
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
	component: VoiceChangerView,
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
	instrumentsRoute,
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
		settingsApiKeysRoute,
		settingsSupportRoute,
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
