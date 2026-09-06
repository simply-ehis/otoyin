/**
 * Tests for instrument zone selection, ported from Resonant (AGPL-3.0-only).
 */
import { describe, expect, it } from "vitest";
import { chooseZone } from "./chooseZone";
import type { SampleZone } from "./types";

const makeZone = (overrides: Partial<SampleZone> = {}): SampleZone => ({
	rootKey: 60,
	loKey: 0,
	hiKey: 127,
	loVel: 0,
	hiVel: 127,
	...overrides,
});

describe("chooseZone", () => {
	it("returns the first matching zone by key and velocity", () => {
		const z1 = makeZone({ loKey: 0, hiKey: 50, loVel: 0, hiVel: 127 });
		const z2 = makeZone({ loKey: 51, hiKey: 127, loVel: 0, hiVel: 127 });
		expect(chooseZone([z1, z2], 30, 0.5)).toBe(z1);
		expect(chooseZone([z1, z2], 80, 0.5)).toBe(z2);
	});

	it("falls back to closest rootKey when no zone matches key range", () => {
		const z1 = makeZone({ rootKey: 48, loKey: 40, hiKey: 55 });
		const z2 = makeZone({ rootKey: 72, loKey: 65, hiKey: 80 });
		// pitch 60 is outside both key ranges; falls back to closest rootKey
		// |48-60|=12, |72-60|=12, first match wins
		expect(chooseZone([z1, z2], 60, 0.5)).toBe(z1);
		// pitch 58: |48-58|=10 < |72-58|=14 → z1
		expect(chooseZone([z1, z2], 58, 0.5)).toBe(z1);
	});

	it("returns undefined for empty zones array", () => {
		expect(chooseZone([], 60, 0.5)).toBeUndefined();
	});

	it("uses fallback fields keyRangeLow/High and velRangeLow/High", () => {
		const z = makeZone({
			loKey: undefined,
			hiKey: undefined,
			keyRangeLow: 30,
			keyRangeHigh: 40,
			loVel: undefined,
			hiVel: undefined,
			velRangeLow: 60,
			velRangeHigh: 100,
		});
		// pitch 35 is within [30, 40], velocity 0.5 → MIDI 64, within [60, 100]
		expect(chooseZone([z], 35, 0.5)).toBe(z);
		// pitch 50 is outside [30, 40]; fallback picks closest rootKey (60)
		expect(chooseZone([z], 50, 0.5)).toBe(z);
	});

	it("converts velocity 0-1 to MIDI 0-127", () => {
		const z1 = makeZone({ loVel: 64, hiVel: 127, rootKey: 60 });
		const z2 = makeZone({ loVel: 0, hiVel: 63, rootKey: 60 });
		// velocity 0.49 → MIDI 62 → matches z2 (loVel=0, hiVel=63)
		expect(chooseZone([z1, z2], 60, 0.49)).toBe(z2);
		// velocity 0.55 → MIDI 70 → matches z1 (loVel=64, hiVel=127)
		expect(chooseZone([z1, z2], 60, 0.55)).toBe(z1);
	});
});
