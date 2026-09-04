import { memo, useEffect, useRef, useState } from "react";
import { usePlayerStore } from "@/stores/playerStore";
import { useUIStore } from "@/stores/uiStore";

/**
 * Lazy-loaded theme background images. Using dynamic import() so these
 * 400 KB+ JPGs are only fetched when the theme is actually active,
 * keeping them out of the initial JS bundle.
 */
const THEME_IMAGE_IMPORTS: Record<string, () => Promise<{ default: string }>> =
	{
		stripe: () => import("@/assets/themes/stripe.jpg"),
		"coastal-light": () => import("@/assets/themes/coastal-light.jpg"),
		"mesh-dark": () => import("@/assets/themes/mesh-dark.jpg"),
	};

/**
 * Design system background � per-theme rendering:
 * - Plain themes: solid grayscale
 * - di-stefano: spatial gradient + wave + film grain + rose glow
 * - stripe: image bg + scan line
 * - coastal-light: image bg + floating particles
 * - mesh-dark: image bg + breathing glow
 */
function AppBackgroundInner() {
	const theme = useUIStore((s) => s.theme);
	const isPlaying = usePlayerStore((state) => state.isPlaying);
	const analyser = usePlayerStore((state) => state.masterAnalyser);
	const [glowOpacity, setGlowOpacity] = useState(0);
	const [bgImage, setBgImage] = useState<string | null>(null);
	const rafRef = useRef(0);

	// Lazy-load the background image when the theme changes
	useEffect(() => {
		const importer = THEME_IMAGE_IMPORTS[theme];
		if (!importer) {
			setBgImage(null);
			return;
		}
		let cancelled = false;
		importer().then((mod) => {
			if (!cancelled) {
				setBgImage(mod.default);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [theme]);

	// Audio-reactive glow
	useEffect(() => {
		if (!analyser || !isPlaying) {
			setGlowOpacity(0);
			return;
		}
		const dataArray = new Uint8Array(analyser.frequencyBinCount);
		const tick = () => {
			analyser.getByteFrequencyData(dataArray);
			let sum = 0;
			for (let i = 0; i < dataArray.length; i++) {
				sum += dataArray[i];
			}
			const avg = sum / dataArray.length / 255;
			setGlowOpacity(Math.min(avg * 2.5, 0.2));
			rafRef.current = requestAnimationFrame(tick);
		};
		rafRef.current = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(rafRef.current);
	}, [analyser, isPlaying]);

	const isDiStefano = theme === "di-stefano";
	const isStripe = theme === "stripe";
	const isCoastal = theme === "coastal-light";
	const isMesh = theme === "mesh-dark";

	// Audio-reactive glow color per theme
	const glowColor = isDiStefano
		? "radial-gradient(ellipse at 26% 20%, rgba(200,120,100,0.4), transparent 55%)"
		: isStripe
			? "radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.25), transparent 50%)"
			: isCoastal
				? "radial-gradient(ellipse at 40% 30%, rgba(232,131,106,0.3), transparent 55%)"
				: isMesh
					? "radial-gradient(ellipse at 30% 40%, rgba(160,168,180,0.25), transparent 55%)"
					: "none";

	return (
		<div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
			{/* Background image (special themes) � 0.08 opacity wash, never covers text */}
			{bgImage && (
				<div
					className="absolute inset-0 opacity-[0.08]"
					style={{
						backgroundImage: `url(${bgImage})`,
						backgroundSize: "cover",
						backgroundPosition: "center",
						backgroundAttachment: "fixed",
					}}
				/>
			)}
			{/* Dim overlay for text contrast � ensures background never washes out foreground */}
			{bgImage && <div className="absolute inset-0" />}

			{/* di-stefano spatial gradient */}
			{isDiStefano && (
				<div
					className="absolute inset-0"
					style={{
						background:
							"linear-gradient(to right, " +
							"hsl(0 0% calc(var(--gs-0) + var(--drift-offset, 0) * 1%)), " +
							"hsl(0 0% calc(var(--gs-7) + var(--drift-offset, 0) * 1%)), " +
							"hsl(0 0% calc(var(--gs-14) + var(--drift-offset, 0) * 1%)), " +
							"hsl(0 0% calc(var(--gs-21) + var(--drift-offset, 0) * 1%)), " +
							"hsl(0 0% calc(var(--gs-28) + var(--drift-offset, 0) * 1%)), " +
							"hsl(0 0% calc(var(--gs-35) + var(--drift-offset, 0) * 1%)), " +
							"hsl(0 0% calc(var(--gs-42) + var(--drift-offset, 0) * 1%)), " +
							"hsl(0 0% calc(var(--gs-49) + var(--drift-offset, 0) * 1%)))",
					}}
				/>
			)}

			{/* Stripe scan line */}
			{isStripe && <div className="gs-scan-line" />}

			{/* Coastal floating particles */}
			{isCoastal && (
				<div className="gs-particles">
					<div className="gs-particle" style={{ left: "5%" }} />
					<div className="gs-particle" />
					<div className="gs-particle" />
					<div className="gs-particle" />
					<div className="gs-particle" />
					<div className="gs-particle" />
					<div className="gs-particle" />
				</div>
			)}

			{/* Mesh breathing glow */}
			{isMesh && <div className="gs-mesh-glow" />}

			{/* Wave overlay (di-stefano) */}
			{isDiStefano && <div className="absolute inset-0 gs-wave-overlay" />}

			{/* Film grain (di-stefano) */}
			{isDiStefano && (
				<div
					className="absolute inset-0 opacity-[0.03] mix-blend-soft-light"
					style={{
						backgroundImage:
							"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
						backgroundRepeat: "repeat",
					}}
				/>
			)}

			{/* Audio-reactive glow (all special themes) */}
			{(isDiStefano || isStripe || isCoastal || isMesh) && (
				<div
					className="absolute inset-0 transition-opacity duration-300 ease-out pointer-events-none"
					style={{ opacity: glowOpacity, background: glowColor }}
				/>
			)}
		</div>
	);
}

// Memoize: subscribes to playerStore.isPlaying and masterAnalyser.
// Prevents re-renders from parent when player state unchanged.
export const AppBackground = memo(AppBackgroundInner);
