/**
 * pluginCatalog unit tests — registry merge floor.
 *
 * Covers the offline fallback (no backend data → the five native plugins),
 * backend-registry merge (ids, defaults, param ranges), hand-tuned meta
 * precedence over derived meta, and the gain entry surviving the merge
 * (frontend-native, not in the backend registry).
 */
import { describe, expect, it } from "vitest";
import type { AvailableEffect } from "@/lib/api/types";
import {
	FALLBACK_CATALOG,
	mergeCatalog,
	mergeParamMeta,
	NATIVE_PREVIEW_IDS,
	prettyParamLabel,
} from "./pluginCatalog";

const REGISTRY: AvailableEffect[] = [
	{
		type: "telephone",
		label: "Telephone/Radio",
		description: "Band-limited radio voice",
		params: {
			low_cutoff: {
				default: 300,
				min: 100,
				max: 1000,
				step: 10,
				description: "Low cutoff (Hz)",
			},
			gain_db: {
				default: 6,
				min: 0,
				max: 20,
				step: 0.5,
				description: "Output gain (dB)",
			},
		},
	},
	{
		type: "eq",
		label: "EQ",
		description: "Parametric EQ",
		params: {
			low_gain: {
				default: 0,
				min: -12,
				max: 12,
				step: 1,
				description: "Low gain",
			},
		},
	},
];

describe("prettyParamLabel", () => {
	it("title-cases snake_case keys", () => {
		expect(prettyParamLabel("low_cutoff")).toBe("Low Cutoff");
		expect(prettyParamLabel("gain")).toBe("Gain");
	});
});

describe("mergeCatalog", () => {
	it("falls back to natives plus engine effects when offline", () => {
		const entries = mergeCatalog(undefined);
		const ids = entries.map((e) => e.id);
		expect(ids).toContain("builtin-gain");
		expect(ids).toContain("builtin-distortion");
		expect(ids).toContain("builtin-deesser");
	});

	it("maps registry effects to builtin- ids with backend defaults", () => {
		const entries = mergeCatalog(REGISTRY);
		const tel = entries.find((e) => e.id === "builtin-telephone");
		expect(tel?.name).toBe("Telephone/Radio");
		expect(tel?.defaults).toEqual({ low_cutoff: 300, gain_db: 6 });
	});

	it("adds engine effects the registry omits", () => {
		const entries = mergeCatalog(REGISTRY);
		const ids = entries.map((e) => e.id);
		expect(ids).toContain("builtin-distortion");
		expect(ids).toContain("builtin-noise_gate");
		expect(ids).toContain("builtin-formant_shift");
	});

	it("keeps frontend-native entries missing from the registry", () => {
		const entries = mergeCatalog(REGISTRY);
		expect(entries.map((e) => e.id)).toContain("builtin-gain");
	});
});

describe("mergeParamMeta", () => {
	it("derives ranges from the registry", () => {
		const meta = mergeParamMeta(REGISTRY);
		expect(meta.telephone.low_cutoff).toMatchObject({
			label: "Low Cutoff",
			min: 100,
			max: 1000,
			step: 10,
		});
	});

	it("prefers hand-tuned meta for the fallback five", () => {
		const meta = mergeParamMeta(REGISTRY);
		// Local EQ meta carries Hz/dB units; derived meta has none.
		expect(meta.eq.low_gain.unit).toBe("dB");
	});

	it("covers every fallback entry even when offline", () => {
		const meta = mergeParamMeta(undefined);
		for (const entry of FALLBACK_CATALOG) {
			const type = entry.id.replace(/^builtin-/, "");
			for (const key of Object.keys(entry.defaults)) {
				expect(meta[type][key]).toBeDefined();
			}
		}
	});
});

describe("NATIVE_PREVIEW_IDS", () => {
	it("marks the live-preview plugins", () => {
		for (const id of [
			"builtin-eq",
			"builtin-chorus",
			"builtin-distortion",
			"builtin-telephone",
			"builtin-megaphone",
		]) {
			expect(NATIVE_PREVIEW_IDS.has(id)).toBe(true);
		}
		expect(NATIVE_PREVIEW_IDS.has("builtin-vocoder")).toBe(false);
	});
});
