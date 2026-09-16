/**
 * effectChainAdapter unit tests — panel → render-engine translation floor.
 *
 * Covers unit conversions (delay s→ms, compressor ms→s, chorus depth),
 * key renames (threshold_db, wet_level), pass-through of matching dialects,
 * and skip reporting for frontend-only entries (gain).
 */
import { describe, expect, it } from "vitest";
import type { PluginChainItem } from "./AudioStudioStore";
import { BACKEND_CHAIN_TYPES, toBackendChain } from "./effectChainAdapter";

function item(
	pluginId: string,
	params: Record<string, number>,
	enabled = true,
): PluginChainItem {
	return { pluginId, pluginName: pluginId, enabled, params };
}

describe("toBackendChain", () => {
	it("converts delay seconds to milliseconds", () => {
		const { chain, skipped } = toBackendChain([
			item("builtin-delay", { delay_seconds: 0.3, feedback: 0.3, mix: 0.5 }),
		]);
		expect(skipped).toEqual([]);
		expect(chain).toEqual([
			{
				effect_type: "delay",
				enabled: true,
				params: { delay_ms: 300, feedback: 0.3, mix: 0.5 },
			},
		]);
	});

	it("converts compressor ms to seconds and renames threshold", () => {
		const { chain } = toBackendChain([
			item("builtin-compressor", {
				threshold_db: -24,
				ratio: 12,
				attack_ms: 3,
				release_ms: 250,
			}),
		]);
		expect(chain[0].params).toMatchObject({
			threshold: -24,
			ratio: 12,
			attack: 0.003,
			release: 0.25,
		});
	});

	it("accepts the legacy fallback compressor keys too", () => {
		const { chain } = toBackendChain([
			item("builtin-compressor", {
				threshold: -24,
				ratio: 12,
				attack: 3,
				release: 250,
			}),
		]);
		expect(chain[0].params).toMatchObject({ attack: 0.003, release: 0.25 });
	});

	it("derives chorus depth in seconds from depth fraction", () => {
		const { chain } = toBackendChain([
			item("builtin-chorus", {
				rate_hz: 1.5,
				depth: 0.5,
				centre_delay_ms: 7,
				mix: 0.5,
			}),
		]);
		expect(chain[0].params.rate).toBeCloseTo(1.5);
		expect(chain[0].params.depth).toBeCloseTo(0.0035);
	});

	it("maps reverb wet_level to wet", () => {
		const { chain } = toBackendChain([
			item("builtin-reverb", { room_size: 0.5, damping: 0.5, wet_level: 0.4 }),
		]);
		expect(chain[0].params).toMatchObject({ wet: 0.4 });
	});

	it("maps resonant filter_type number to engine string", () => {
		const { chain } = toBackendChain([
			item("builtin-resonant_filter_sweep", {
				cutoff_start: 200,
				cutoff_end: 8000,
				resonance: 0.5,
				lfo_rate: 0.5,
				filter_type: 1,
			}),
		]);
		expect(chain[0].params.filter_type).toBe("highpass");
	});

	it("passes matching dialects through untouched", () => {
		const { chain, skipped } = toBackendChain([
			item("builtin-telephone", {
				low_cutoff: 300,
				high_cutoff: 3500,
				compression: 6,
				gain_db: 6,
			}),
		]);
		expect(skipped).toEqual([]);
		expect(chain[0]).toMatchObject({ effect_type: "telephone", enabled: true });
		expect(chain[0].params).toEqual({
			low_cutoff: 300,
			high_cutoff: 3500,
			compression: 6,
			gain_db: 6,
		});
	});

	it("skips frontend-only entries and reports their names", () => {
		const { chain, skipped } = toBackendChain([
			item("builtin-gain", { gain: 1.5 }, true),
			item("builtin-distortion", { gain: 2, mix: 0.5 }, true),
		]);
		expect(chain.map((c) => c.effect_type)).toEqual(["distortion"]);
		expect(skipped).toEqual(["builtin-gain"]);
	});

	it("does not report disabled unsupported entries", () => {
		const { skipped } = toBackendChain([
			item("builtin-gain", { gain: 1.5 }, false),
		]);
		expect(skipped).toEqual([]);
	});
});

describe("BACKEND_CHAIN_TYPES", () => {
	it("covers the newly previewable effects", () => {
		for (const t of ["chorus", "distortion", "telephone", "megaphone"]) {
			expect(BACKEND_CHAIN_TYPES.has(t)).toBe(true);
		}
	});
});
