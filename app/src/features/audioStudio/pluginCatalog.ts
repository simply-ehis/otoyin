import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { AvailableEffect } from "@/lib/api/types";
import { debug } from "@/lib/utils/debug";

export interface ParamMeta {
	label: string;
	min: number;
	max: number;
	step: number;
	unit: string;
}

export interface PluginCatalogEntry {
	id: string;
	name: string;
	defaults: Record<string, number>;
}

/** Effects with a live Web Audio preview in buildEffectChain. All others are render-only (backend bounce). */
export const NATIVE_PREVIEW_IDS = new Set([
	"builtin-eq",
	"builtin-compressor",
	"builtin-reverb",
	"builtin-delay",
	"builtin-gain",
	"builtin-chorus",
	"builtin-distortion",
	"builtin-telephone",
	"builtin-megaphone",
	"builtin-resonant_filter_sweep",
]);

/** Offline-first fallback: the panel works with these when the backend is unreachable. */
export const FALLBACK_CATALOG: PluginCatalogEntry[] = [
	{
		id: "builtin-eq",
		name: "EQ",
		defaults: {
			low_freq: 100,
			low_gain: 0,
			low_q: Math.SQRT1_2,
			mid1_freq: 1000,
			mid1_gain: 0,
			mid1_q: 1.0,
			mid2_freq: 3000,
			mid2_gain: 0,
			mid2_q: 1.0,
			high_freq: 8000,
			high_gain: 0,
			high_q: Math.SQRT1_2,
		},
	},
	{
		id: "builtin-compressor",
		name: "Compressor",
		defaults: { threshold: -24, ratio: 12, attack: 3, release: 250 },
	},
	{
		id: "builtin-reverb",
		name: "Reverb",
		defaults: { mix: 0.3 },
	},
	{
		id: "builtin-delay",
		name: "Delay",
		defaults: { time: 0.3, feedback: 0.3, mix: 0.5 },
	},
	{
		id: "builtin-gain",
		name: "Gain",
		defaults: { gain: 1.0 },
	},
];

/** Hand-tuned labels/units for the fallback five. Everything else derives from the backend registry. */ export const FALLBACK_PARAM_META: Record<
	string,
	Record<string, ParamMeta>
> = {
	eq: {
		low_freq: { label: "Low Freq", min: 20, max: 500, step: 10, unit: "Hz" },
		low_gain: { label: "Low", min: -12, max: 12, step: 1, unit: "dB" },
		low_q: { label: "Low Q", min: 0.1, max: 10, step: 0.1, unit: "" },
		mid1_freq: {
			label: "Mid1 Freq",
			min: 100,
			max: 5000,
			step: 50,
			unit: "Hz",
		},
		mid1_gain: { label: "Mid 1", min: -12, max: 12, step: 1, unit: "dB" },
		mid1_q: { label: "Mid1 Q", min: 0.1, max: 10, step: 0.1, unit: "" },
		mid2_freq: {
			label: "Mid2 Freq",
			min: 500,
			max: 12000,
			step: 50,
			unit: "Hz",
		},
		mid2_gain: { label: "Mid 2", min: -12, max: 12, step: 1, unit: "dB" },
		mid2_q: { label: "Mid2 Q", min: 0.1, max: 10, step: 0.1, unit: "" },
		high_freq: {
			label: "High Freq",
			min: 2000,
			max: 20000,
			step: 100,
			unit: "Hz",
		},
		high_gain: { label: "High", min: -12, max: 12, step: 1, unit: "dB" },
		high_q: { label: "High Q", min: 0.1, max: 10, step: 0.1, unit: "" },
	},
	compressor: {
		threshold: {
			label: "Threshold",
			min: -60,
			max: 0,
			step: 1,
			unit: "dB",
		},
		ratio: { label: "Ratio", min: 1, max: 20, step: 1, unit: ":1" },
		attack: { label: "Attack", min: 1, max: 100, step: 1, unit: "ms" },
		release: { label: "Release", min: 10, max: 1000, step: 10, unit: "ms" },
	},
	reverb: {
		mix: { label: "Mix", min: 0, max: 1, step: 0.05, unit: "" },
	},
	delay: {
		time: { label: "Time", min: 0.05, max: 1, step: 0.05, unit: "s" },
		feedback: { label: "Feedback", min: 0, max: 0.9, step: 0.05, unit: "" },
		mix: { label: "Mix", min: 0, max: 1, step: 0.05, unit: "" },
	},
	gain: {
		gain: { label: "Gain", min: 0, max: 2, step: 0.05, unit: "" },
	},
};

/** "low_cutoff" → "Low Cutoff". */
export function prettyParamLabel(key: string): string {
	return key
		.split("_")
		.map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
		.join(" ");
}

/**
 * Render-engine effects missing from /effects/available, with param ranges
 * mirroring backend services/effects.EFFECT_TYPES. Listed in the panel so
 * every renderable effect is reachable; all keys match the engine dialect,
 * so the adapter passes them through untouched.
 */
const ENGINE_FALLBACK_META: Record<string, Record<string, ParamMeta>> = {
	formant_shift: {
		shift_factor: { label: "Shift", min: 0.5, max: 2, step: 0.05, unit: "×" },
	},
	time_stretch: {
		factor: { label: "Factor", min: 0.5, max: 2, step: 0.05, unit: "×" },
	},
	distortion: {
		gain: { label: "Drive", min: 1, max: 10, step: 0.1, unit: "" },
		mix: { label: "Mix", min: 0, max: 1, step: 0.05, unit: "" },
	},
	noise_gate: {
		threshold: { label: "Threshold", min: -60, max: 0, step: 1, unit: "dB" },
	},
	deesser: {
		threshold_db: { label: "Threshold", min: -40, max: 0, step: 1, unit: "dB" },
		reduction_db: { label: "Reduction", min: -18, max: 0, step: 1, unit: "dB" },
		freq_low: {
			label: "Freq Low",
			min: 2000,
			max: 6000,
			step: 100,
			unit: "Hz",
		},
		freq_high: {
			label: "Freq High",
			min: 6000,
			max: 12000,
			step: 100,
			unit: "Hz",
		},
		strength: { label: "Strength", min: 0, max: 1, step: 0.05, unit: "" },
	},
	spectral_denoise: {
		amount: { label: "Amount", min: 0, max: 1, step: 0.05, unit: "" },
	},
	emotion_tone: {
		warmth: { label: "Warmth", min: -1, max: 1, step: 0.05, unit: "" },
		energy: { label: "Energy", min: -1, max: 1, step: 0.05, unit: "" },
		brightness: { label: "Brightness", min: -1, max: 1, step: 0.05, unit: "" },
		formant: { label: "Formant", min: -1, max: 1, step: 0.05, unit: "" },
	},
};

/** Extra panel keys the registry omits but the engine honors. */
const ENGINE_EXTRA_KEYS: Record<string, Record<string, ParamMeta>> = {
	resonant_filter_sweep: {
		filter_type: { label: "Type", min: 0, max: 2, step: 1, unit: "" },
	},
};

const ENGINE_FALLBACK_DEFAULTS: Record<string, string> = {
	formant_shift: "Formant Shift",
	time_stretch: "Time Stretch",
	distortion: "Distortion",
	noise_gate: "Noise Gate",
	deesser: "De-Esser",
	spectral_denoise: "Spectral De-Noise",
	emotion_tone: "Emotion / Tone",
};

/** Backend EFFECT_TYPES defaults for the engine-fallback effects above. */
const ENGINE_FALLBACK_VALUES: Record<string, Record<string, number>> = {
	formant_shift: { shift_factor: 1.0 },
	time_stretch: { factor: 1.0 },
	distortion: { gain: 2.0, mix: 0.5 },
	noise_gate: { threshold: -40 },
	deesser: {
		threshold_db: -18,
		reduction_db: -6,
		freq_low: 4000,
		freq_high: 8000,
		strength: 0.6,
	},
	spectral_denoise: { amount: 0.7 },
	emotion_tone: { warmth: 0, energy: 0, brightness: 0, formant: 0 },
};

/** Merge the backend effect registry over the offline fallback catalog. */
export function mergeCatalog(
	available: AvailableEffect[] | undefined,
): PluginCatalogEntry[] {
	if (!available?.length) {
		return [...FALLBACK_CATALOG, ...engineFallbackEntries(new Set())];
	}
	const seen = new Set<string>();
	const merged: PluginCatalogEntry[] = [];
	for (const fx of available) {
		const id = `builtin-${fx.type}`;
		seen.add(id);
		const defaults: Record<string, number> = {};
		for (const [key, p] of Object.entries(fx.params)) {
			defaults[key] = p.default;
		}
		merged.push({ id, name: fx.label || fx.type, defaults });
	}
	// Engine effects the registry omits (defaults = backend EFFECT_TYPES).
	merged.push(...engineFallbackEntries(seen));
	// Keep fallback-only entries (e.g. gain, which is frontend-native) at the end.
	for (const entry of FALLBACK_CATALOG) {
		if (!seen.has(entry.id)) {
			merged.push(entry);
		}
	}
	return merged;
}

/** Catalog entries for render-engine effects missing from the registry. */
function engineFallbackEntries(seen: Set<string>): PluginCatalogEntry[] {
	const entries: PluginCatalogEntry[] = [];
	for (const [type, name] of Object.entries(ENGINE_FALLBACK_DEFAULTS)) {
		const id = `builtin-${type}`;
		if (!seen.has(id)) {
			seen.add(id);
			entries.push({
				id,
				name,
				defaults: { ...(ENGINE_FALLBACK_VALUES[type] ?? {}) },
			});
		}
	}
	return entries;
}

/** Merge backend param ranges over the hand-tuned fallback meta. */
export function mergeParamMeta(
	available: AvailableEffect[] | undefined,
): Record<string, Record<string, ParamMeta>> {
	const meta: Record<string, Record<string, ParamMeta>> = {};
	if (available) {
		for (const fx of available) {
			const params: Record<string, ParamMeta> = {};
			for (const [key, p] of Object.entries(fx.params)) {
				params[key] = {
					label: prettyParamLabel(key),
					min: p.min,
					max: p.max,
					step: p.step,
					unit: "",
				};
			}
			meta[fx.type] = params;
		}
	}
	// Hand-tuned labels/units win for the fallback five.
	for (const [type, params] of Object.entries(FALLBACK_PARAM_META)) {
		meta[type] = { ...(meta[type] ?? {}), ...params };
	}
	// Engine-fallback effects missing from the registry.
	for (const [type, params] of Object.entries(ENGINE_FALLBACK_META)) {
		meta[type] = { ...(meta[type] ?? {}), ...params };
	}
	// Extra engine-honored keys the registry omits.
	for (const [type, params] of Object.entries(ENGINE_EXTRA_KEYS)) {
		meta[type] = { ...(meta[type] ?? {}), ...params };
	}
	// Ensure every fallback catalog entry has meta even when offline.
	for (const entry of FALLBACK_CATALOG) {
		const type = entry.id.replace(/^builtin-/, "");
		if (!meta[type]) {
			meta[type] = FALLBACK_PARAM_META[type] ?? {};
		}
	}
	return meta;
}

export interface PluginCatalog {
	entries: PluginCatalogEntry[];
	paramMeta: Record<string, Record<string, ParamMeta>>;
	/** True when the list came from the backend registry (false = offline fallback). */
	fromBackend: boolean;
}

/** Registry-driven plugin catalog with offline fallback. Cached 5 minutes. */
export function usePluginCatalog(): PluginCatalog {
	const query = useQuery({
		queryKey: ["availableEffects"],
		queryFn: () => apiClient.getAvailableEffects(),
		staleTime: 5 * 60_000,
		retry: 1,
	});
	const available = query.data?.effects;
	if (query.error) {
		debug.warn(
			"available effects fetch failed, using fallback catalog",
			query.error,
		);
	}
	return {
		entries: mergeCatalog(available),
		paramMeta: mergeParamMeta(available),
		fromBackend: !!available?.length,
	};
}
