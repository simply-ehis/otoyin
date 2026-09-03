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

const MiniGame = lazy(() =>
	import("@/components/MiniGame/MiniGame").then((m) => ({
		default: m.MiniGame,
	})),
);
const GenerationGameNudge = lazy(() =>
	import("@/components/MiniGame/MiniGame").then((m) => ({
		default: m.GenerationGameNudge,
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
	import("@/components/CapturesTab/CapturesTab").then((m) => ({
		default: m.CapturesTab,
	})),
);
const EffectsTab = lazy(() =>
	import("@/components/EffectsTab/EffectsTab").then((m) => ({
		default: m.EffectsTab,
	})),
);
const MainEditor = lazy(() =>
	import("@/components/MainEditor/MainEditor").then((m) => ({
		default: m.MainEditor,
	})),
);
const _ModelsTab = lazy(() =>
	import("@/components/ModelsTab/ModelsTab").then((m) => ({
		default: m.ModelsTab,
	})),
);
void _ModelsTab;
const AudioStudio = lazy(() =>
	import("@/components/AudioStudio/AudioStudio").then((m) => ({
		default: m.AudioStudio,
	})),
);
const AboutPage = lazy(() =>
	import("@/components/ServerTab/AboutPage").then((m) => ({
		default: m.AboutPage,
	})),
);
const CapturesPage = lazy(() =>
	import("@/components/ServerTab/CapturesPage").then((m) => ({
		default: m.CapturesPage,
	})),
);
const GeneralPage = lazy(() =>
	import("@/components/ServerTab/GeneralPage").then((m) => ({
		default: m.GeneralPage,
	})),
);
const GenerationPage = lazy(() =>
	import("@/components/ServerTab/GenerationPage").then((m) => ({
		default: m.GenerationPage,
	})),
);
const GpuPage = lazy(() =>
	import("@/components/ServerTab/GpuPage").then((m) => ({
		default: m.GpuPage,
	})),
);
const LogsPage = lazy(() =>
	import("@/components/ServerTab/LogsPage").then((m) => ({
		default: m.LogsPage,
	})),
);
const MCPPage = lazy(() =>
	import("@/components/ServerTab/MCPPage").then((m) => ({
		default: m.MCPPage,
	})),
);
const SettingsLayout = lazy(() =>
	import("@/components/ServerTab/ServerTab").then((m) => ({
		default: m.SettingsLayout,
	})),
);
const StoriesTab = lazy(() =>
	import("@/components/StoriesTab/StoriesTab").then((m) => ({
		default: m.StoriesTab,
	})),
);
const AudiobooksTab = lazy(() =>
	import("@/components/Audiobooks/AudiobooksTab").then((m) => ({
		default: m.AudiobooksTab,
	})),
);
const VoicesTab = lazy(() =>
	import("@/components/VoicesTab/VoicesTab").then((m) => ({
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
	import("@/components/Workspace/PitchMapView").then((m) => ({
		default: m.PitchMapView,
	})),
);
const MixerView = lazy(() =>
	import("@/components/Workspace/MixerView").then((m) => ({
		default: m.MixerView,
	})),
);
const EffectsView = lazy(() =>
	import("@/components/Workspace/EffectsView").then((m) => ({
		default: m.EffectsView,
	})),
);
const StudioView = lazy(() =>
	import("@/components/Workspace/StudioView").then((m) => ({
		default: m.StudioView,
	})),
);
const DspView = lazy(() =>
	import("@/components/Workspace/DspView").then((m) => ({
		default: m.DspView,
	})),
);
const ADRView = lazy(() =>
	import("@/components/Workspace/ADRView").then((m) => ({
		default: m.ADRView,
	})),
);
const AudioPlanView = lazy(() =>
	import("@/components/Workspace/AudioPlanView").then((m) => ({
		default: m.AudioPlanView,
	})),
);
const BatchQueueView = lazy(() =>
	import("@/components/Workspace/BatchQueueView").then((m) => ({
		default: m.BatchQueueView,
	})),
);
const VoiceChangerView = lazy(() =>
	import("@/components/Workspace/VoiceChangerView").then((m) => ({
		default: m.VoiceChangerView,
	})),
);
const NoiseReductionView = lazy(() =>
	import("@/components/Workspace/NoiseReductionView").then((m) => ({
		default: m.NoiseReductionView,
	})),
);
const ConversationView = lazy(() =>
	import("@/components/Workspace/ConversationView").then((m) => ({
		default: m.ConversationView,
	})),
);
const PlatformExportView = lazy(() =>
	import("@/components/Workspace/PlatformExportView").then((m) => ({
		default: m.PlatformExportView,
	})),
);
const TranscriptEditView = lazy(
	() => import("@/components/Workspace/TranscriptEditView"),
);
const SpatialView = lazy(() =>
	import("@/components/Workspace/SpatialView").then((m) => ({
		default: m.SpatialView,
	})),
);
const VoiceConverterView = lazy(() =>
	import("@/components/Workspace/VoiceConverterView").then((m) => ({
		default: m.VoiceConverterView,
	})),
);
const SoundEffectsView = lazy(() =>
	import("@/components/Workspace/SoundEffectsView").then((m) => ({
		default: m.SoundEffectsView,
	})),
);
const AudioEnhanceView = lazy(() =>
	import("@/components/Workspace/AudioEnhanceView").then((m) => ({
		default: m.AudioEnhanceView,
	})),
);
const VocalIsolationView = lazy(() =>
	import("@/components/Workspace/VocalIsolationView").then((m) => ({
		default: m.VocalIsolationView,
	})),
);
const AutomationView = lazy(() =>
	import("@/components/Workspace/AutomationView").then((m) => ({
		default: m.AutomationView,
	})),
);
const MultiTakeCompingView = lazy(() =>
	import("@/components/Workspace/MultiTakeCompingView").then((m) => ({
		default: m.MultiTakeCompingView,
	})),
);
const LiveTranscriptView = lazy(() =>
	import("@/components/Workspace/LiveTranscriptView").then((m) => ({
		default: m.LiveTranscriptView,
	})),
);
const DiarizationView = lazy(() =>
	import("@/components/Workspace/DiarizationView").then((m) => ({
		default: m.DiarizationView,
	})),
);
const StandaloneProjectPage = lazy(() =>
	import("@/components/StandaloneProject/StandaloneProjectPage").then((m) => ({
		default: m.StandaloneProjectPage,
	})),
);
const CommunityPresetsPage = lazy(() =>
	import("@/components/CommunityPresets/CommunityPresetsPage").then((m) => ({
		default: m.CommunityPresetsPage,
	})),
);
const ShortcutsPage = lazy(() =>
	import("@/components/Shortcuts/ShortcutsPage").then((m) => ({
		default: m.ShortcutsPage,
	})),
);
const TimecodeDisplay = lazy(() =>
	import("@/components/TimecodeDisplay/TimecodeDisplay").then((m) => ({
		default: m.TimecodeDisplay,
	})),
);
const SpectrogramView = lazy(() =>
	import("@/components/Spectrogram/SpectrogramView").then((m) => ({
		default: m.SpectrogramView,
	})),
);
const ScriptingPage = lazy(() =>
	import("@/components/Scripting/ScriptingPage").then((m) => ({
		default: m.ScriptingPage,
	})),
);
const PluginsPage = lazy(() =>
	import("@/components/Plugins/PluginsPage").then((m) => ({
		default: m.PluginsPage,
	})),
);
const LottieExportPage = lazy(() =>
	import("@/components/LottieExport/LottieExportPage").then((m) => ({
		default: m.LottieExportPage,
	})),
);
const TelemetryPage = lazy(() =>
	import("@/components/Telemetry/TelemetryPage").then((m) => ({
		default: m.TelemetryPage,
	})),
);
const ApiKeysPage = lazy(() =>
	import("@/components/ServerTab/ApiKeysPage").then((m) => ({
		default: m.ApiKeysPage,
	})),
);
const VideoPreviewView = lazy(() =>
	import("@/components/Workspace/VideoPreviewView").then((m) => ({
		default: m.VideoPreviewView,
	})),
);
const YouTubeDownloadView = lazy(() =>
	import("@/components/Workspace/YouTubeDownloadView").then((m) => ({
		default: m.YouTubeDownloadView,
	})),
);

const DubbingTab = lazy(() =>
	import("@/components/DubbingTab/DubbingTab").then((m) => ({
		default: m.DubbingTab,
	})),
);
const WhatsNewPage = lazy(() =>
	import("@/components/WhatsNew/WhatsNewPage").then((m) => ({
		default: m.WhatsNewPage,
	})),
);
const OffersPage = lazy(() =>
	import("@/components/Offers/OffersPage").then((m) => ({
		default: m.OffersPage,
	})),
);
const StorePage = lazy(() =>
	import("@/components/Store/StorePage").then((m) => ({
		default: m.StorePage,
	})),
);
const LibraryTab = lazy(() =>
	import("@/components/Library/LibraryTab").then((m) => ({
		default: m.LibraryTab,
	})),
);
const SupportPage = lazy(() =>
	import("@/components/ServerTab/SupportPage").then((m) => ({
		default: m.SupportPage,
	})),
);
const ModelHealthPage = lazy(() =>
	import("@/components/ServerTab/ModelHealthPage").then((m) => ({
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
				<Suspense fallback={<div className="w-16 bg-muted/30 shrink-0" />}>
					<Sidebar isMacOS={isMacOS} />
				</Suspense>

				<main className="flex-1 overflow-hidden flex flex-col min-w-0">
					<RecommendedModelsBanner />
					<AnnouncementBanner />
					<ServerStatusBanner />
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
