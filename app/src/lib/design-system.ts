/**
 * otoyin Design System — Grayscale utilities + per-theme token maps
 *
 * Implements the locked design spec:
 * - 50-step perceptually-spaced grayscale scale
 * - Threshold-based text contrast (midpoint = step 24/50)
 * - Beneath-based button contrast flip
 * - Session drift engine
 * - Per-theme semantic token overrides
 */

// ─── Grayscale Scale ───────────────────────────────────────────────

function generatePerceptualScale(): number[] {
	const min = 4;
	const max = 98;
	const count = 50;
	const gamma = 0.43;
	const steps: number[] = [];
	for (let i = 0; i < count; i++) {
		const t = i / (count - 1);
		const perceptual = t ** gamma;
		const lightness = Math.round(min + (max - min) * perceptual);
		const prev = i > 0 ? steps[i - 1] : min - 1;
		steps.push(Math.max(lightness, prev + (i < count - 1 ? 1 : 0)));
	}
	return steps;
}

export const GRAYSCALE_STEPS: readonly number[] = generatePerceptualScale();
export const SCALE_LENGTH = GRAYSCALE_STEPS.length;
export const MIDPOINT_INDEX = 24;
export const MIDPOINT_LIGHTNESS = GRAYSCALE_STEPS[MIDPOINT_INDEX];

// ─── Contrast Utilities ────────────────────────────────────────────

export function isLighterThanMidpoint(lightness: number): boolean {
	return lightness > MIDPOINT_LIGHTNESS;
}

export function getContrastColor(bgLightness: number): "black" | "white" {
	return isLighterThanMidpoint(bgLightness) ? "black" : "white";
}

export function getButtonColor(parentLightness: number): "black" | "white" {
	return parentLightness < MIDPOINT_LIGHTNESS ? "white" : "black";
}

export function lightnessToStep(lightness: number): number {
	let closest = 0;
	let minDiff = Infinity;
	for (let i = 0; i < SCALE_LENGTH; i++) {
		const diff = Math.abs(GRAYSCALE_STEPS[i] - lightness);
		if (diff < minDiff) {
			minDiff = diff;
			closest = i;
		}
	}
	return closest;
}

export function getStepHSL(step: number): string {
	const clamped = Math.max(0, Math.min(SCALE_LENGTH - 1, step));
	return `0 0% ${GRAYSCALE_STEPS[clamped]}%`;
}

// ─── Drift Engine ──────────────────────────────────────────────────

export const DRIFT_MAX_OFFSET = 8;
export const DRIFT_DURATION_MS = 2 * 60 * 60 * 1000;

export function calculateDriftOffset(
	elapsedMs: number,
	direction: "darker" | "lighter",
): { stepOffset: number; cssVar: string } {
	const progress = Math.min(elapsedMs / DRIFT_DURATION_MS, 1);
	const eased = progress * progress;
	const stepOffset = eased * DRIFT_MAX_OFFSET;
	return {
		stepOffset,
		cssVar: direction === "darker" ? `-${stepOffset}` : `${stepOffset}`,
	};
}

// ─── CSS Variable Helpers ──────────────────────────────────────────

const SEMANTIC_BASE_STEPS: Record<string, number> = {
	"--gs-bg": 6,
	"--gs-fg": 48,
	"--gs-card": 8,
	"--gs-card-fg": 47,
	"--gs-primary": 18,
	"--gs-primary-fg": 48,
	"--gs-secondary": 12,
	"--gs-secondary-fg": 47,
	"--gs-muted": 12,
	"--gs-muted-fg": 30,
	"--gs-accent": 18,
	"--gs-accent-fg": 48,
	"--gs-border": 12,
	"--gs-input": 12,
	"--gs-ring": 40,
	"--gs-sidebar": 4,
};

export function applyGrayscaleCSSVariables(): void {
	const root = document.documentElement;
	for (let i = 0; i < SCALE_LENGTH; i++) {
		root.style.setProperty(`--gs-${i}`, `${GRAYSCALE_STEPS[i]}%`);
	}
}

export function applyDriftOffset(offset: number): void {
	const root = document.documentElement;
	root.style.setProperty("--drift-offset", `${offset}`);
	for (const [varName, baseStep] of Object.entries(SEMANTIC_BASE_STEPS)) {
		const shifted = Math.max(
			0,
			Math.min(SCALE_LENGTH - 1, Math.round(baseStep + offset)),
		);
		root.style.setProperty(varName, `${GRAYSCALE_STEPS[shifted]}%`);
	}
}

// ─── Per-Theme Accent Colors ───────────────────────────────────────
// Applied as CSS custom properties on <html> by useThemeSync.

export interface ThemeAccentConfig {
	accent: string;
	accentFg: string;
	border: string;
	sidebar: string;
	card: string;
	cardFg: string;
	primary: string;
	primaryFg: string;
	muted: string;
	mutedFg: string;
	// Extended tokens for better visual depth
	surface: string;
	surfaceFg: string;
	surfaceElevated: string;
	surfaceElevatedFg: string;
	accentMuted: string;
	accentSubtle: string;
	/**
	 * Text colour for use on `accentMuted`. Solved per theme to clear WCAG AA
	 * (4.5:1) at the same hue and saturation as `accent`, so the active-nav
	 * pill stays in the rose family instead of dropping the brand colour or
	 * crushing the tint. Undefined means the accent already passes.
	 */
	accentInk?: string;
}

const THEME_ACCENTS: Record<string, ThemeAccentConfig> = {
	"di-stefano": {
		// Warm rose accent — Caravaggio-style single-source light
		accent: "15 65% 55%",
		accentFg: "0 0% 98%",
		border: "0 0% 18%",
		sidebar: "0 0% 3%",
		card: "0 0% 8%/0.92",
		cardFg: "0 0% 96%",
		primary: "15 65% 55%",
		primaryFg: "0 0% 98%",
		muted: "0 0% 16%",
		mutedFg: "0 0% 58%",
		// Extended tokens
		surface: "0 0% 6%",
		surfaceFg: "0 0% 94%",
		surfaceElevated: "0 0% 10%",
		surfaceElevatedFg: "0 0% 97%",
		accentMuted: "15 40% 25%",
		accentSubtle: "15 30% 15%",
		// accent-on-accentMuted was 3.06:1 (WCAG AA needs 4.5). Same hue and
		// saturation as the accent, lightened just enough to clear AA.
		accentInk: "15 65% 68%",
	},
	stripe: {
		// High-contrast B&W — diagonal scan lines, sharp
		accent: "0 0% 100%",
		accentFg: "0 0% 0%",
		border: "0 0% 100%/0.1",
		sidebar: "0 0% 2%",
		card: "0 0% 5%/0.9",
		cardFg: "0 0% 98%",
		primary: "0 0% 100%",
		primaryFg: "0 0% 0%",
		muted: "0 0% 10%",
		mutedFg: "0 0% 55%",
		// Extended tokens
		surface: "0 0% 3%",
		surfaceFg: "0 0% 98%",
		surfaceElevated: "0 0% 7%",
		surfaceElevatedFg: "0 0% 99%",
		accentMuted: "0 0% 20%",
		accentSubtle: "0 0% 8%",
		// White on 20% grey is already 12.63:1 — the accent needs no adjustment.
		accentInk: "0 0% 100%",
	},
	"coastal-light": {
		// Warm pastel — airy, coastal morning light
		accent: "14 75% 52%",
		accentFg: "0 0% 100%",
		border: "18 25% 78%",
		sidebar: "25 35% 96%",
		card: "0 0% 98%/0.9",
		cardFg: "0 0% 10%",
		primary: "14 75% 52%",
		primaryFg: "0 0% 100%",
		muted: "22 20% 88%",
		mutedFg: "0 0% 38%",
		// Extended tokens
		surface: "0 0% 99%",
		surfaceFg: "0 0% 8%",
		surfaceElevated: "0 0% 96%",
		surfaceElevatedFg: "0 0% 6%",
		accentMuted: "14 45% 85%",
		accentSubtle: "14 35% 92%",
		// accent-on-accentMuted was 2.62:1. Darkened along the same hue/sat
		// rather than crushing the light tint to black, which would have
		// destroyed the airy look this theme depends on.
		accentInk: "14 75% 36.8%",
	},
	"mesh-dark": {
		// Cool tech — perforated metal, cyan accent
		accent: "195 85% 55%",
		accentFg: "0 0% 0%",
		border: "210 15% 25%/0.2",
		sidebar: "215 20% 4%",
		card: "215 20% 6%/0.92",
		cardFg: "210 15% 94%",
		primary: "195 85% 55%",
		primaryFg: "0 0% 0%",
		muted: "215 15% 12%",
		mutedFg: "210 10% 52%",
		// Extended tokens
		surface: "215 20% 3%",
		surfaceFg: "210 15% 96%",
		surfaceElevated: "215 15% 8%",
		surfaceElevatedFg: "210 10% 98%",
		accentMuted: "195 50% 18%",
		accentSubtle: "195 40% 10%",
		// Cyan on 18% cyan is already 5.61:1 — the accent needs no adjustment.
		accentInk: "195 85% 55%",
	},
};

export function applyThemeAccent(theme: string): void {
	const root = document.documentElement;
	const config = THEME_ACCENTS[theme];
	if (!config) {
		// Plain themes — clear overrides, let grayscale defaults work
		root.style.removeProperty("--theme-accent");
		root.style.removeProperty("--theme-accent-fg");
		root.style.removeProperty("--theme-border");
		root.style.removeProperty("--theme-sidebar");
		root.style.removeProperty("--theme-card");
		root.style.removeProperty("--theme-card-fg");
		root.style.removeProperty("--theme-primary");
		root.style.removeProperty("--theme-primary-fg");
		root.style.removeProperty("--theme-muted");
		root.style.removeProperty("--theme-muted-fg");
		root.style.removeProperty("--theme-surface");
		root.style.removeProperty("--theme-surface-fg");
		root.style.removeProperty("--theme-surface-elevated");
		root.style.removeProperty("--theme-surface-elevated-fg");
		root.style.removeProperty("--theme-accent-muted");
		root.style.removeProperty("--theme-accent-subtle");
		return;
	}
	root.style.setProperty("--theme-accent", config.accent);
	root.style.setProperty("--theme-accent-fg", config.accentFg);
	root.style.setProperty("--theme-border", config.border);
	root.style.setProperty("--theme-sidebar", config.sidebar);
	root.style.setProperty("--theme-card", config.card);
	root.style.setProperty("--theme-card-fg", config.cardFg);
	root.style.setProperty("--theme-primary", config.primary);
	root.style.setProperty("--theme-primary-fg", config.primaryFg);
	root.style.setProperty("--theme-muted", config.muted);
	root.style.setProperty("--theme-muted-fg", config.mutedFg);
	// Extended tokens for visual depth
	root.style.setProperty("--theme-surface", config.surface);
	root.style.setProperty("--theme-surface-fg", config.surfaceFg);
	root.style.setProperty("--theme-surface-elevated", config.surfaceElevated);
	root.style.setProperty(
		"--theme-surface-elevated-fg",
		config.surfaceElevatedFg,
	);
	root.style.setProperty("--theme-accent-muted", config.accentMuted);
	// Ink only when the theme supplies one; otherwise the accent passes on its
	// own and --color-accent-ink keeps whatever @theme resolved.
	if (config.accentInk) {
		root.style.setProperty("--theme-accent-ink", config.accentInk);
	}
	root.style.setProperty("--theme-accent-subtle", config.accentSubtle);
}

/**
 * Override the accent hue for the current theme. `null` clears the override
 * and restores the theme's default accent.
 */
export function applyAccentHueOverride(hue: number | null): void {
	const root = document.documentElement;
	if (hue == null) {
		root.style.removeProperty("--color-accent");
		root.style.removeProperty("--color-primary");
		root.style.removeProperty("--color-ring");
		root.style.removeProperty("--theme-accent-muted");
		root.style.removeProperty("--theme-accent-ink");
		return;
	}
	const accent = `${hue} 65% 55%`;
	const primary = `${hue} 65% 55%`;
	const ring = `${hue} 65% 55%`;
	const accentMuted = `${hue} 40% 25%`;
	root.style.setProperty("--color-accent", `hsl(${accent})`);
	root.style.setProperty("--color-primary", `hsl(${primary})`);
	root.style.setProperty("--color-ring", `hsl(${ring})`);
	// Bare triplet: CSS consumes this as hsl(var(--theme-accent-muted)).
	root.style.setProperty("--theme-accent-muted", accentMuted);
}
