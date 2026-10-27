import {
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	redirect,
	useLocation,
} from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef } from "react";
import { GlobalDictationPill } from "@/features/capture/GlobalDictationPill";
import { TabIntroMount } from "@/features/onboarding/TabIntro";
import { AutoUpdateFlow } from "@/features/settings/AutoUpdateFlow";
import { AppFrame } from "@/layouts/AppFrame/AppFrame";
import { TopBanners } from "@/layouts/Banner/TopBanners";
import { ErrorBoundary } from "@/layouts/ErrorBoundary/ErrorBoundary";
import { AppLoadingScreen } from "@/ui/AppLoadingScreen";
import { Toaster } from "@/ui/toaster";

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

import { isTauri } from "@tauri-apps/api/core";
import { useAssistantCommands } from "@/lib/assistantCommands";
import { useBackendRestart } from "@/lib/hooks/useBackendRestart";
import { useBootReadiness } from "@/lib/hooks/useBootReadiness";
import { useGenerationProgress } from "@/lib/hooks/useGenerationProgress";
import { useModelDownloadToast } from "@/lib/hooks/useModelDownloadToast";
import {
	MODEL_DISPLAY_NAMES,
	useRestoreActiveTasks,
} from "@/lib/hooks/useRestoreActiveTasks";
import { usePlatform } from "@/platform/PlatformContext";
import { useGenerationStore } from "@/stores/generationStore";
import { usePlayerStore } from "@/stores/playerStore";
import { useServerStore } from "@/stores/serverStore";
import { useUIStore } from "@/stores/uiStore";
import { Button } from "@/ui/button";

// Lazy-load Sidebar — large component with heroicons, only visible on desktop
const Sidebar = lazy(() =>
	import("@/layouts/Sidebar").then((m) => ({
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
const TranslateView = lazy(() =>
	import("@/features/translate/TranslateView").then((m) => ({
		default: m.TranslateView,
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
const MusicGenView = lazy(() =>
	import("@/features/workspace/MusicGenView").then((m) => ({
		default: m.MusicGenView,
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
const PrivacyPage = lazy(() =>
	import("@/features/settings/PrivacyPage").then((m) => ({
		default: m.PrivacyPage,
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

const DubPage = lazy(() =>
	import("@/features/dubbing/DubPage").then((m) => ({
		default: m.DubPage,
	})),
);
const StoryEditor = lazy(() =>
	import("@/features/stories/StoryEditor").then((m) => ({
		default: m.StoryEditor,
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
const StemSeparationPage = lazy(() =>
	import("@/features/stems/StemSeparationPage").then((m) => ({
		default: m.StemSeparationPage,
	})),
);
const CloudModelsPage = lazy(() =>
	import("@/features/settings/CloudModelsPage").then((m) => ({
		default: m.CloudModelsPage,
	})),
);
const ModelHealthPage = lazy(() =>
	import("@/features/settings/ModelHealthPage").then((m) => ({
		default: m.ModelHealthPage,
	})),
);

// Platform check that works in both web and Tauri
// navigator.platform is deprecated; prefer userAgentData with fallback

function RootLayout() {
	// Monitor active downloads/generations and show toasts for them
	const activeDownloads = useRestoreActiveTasks();

	// Subscribe to SSE for pending generations — handles completion, auto-play, and history refresh
	useGenerationProgress();

	// Handle lower-risk assistant UI commands (navigation, Audio Studio, store setters)
	useAssistantCommands();

	// Boot handshake: in the desktop app the Rust side may have spawned the
	// backend on a fallback port (busy-port squat) or adopted an existing
	// one — adopt whatever URL it reports instead of assuming :17493.
	// Idempotent: start_server is a no-op when already running. Skipped in
	// remote mode (never touch the user's remote address) and on web.
	const { startServer } = usePlatform().lifecycle;
	useEffect(() => {
		if (!isTauri()) {
			return;
		}
		const { mode, customModelsDir } = useServerStore.getState();
		if (mode !== "local") {
			return;
		}
		let cancelled = false;
		void (async () => {
			try {
				const url = await startServer(false, customModelsDir, null);
				if (
					!cancelled &&
					typeof url === "string" &&
					url.startsWith("http") &&
					url !== useServerStore.getState().serverUrl
				) {
					useServerStore.getState().setServerUrl(url);
				}
			} catch {
				// Keep the default URL; the status banner surfaces backend state.
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [startServer]);

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
	const serverUrl = useServerStore((s) => s.serverUrl);
	const serverMode = useServerStore((s) => s.mode);
	const boot = useBootReadiness(serverUrl);
	const { phase: restartPhase, restart: restartBackend } = useBackendRestart();
	const bootLabel =
		boot.status === "startup_failed"
			? "Backend failed to start"
			: boot.status === "initializing"
				? `Starting backend… ${boot.elapsed}s`
				: boot.elapsed > 30
					? `Waiting for backend… ${boot.elapsed}s (first launch loads models — this takes a while)`
					: `Waiting for backend… ${boot.elapsed}s`;

	return (
		<AppFrame>
			<div className="flex flex-1 min-h-0 overflow-hidden">
				<Suspense fallback={<div className="w-14 bg-secondary shrink-0" />}>
					<ErrorBoundary
						fallback={() => <div className="w-14 bg-secondary shrink-0" />}
					>
						<Sidebar />
					</ErrorBoundary>
				</Suspense>

				<main className="flex-1 overflow-hidden flex flex-col min-w-0">
					{/* Single priority strip — replaces three stacked banners that
					    each added mt-3 + full padding under the header. */}
					<ErrorBoundary fallback={() => null}>
						<TopBanners />
					</ErrorBoundary>
					<ErrorBoundary fallback={() => null}>
						<TabIntroMount />
					</ErrorBoundary>
					<div className="container mx-auto px-4 max-w-[1800px] h-full overflow-hidden flex flex-col">
						{!boot.ready && boot.status !== "startup_failed" && (
							<output className="py-1 text-center text-xs text-muted-foreground">
								{bootLabel}
							</output>
						)}
						{boot.status === "startup_failed" ? (
							<div className="flex flex-1 flex-col items-center justify-center gap-4">
								<div className="flex max-w-md flex-col items-center gap-2 text-center">
									<p className="text-sm text-destructive">
										{boot.error ?? "The backend reported a startup failure."}
									</p>
									{serverMode === "local" && (
										<Button
											size="sm"
											disabled={restartPhase !== "idle"}
											onClick={() => void restartBackend()}
											title="Restart the backend process"
										>
											{restartPhase === "idle"
												? "Restart backend"
												: "Restarting…"}
										</Button>
									)}
								</div>
							</div>
						) : (
							<Suspense fallback={<AppLoadingScreen />}>
								<ErrorBoundary>
									<Outlet />
								</ErrorBoundary>
							</Suspense>
						)}
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

			{/* Mini-game: manual via sidebar + popup when generating.
			    Both are behind an explicit condition — `MiniGame` used to render
			    unconditionally, which fired its dynamic import (and with it the
			    ~350 KB framer-motion runtime) on every cold start. */}
			{isGenerating && !miniGameOpen && (
				<div className="relative z-40 float-right mr-4 mb-4">
					<Suspense>
						<ErrorBoundary fallback={() => null}>
							<GenerationGameNudge onOpen={() => setMiniGameOpen(true)} />
						</ErrorBoundary>
					</Suspense>
				</div>
			)}
			{miniGameOpen && (
				<Suspense>
					<ErrorBoundary fallback={() => null}>
						<MiniGame />
					</ErrorBoundary>
				</Suspense>
			)}
			<ErrorBoundary fallback={() => null}>
				<AutoUpdateFlow />
			</ErrorBoundary>
			<Toaster />
			<GlobalDictationPill />
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
