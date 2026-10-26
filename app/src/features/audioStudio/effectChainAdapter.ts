import type { PluginChainItem } from "./AudioStudioStore";

/**
 * Translate studio plugin-chain items to POST /audio/effect-chain payloads.
 *
 * Why this exists: the panel speaks the /effects/available registry dialect
 * (rate_hz, delay_seconds, threshold_db, attack_ms, …) while the render
 * engine (services/effects) expects its own keys (rate, delay_ms,
 * threshold, attack in seconds, …), and a few panel entries (gain,
 * highpass, lowpass) have no engine equivalent at all. Sending panel params
 * raw silently renders with wrong settings, so every render path — per-track
 * Render FX and Export with FX — must go through {@link toBackendChain}.
 */

export interface BackendChainItem {
	effect_type: string;
	enabled: boolean;
	/** Engine params — strings allowed (e.g. resonant filter_type). */
	params: Record<string, number | string>;
}

/** Effect types handled by POST /audio/effect-chain. */
export const BACKEND_CHAIN_TYPES = new Set([
	"pitch_shift",
	"formant_shift",
	"time_stretch",
	"reverb",
	"delay",
	"chorus",
	"distortion",
	"eq",
	"compressor",
	"noise_gate",
	"gender_swap",
	"age_shift",
	"helium",
	"vocoder",

	"underwater",
	"whisper_transform",
	"auto_tune",
	"spectral_duck",
	"multi_band_pitch",

	"spectral_repair",
	"multi_mic_phase",
	"smart_crossfade",
	"deesser",
	"spectral_denoise",
	"emotion_tone",
]);

/** Panel entries with no render-engine equivalent (frontend-only). */
const DROPPED_TYPES = new Set(["gain", "highpass", "lowpass"]);

function num(v: unknown, fallback: number): number {
	return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Map one panel item's params to engine params. Returns null when droppable. */
function translateParams(
	type: string,
	params: Record<string, number>,
): Record<string, number | string> | null {
	if (DROPPED_TYPES.has(type)) {
		return null;
	}
	switch (type) {
		case "chorus": {
			// Registry: rate_hz + depth 0-1 around centre_delay_ms.
			// Engine: rate Hz + depth in seconds of deviation.
			const centreMs = num(params.centre_delay_ms, 7);
			return {
				rate: num(params.rate_hz, params.rate ?? 1.5),
				depth: num(params.depth, 0.5) * (centreMs / 1000),
				mix: num(params.mix, 0.5),
			};
		}
		case "delay": {
			// Registry seconds vs engine milliseconds.
			const seconds = num(params.delay_seconds, params.time ?? 0.3);
			return {
				delay_ms: seconds * 1000,
				feedback: num(params.feedback, 0.3),
				mix: num(params.mix, 0.3),
			};
		}
		case "reverb": {
			return {
				room_size: num(params.room_size, 0.5),
				damping: num(params.damping, 0.5),
				wet: num(params.wet_level, params.mix ?? 0.3),
			};
		}
		case "compressor": {
			// Panel milliseconds vs engine seconds; accept both key styles.
			const attackMs = num(params.attack_ms, params.attack ?? 10);
			const releaseMs = num(params.release_ms, params.release ?? 100);
			return {
				threshold: num(params.threshold_db, params.threshold ?? -20),
				ratio: num(params.ratio, 4),
				attack: attackMs / 1000,
				release: releaseMs / 1000,
			};
		}
		default:
			return { ...params };
	}
}

export interface BackendChain {
	chain: BackendChainItem[];
	/** Names of enabled items with no engine equivalent (caller should toast). */
	skipped: string[];
}

/** Convert studio chain items to a render-engine payload, reporting skips. */
export function toBackendChain(items: PluginChainItem[]): BackendChain {
	const chain: BackendChainItem[] = [];
	const skipped: string[] = [];
	for (const item of items) {
		const type = item.pluginId.replace(/^builtin-/, "");
		if (!BACKEND_CHAIN_TYPES.has(type)) {
			if (item.enabled) {
				skipped.push(item.pluginName);
			}
			continue;
		}
		const params = translateParams(type, item.params);
		if (params === null) {
			if (item.enabled) {
				skipped.push(item.pluginName);
			}
			continue;
		}
		chain.push({ effect_type: type, enabled: item.enabled, params });
	}
	return { chain, skipped };
}
