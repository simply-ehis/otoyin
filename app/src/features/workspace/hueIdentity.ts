import { cn } from "@/lib/utils/cn";

/**
 * Hue identity for parallel media items (take lanes, automation lanes, pitch
 * classes) — the DiarizationView pattern: hue lives in TEXT and thin border
 * LINES only; surfaces stay solid design tokens (bg-card / bg-secondary /
 * bg-sunken). Never use hue-tinted surface fills.
 *
 * 12 slots so adjacent identities never share a hue (pitch-class width).
 */
const HUE_TEXT: Record<string, string> = {
	sky: "text-sky-400",
	emerald: "text-emerald-400",
	amber: "text-amber-400",
	rose: "text-rose-400",
	violet: "text-violet-400",
	cyan: "text-cyan-400",
	orange: "text-orange-400",
	lime: "text-lime-400",
	fuchsia: "text-fuchsia-400",
	teal: "text-teal-400",
	indigo: "text-indigo-400",
	yellow: "text-yellow-400",
};

const HUE_LINE: Record<string, string> = {
	sky: "border-sky-400",
	emerald: "border-emerald-400",
	amber: "border-amber-400",
	rose: "border-rose-400",
	violet: "border-violet-400",
	cyan: "border-cyan-400",
	orange: "border-orange-400",
	lime: "border-lime-400",
	fuchsia: "border-fuchsia-400",
	teal: "border-teal-400",
	indigo: "border-indigo-400",
	yellow: "border-yellow-400",
};

const HUE_KEYS = Object.keys(HUE_TEXT);

/** Stable hue slot for an integer identity (lane index, pitch class, …). */
function hueKey(i: number): string {
	const n = ((i % HUE_KEYS.length) + HUE_KEYS.length) % HUE_KEYS.length;
	return HUE_KEYS[n] ?? "sky";
}

/** Text color carrying the identity hue (for labels, badges, SVG currentColor). */
export function hueText(i: number): string {
	return HUE_TEXT[hueKey(i)] ?? "text-foreground";
}

/** Border color for a 3px identity edge bar on a solid surface. */
export function hueLine(i: number): string {
	return HUE_LINE[hueKey(i)] ?? "border-accent";
}

/** Combined left edge bar classes for a solid-surface lane/take card. */
export function hueEdge(i: number): string {
	return cn("border-l-[3px]", hueLine(i));
}
