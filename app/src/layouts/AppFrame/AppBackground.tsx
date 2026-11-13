import { memo, useEffect, useState } from "react";
import { useUIStore } from "@/stores/uiStore";

/**
 * Lazy-loaded theme image for the Stripe special theme only.
 * Plain themes are pure token themes (CSS gradients) — no JPGs.
 */
const THEME_IMAGE_IMPORTS: Record<string, () => Promise<{ default: string }>> =
	{
		stripe: () => import("@/assets/themes/stripe.jpg"),
	};

/**
 * Design system background — per-theme rendering:
 * - Global: the chosen pattern tile, coloured by --color-primary so it
 *   re-tints itself for whichever accent is active (see globalPattern.css).
 * - Plain themes (System/Light/Dark): solid grayscale tokens, CSS only.
 * - Stripe: B&W diagonal tile + image wash + noise overlay.
 * - Mesh: layered radial-gradient tile (no image needed).
 */
function AppBackgroundInner() {
	const theme = useUIStore((s) => s.theme);
	const backgroundPattern = useUIStore((s) => s.backgroundPattern);
	const [bgImage, setBgImage] = useState<string | null>(null);

	// Lazy-load the background image when the stripe theme is active
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

	const isStripe = theme === "stripe";

	return (
		<div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
			{/* Special-theme image wash — low opacity, never covers text */}
			{bgImage && (
				<div
					className="absolute inset-0 opacity-[0.08]"
					style={{
						backgroundImage: `url(${bgImage})`,
						backgroundSize: "cover",
						backgroundPosition: "center",
					}}
				/>
			)}

			{/* Stripe noise overlay */}
			{isStripe && <div className="gs-stripe-noise" />}

			{/* Global pattern — rendered last so it paints above per-theme
			    washes. Accent-coloured via mask or layered gradients. */}
			{backgroundPattern === "mesh" ? (
				<div className="gs-theme-pattern gs-theme-pattern--mesh" />
			) : backgroundPattern === "waveform" ? (
				<div className="gs-theme-pattern gs-theme-pattern--waveform" />
			) : backgroundPattern === "line-in-motion" ? (
				<div className="gs-theme-pattern" />
			) : null}
		</div>
	);
}

// Memoize so parent re-renders don't re-render the background.
export const AppBackground = memo(AppBackgroundInner);
