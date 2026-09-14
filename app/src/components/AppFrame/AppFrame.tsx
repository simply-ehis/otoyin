import { useRouterState } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { AppBackground } from "@/components/AppFrame/AppBackground";
import { AppHeader } from "@/components/AppFrame/AppHeader";
import { BackendStatusBanner } from "@/components/AppFrame/BackendStatusBanner";
import { AudioKeepAlive } from "@/components/AudioPlayer/AudioKeepAlive";
import { ErrorBoundary } from "@/components/ErrorBoundary/ErrorBoundary";
import { TitleBarDragRegion } from "@/components/TitleBarDragRegion";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useThemeSync } from "@/hooks/useThemeSync";
import { TOP_SAFE_AREA_PADDING } from "@/lib/constants/ui";
import { applyThemeAccent } from "@/lib/design-system";
import { useServerErrorToast } from "@/lib/hooks/useServerErrorToast";
import { useServerLifecycle } from "@/lib/hooks/useServerLifecycle";
import { useStory } from "@/lib/hooks/useStories";
import { cn } from "@/lib/utils/cn";
import { usePlayerStore } from "@/stores/playerStore";
import { useStoryStore } from "@/stores/storyStore";
import { useUIStore } from "@/stores/uiStore";

// Lazy-load heavy overlay components — only rendered when opened
const AssistantPanel = lazy(() =>
	import("@/components/Assistant/AssistantPanel").then((m) => ({
		default: m.AssistantPanel,
	})),
);
const AudioPlayer = lazy(() =>
	import("@/components/AudioPlayer/AudioPlayer").then((m) => ({
		default: m.AudioPlayer,
	})),
);
const CommandPalette = lazy(() =>
	import("@/components/Help/CommandPalette").then((m) => ({
		default: m.CommandPalette,
	})),
);
const FeatureTour = lazy(() =>
	import("@/components/Help/FeatureTour").then((m) => ({
		default: m.FeatureTour,
	})),
);
const UseCaseWizard = lazy(() =>
	import("@/features/onboarding/UseCaseWizard").then((m) => ({
		default: m.UseCaseWizard,
	})),
);
const HelpCenter = lazy(() =>
	import("@/components/Help/HelpCenter").then((m) => ({
		default: m.HelpCenter,
	})),
);
const StoryTrackEditor = lazy(() =>
	import("@/components/StoriesTab/StoryTrackEditor").then((m) => ({
		default: m.StoryTrackEditor,
	})),
);

interface AppFrameProps {
	children: React.ReactNode;
}

export function AppFrame({ children }: AppFrameProps) {
	useServerErrorToast();
	useServerLifecycle();
	useThemeSync();
	const theme = useUIStore((s) => s.theme);

	useEffect(() => {
		applyThemeAccent(theme);
	}, [theme]);

	const [assistantOpen, setAssistantOpen] = useState(false);
	const [helpOpen, setHelpOpen] = useState(false);
	const [tourOpen, setTourOpen] = useState(false);
	const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
	const routerState = useRouterState();
	const isStoriesRoute = routerState.location.pathname === "/stories";
	// F1 opens Help Center, Ctrl+K opens Command Palette
	// Global media controls: Space=play/pause, Arrows=seek, Up/Down=volume, M=mute
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			// Help Center
			if (e.key === "F1" && !e.metaKey && !e.ctrlKey) {
				e.preventDefault();
				setHelpOpen(true);
			}
			// Command Palette
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				setCommandPaletteOpen(true);
			}

			// Global media controls (only when not typing in input/textarea)
			const target = e.target as HTMLElement;
			const isInput =
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable;
			if (!isInput) {
				const {
					isPlaying,
					setIsPlaying,
					currentTime,
					setCurrentTime,
					duration,
					volume,
					setVolume,
					isMuted,
					setIsMuted,
				} = usePlayerStore.getState();

				switch (e.key) {
					case " ": // Space - Play/Pause
						e.preventDefault();
						setIsPlaying(!isPlaying);
						break;
					case "ArrowRight": // Forward 10s
						e.preventDefault();
						setCurrentTime(
							Math.min(duration, currentTime + (e.shiftKey ? 30 : 10)),
						);
						break;
					case "ArrowLeft": // Rewind 10s
						e.preventDefault();
						setCurrentTime(Math.max(0, currentTime - (e.shiftKey ? 30 : 10)));
						break;
					case "ArrowUp": // Volume up
						e.preventDefault();
						setVolume(Math.min(1, volume + 0.1));
						break;
					case "ArrowDown": // Volume down
						e.preventDefault();
						setVolume(Math.max(0, volume - 0.1));
						break;
					case "m": // Mute toggle
						if (!e.metaKey && !e.ctrlKey) {
							e.preventDefault();
							setIsMuted(!isMuted);
						}
						break;
				}
			}
		};
		const onKeyUp = (e: KeyboardEvent) => {
			if (e.key === "?") {
				setTourOpen(true);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("keyup", onKeyUp);
		const onOpenHelp = () => setHelpOpen(true);
		window.addEventListener("open-help-center", onOpenHelp);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("keyup", onKeyUp);
			window.removeEventListener("open-help-center", onOpenHelp);
		};
	}, []);

	// First-run tour — opens automatically on first visit, or via ? key (qmark-ok: literal key)
	useEffect(() => {
		const seen = localStorage.getItem("Otoyin-tour-seen");
		if (!seen) {
			setTourOpen(true);
			localStorage.setItem("Otoyin-tour-seen", "true");
		}
	}, []);

	const selectedStoryId = useStoryStore((state) => state.selectedStoryId);
	const { data: story } = useStory(selectedStoryId);

	const showTrackEditor =
		isStoriesRoute && selectedStoryId && story && story.items.length > 0;

	return (
		<TooltipProvider delayDuration={500} skipDelayDuration={300}>
			<div
				className={cn(
					"h-screen bg-background flex flex-col overflow-hidden",
					TOP_SAFE_AREA_PADDING,
				)}
			>
				<TitleBarDragRegion />
				<AudioKeepAlive />
				<BackendStatusBanner />
				<AppBackground />

				<AppHeader
					assistantOpen={assistantOpen}
					onToggleAssistant={() => setAssistantOpen(!assistantOpen)}
					onOpenHelp={() => setHelpOpen(true)}
				/>

				{/* Main layout: sidebar + content + assistant panel */}
				<div className="flex flex-1 min-h-0 overflow-hidden">
					{children}

					{/* Assistant slide-in panel */}
					<Suspense fallback={null}>
						<ErrorBoundary fallback={() => null}>
							<AssistantPanel
								open={assistantOpen}
								onClose={() => setAssistantOpen(false)}
							/>
						</ErrorBoundary>
					</Suspense>
				</div>

				{/* Help Center */}
				<Suspense fallback={null}>
					<ErrorBoundary fallback={() => null}>
						<HelpCenter open={helpOpen} onClose={() => setHelpOpen(false)} />
					</ErrorBoundary>
				</Suspense>

				{/* Command Palette */}
				<Suspense fallback={null}>
					<ErrorBoundary fallback={() => null}>
						<CommandPalette
							open={commandPaletteOpen}
							onClose={() => setCommandPaletteOpen(false)}
						/>
					</ErrorBoundary>
				</Suspense>

				{/* First-run feature tour */}
				<Suspense fallback={null}>
					<ErrorBoundary fallback={() => null}>
						<FeatureTour open={tourOpen} onClose={() => setTourOpen(false)} />
					</ErrorBoundary>
				</Suspense>

				{/* First-run use-case wizard */}
				<Suspense fallback={null}>
					<ErrorBoundary fallback={() => null}>
						<UseCaseWizard />
					</ErrorBoundary>
				</Suspense>

				<Suspense fallback={null}>
					<ErrorBoundary fallback={() => null}>
						{showTrackEditor ? (
							<StoryTrackEditor storyId={story.id} items={story.items} />
						) : (
							<AudioPlayer />
						)}
					</ErrorBoundary>
				</Suspense>
			</div>
		</TooltipProvider>
	);
}
