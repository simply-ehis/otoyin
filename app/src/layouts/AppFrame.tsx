import { useEffect, useState } from "react";
import { TooltipProvider } from "@/ui/tooltip";
import { applyThemeAccent } from "@/lib/design-system";
import { TOP_SAFE_AREA_PADDING } from "@/lib/constants/ui";
import { useServerErrorToast } from "@/lib/hooks/useServerErrorToast";
import { cn } from "@/lib/utils/cn";
import { usePlayerStore } from "@/stores/playerStore";
import { useUIStore } from "@/stores/uiStore";
import { TitleBar } from "./TitleBar";

/**
 * App shell: theme sync, tooltip timing, title bar, global shortcuts,
 * content row, optional docked aside + bottom player bar.
 *
 * Help-center / command-palette dialogs dock in via props when their
 * features land; F1 / Ctrl+K stay dormant until then (never a dead key
 * that opens a missing panel).
 */
export function AppFrame({
	children,
	titleBarActions,
	aside,
	bottomBar,
	renderHelp,
	renderPalette,
}: {
	children: React.ReactNode;
	titleBarActions?: React.ReactNode;
	aside?: React.ReactNode;
	bottomBar?: React.ReactNode;
	renderHelp?: (props: { open: boolean; onClose: () => void }) => React.ReactNode;
	renderPalette?: (props: { open: boolean; onClose: () => void }) => React.ReactNode;
}) {
	useServerErrorToast();
	const theme = useUIStore((s) => s.theme);
	const [helpOpen, setHelpOpen] = useState(false);
	const [paletteOpen, setPaletteOpen] = useState(false);

	useEffect(() => {
		applyThemeAccent(theme);
	}, [theme]);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "F1" && !e.metaKey && !e.ctrlKey && renderHelp) {
				e.preventDefault();
				setHelpOpen(true);
			}
			if ((e.metaKey || e.ctrlKey) && e.key === "k" && renderPalette) {
				e.preventDefault();
				setPaletteOpen(true);
			}
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
					case " ":
						e.preventDefault();
						setIsPlaying(!isPlaying);
						break;
					case "ArrowRight":
						e.preventDefault();
						setCurrentTime(Math.min(duration, currentTime + (e.shiftKey ? 30 : 10)));
						break;
					case "ArrowLeft":
						e.preventDefault();
						setCurrentTime(Math.max(0, currentTime - (e.shiftKey ? 30 : 10)));
						break;
					case "ArrowUp":
						e.preventDefault();
						setVolume(Math.min(1, volume + 0.1));
						break;
					case "ArrowDown":
						e.preventDefault();
						setVolume(Math.max(0, volume - 0.1));
						break;
					case "m":
						if (!e.metaKey && !e.ctrlKey) {
							e.preventDefault();
							setIsMuted(!isMuted);
						}
						break;
				}
			}
		};
		const onOpenHelp = () => {
			if (renderHelp) {
				setHelpOpen(true);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("open-help-center", onOpenHelp);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("open-help-center", onOpenHelp);
		};
	}, [renderHelp, renderPalette]);

	useEffect(() => {
		try {
			localStorage.setItem("otoyin-tour-seen", "true");
		} catch {
			// Private mode — nothing to persist.
		}
	}, []);

	return (
		<TooltipProvider delayDuration={500}>
			<div
				className={cn(
					"flex h-screen flex-col overflow-hidden bg-background",
					TOP_SAFE_AREA_PADDING,
				)}
			>
				<TitleBar title="Otoyin" actions={titleBarActions} />
				<div className="flex min-h-0 flex-1 overflow-hidden">
					{children}
					{aside}
				</div>
				{bottomBar}
				{renderHelp ? renderHelp({ open: helpOpen, onClose: () => setHelpOpen(false) }) : null}
				{renderPalette ? renderPalette({ open: paletteOpen, onClose: () => setPaletteOpen(false) }) : null}
			</div>
		</TooltipProvider>
	);
}
