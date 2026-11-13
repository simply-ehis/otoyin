/**
 * otoyin Design System — per-theme token maps and accent presets.
 *
 * Grayscale scale lives in `tokens.css` as static `--gs-*` custom properties;
 * no runtime grayscale computation exists here.
 */

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
 * Accent presets — soft tones, not saturated primaries. Shift the app's
 * accent everywhere by setting the CSS custom properties on <html>.
 * Default is rose (the original brand accent).
 */
interface AccentPreset {
	id: string;
	label: string;
	/** Bare HSL triplet, shadcn convention ("348 68% 58%"). */
	hsl: string;
	/** Text to use on a solid accent swatch. */
	fg: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
	{ id: "rose", label: "Rose", hsl: "348 68% 58%", fg: "0 0% 98%" },
	{ id: "coral", label: "Coral", hsl: "12 75% 56%", fg: "0 0% 98%" },
	{ id: "amber", label: "Amber", hsl: "38 85% 55%", fg: "0 0% 12%" },
	{ id: "blue", label: "Blue", hsl: "217 75% 60%", fg: "0 0% 98%" },
	{ id: "teal", label: "Teal", hsl: "188 65% 48%", fg: "0 0% 12%" },
	{ id: "violet", label: "Violet", hsl: "265 65% 62%", fg: "0 0% 98%" },
];

export const DEFAULT_ACCENT = "rose";
const accentById = (id: string | null | undefined): AccentPreset =>
	ACCENT_PRESETS.find((a) => a.id === id) ?? ACCENT_PRESETS[0];

/** Properties owned by the accent preset — everything else keeps its default. */
const ACCENT_PRESET_PROPS = [
	"--theme-accent",
	"--theme-accent-fg",
	"--theme-primary",
	"--theme-primary-fg",
	"--color-accent",
	"--color-primary",
	"--color-ring",
	"--color-accent-muted",
	"--color-primary-foreground",
	"--theme-accent-muted",
	"--theme-accent-subtle",
	"--theme-accent-ink",
] as const;

/** Remove every property written by the preset so theme defaults take over. */
export function clearAccentPreset(): void {
	const root = document.documentElement;
	for (const name of ACCENT_PRESET_PROPS) {
		root.style.removeProperty(name);
	}
}

/**
 * Apply an accent preset to <html>. Passing `null` clears the override and
 * falls back to the token defaults — rose on plain themes. In the app the
 * plain themes always pass the persisted store accent (default
 * DEFAULT_ACCENT); special themes keep their curated accent instead.
 */
export function applyAccentPreset(
	accentId: string | null,
	isDark: boolean,
): void {
	const root = document.documentElement;
	const preset = accentId ? accentById(accentId) : null;
	if (!preset) {
		clearAccentPreset();
		return;
	}
	// hsl triplets carry a unit on the saturation ("217 75% 60%"), so parseFloat
	// rather than Number — Number("75%") is NaN and poisoned ink/muted/subtle.
	const [h, s] = preset.hsl.split(" ").map((t) => Number.parseFloat(t));
	// Muted/subtle companions, lightness-shifted for light vs dark surfaces.
	const muted = isDark
		? `${h} ${Math.max(8, Math.round(s * 0.62))}% 22%`
		: `${h} ${Math.max(8, Math.round(s * 0.55))}% 88%`;
	const subtle = isDark
		? `${h} ${Math.max(6, Math.round(s * 0.5))}% 14%`
		: `${h} ${Math.max(6, Math.round(s * 0.5))}% 94%`;
	// Ink (text on an accentMuted pill) — always AA against muted.
	const ink = isDark
		? `${h} ${Math.min(80, Math.round(s * 1.05))}% 72%`
		: `${h} ${Math.min(80, Math.round(s * 1.05))}% 30%`;
	const fg = preset.fg;
	root.style.setProperty("--theme-accent", preset.hsl);
	root.style.setProperty("--theme-accent-fg", fg);
	root.style.setProperty("--theme-primary", preset.hsl);
	root.style.setProperty("--theme-primary-fg", fg);
	root.style.setProperty("--theme-accent-muted", muted);
	root.style.setProperty("--theme-accent-subtle", subtle);
	root.style.setProperty("--theme-accent-ink", ink);
	root.style.setProperty("--color-accent", `hsl(${preset.hsl})`);
	root.style.setProperty("--color-primary", `hsl(${preset.hsl})`);
	root.style.setProperty("--color-ring", `hsl(${preset.hsl})`);
	root.style.setProperty("--color-accent-muted", `hsl(${muted})`);
	root.style.setProperty("--color-primary-foreground", `hsl(${fg})`);
}
