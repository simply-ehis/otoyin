import { useRouterState } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { useThemeSync } from "@/hooks/useThemeSync";
import { AppBackground } from "@/layouts/AppFrame/AppBackground";
import { AppHeader } from "@/layouts/AppFrame/AppHeader";
import { BackendStatusBanner } from "@/layouts/AppFrame/BackendStatusBanner";
import { AudioKeepAlive } from "@/layouts/AudioPlayer/AudioKeepAlive";
import { ErrorBoundary } from "@/layouts/ErrorBoundary/ErrorBoundary";
import { TitleBarDragRegion } from "@/layouts/TitleBarDragRegion";
import { TOP_SAFE_AREA_PADDING } from "@/lib/constants/ui";
import { applyThemeAccent } from "@/lib/design-system";
import { useServerErrorToast } from "@/lib/hooks/useServerErrorToast";
import { useServerLifecycle } from "@/lib/hooks/useServerLifecycle";
import { useStory } from "@/lib/hooks/useStories";
import { cn } from "@/lib/utils/cn";
import { usePlayerStore } from "@/stores/playerStore";
import { useStoryStore } from "@/stores/storyStore";
import { useUIStore } from "@/stores/uiStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { TooltipProvider } from "@/ui/tooltip";

// Heavy overlays are fetched on first open, never during startup.
//
// `lazy(factory)` starts its dynamic import the moment the component renders.
// Every overlay below used to be mounted unconditionally (with `open={false}`
// so it could animate in), so each chunk was fetched during the first render.
// The Assistant panel alone drags in the whole assistant tree - markdown
// renderer, Prism grammars, dnd-kit - which measured ~600 KB of JS before
// first paint. `deferredComponent` memoises the loader and `WhenReady` keeps
// the component unmounted until it is actually wanted.
function deferredComponent<P>(
	loader: () => Promise<{ default: React.ComponentType<P> }>,
): () => Promise<{ default: React.ComponentType<P> }> {
	let promise: Promise<{ default: React.ComponentType<P> }> | null = null;
	return () => {
		promise ??= loader();
		return promise;
	};
}

type OverlayProps = { open: boolean; onClose: () => void };

const loadAssistantPanel = deferredComponent<OverlayProps>(() =>
	import("@/features/assistant/AssistantPanel").then((m) => ({
		default: m.AssistantPanel as React.ComponentType<OverlayProps>,
	})),
);
const loadAudioPlayer = deferredComponent<Record<string, never>>(() =>
	import("@/layouts/AudioPlayer/AudioPlayer").then((m) => ({
		default: m.AudioPlayer as unknown as React.ComponentType<
			Record<string, never>
		>,
	})),
);
const loadCommandPalette = deferredComponent<OverlayProps>(() =>
	import("@/features/help/CommandPalette").then((m) => ({
		default: m.CommandPalette as React.ComponentType<OverlayProps>,
	})),
);
const loadFeatureTour = deferredComponent<OverlayProps>(() =>
	import("@/features/help/FeatureTour").then((m) => ({
		default: m.FeatureTour as React.ComponentType<OverlayProps>,
	})),
);
const loadUseCaseWizard = deferredComponent<Record<string, never>>(() =>
	import("@/features/onboarding/UseCaseWizard").then((m) => ({
		default: m.UseCaseWizard as unknown as React.ComponentType<
			Record<string, never>
		>,
	})),
);
const loadHelpCenter = deferredComponent<OverlayProps>(() =>
	import("@/features/help/HelpCenterOverlay").then((m) => ({
		default: m.HelpCenter as React.ComponentType<OverlayProps>,
	})),
);
const loadStoryTrackEditor = deferredComponent<{
	storyId: string;
	items: unknown[];
}>(() =>
	import("@/features/stories/editor/StoryTrackEditor").then((m) => ({
		default: m.StoryTrackEditor as unknown as React.ComponentType<{
			storyId: string;
			items: unknown[];
		}>,
	})),
);

// Created here rather than at module scope so the dynamic import only starts
// when one of these is first rendered.
const LazyAssistantPanel = lazy(loadAssistantPanel);
const LazyAudioPlayer = lazy(loadAudioPlayer);
const LazyCommandPalette = lazy(loadCommandPalette);
const LazyFeatureTour = lazy(loadFeatureTour);
const LazyUseCaseWizard = lazy(loadUseCaseWizard);
const LazyHelpCenter = lazy(loadHelpCenter);
const LazyStoryTrackEditor = lazy(loadStoryTrackEditor);

/** Mount an overlay only once it is actually wanted. */
function WhenReady({
	ready,
	children,
}: {
	ready: boolean;
	children: React.ReactNode;
}) {
	if (!ready) {
		return null;
	}
	return <Suspense fallback={null}>{children}</Suspense>;
}

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

	// Dismiss the tour when the use-case wizard opens.
	//
	// Both are first-run modals and both auto-open. Stacked, they trap the
	// pointer: the outer dialog is `aria-modal` at z-50, so every click meant
	// for the sidebar hits the wizard instead and the app looks completely
	// unresponsive. Whichever closes first must also close the other.
	const wizardOpen = useWorkspaceStore((s) => !s.onboarded);
	useEffect(() => {
		if (wizardOpen) {
			setTourOpen(false);
		}
	}, [wizardOpen]);

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
					<WhenReady ready={assistantOpen}>
						<ErrorBoundary fallback={() => null}>
							<LazyAssistantPanel
								open={assistantOpen}
								onClose={() => setAssistantOpen(false)}
							/>
						</ErrorBoundary>
					</WhenReady>
				</div>

				{/* Help Center */}
				<WhenReady ready={helpOpen}>
					<ErrorBoundary fallback={() => null}>
						<LazyHelpCenter
							open={helpOpen}
							onClose={() => setHelpOpen(false)}
						/>
					</ErrorBoundary>
				</WhenReady>

				{/* Command Palette */}
				<WhenReady ready={commandPaletteOpen}>
					<ErrorBoundary fallback={() => null}>
						<LazyCommandPalette
							open={commandPaletteOpen}
							onClose={() => setCommandPaletteOpen(false)}
						/>
					</ErrorBoundary>
				</WhenReady>

				{/* First-run feature tour */}
				<WhenReady ready={tourOpen}>
					<ErrorBoundary fallback={() => null}>
						<LazyFeatureTour
							open={tourOpen}
							onClose={() => setTourOpen(false)}
						/>
					</ErrorBoundary>
				</WhenReady>

				{/* First-run use-case wizard. Self-gating internally, but still deferred so
				    its chunk is not in the startup graph. */}
				<ErrorBoundary fallback={() => null}>
					<LazyUseCaseWizard />
				</ErrorBoundary>

				<ErrorBoundary fallback={() => null}>
					{showTrackEditor ? (
						<WhenReady ready={story.items.length > 0}>
							<LazyStoryTrackEditor storyId={story.id} items={story.items} />
						</WhenReady>
					) : (
						<WhenReady ready>
							<LazyAudioPlayer />
						</WhenReady>
					)}
				</ErrorBoundary>
			</div>
		</TooltipProvider>
	);
}
