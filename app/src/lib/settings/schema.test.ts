import { describe, expect, it } from "vitest";
import { clampValue, SETTINGS_SCHEMA, settingDef } from "@/lib/settings/schema";

const themeDef = settingDef("theme");
const perfDef = settingDef("appearance.performance_mode");
// A number-typed def mirroring what the schema guarantees (clamped 0–100).
const numberDef = {
	key: "synthetic.number",
	type: "number" as const,
	default: 50,
	min: 0,
	max: 100,
	step: 1,
	label: "Synthetic",
	description: "clampValue test fixture",
	group: "test",
	keywords: ["synthetic"],
	needsRestart: false,
	version: 1,
};

describe("clampValue", () => {
	it("coerces boolean-ish values", () => {
		expect(clampValue(perfDef!, 1)).toBe(true);
		expect(clampValue(perfDef!, 0)).toBe(false);
		expect(clampValue(perfDef!, "yes")).toBe(true);
	});

	it("falls back to the default for unknown select values", () => {
		expect(clampValue(themeDef!, "ocean")).toBe(themeDef?.default);
		expect(clampValue(themeDef!, "light")).toBe("light");
	});

	it("clamps number settings to their schema bounds", () => {
		expect(clampValue(numberDef, 150)).toBe(100);
		expect(clampValue(numberDef, -10)).toBe(0);
		expect(clampValue(numberDef, 42)).toBe(42);
	});

	it("falls back to the default for NaN-ish number input", () => {
		expect(clampValue(numberDef, "not-a-number")).toBe(numberDef.default);
	});
});

describe("SETTINGS_SCHEMA integrity", () => {
	it("every setting has a key, label, description, group and search keywords", () => {
		for (const def of SETTINGS_SCHEMA) {
			expect(def.key.length).toBeGreaterThan(0);
			expect(def.label.length).toBeGreaterThan(0);
			expect(def.description.length).toBeGreaterThan(0);
			expect(def.group.length).toBeGreaterThan(0);
			expect(def.keywords.length).toBeGreaterThan(0);
		}
	});

	it("select settings declare at least two options and default to one of them", () => {
		const selects = SETTINGS_SCHEMA.filter((d) => d.type === "select");
		expect(selects.length).toBeGreaterThan(0);
		for (const def of selects) {
			expect(def.options?.length).toBeGreaterThanOrEqual(2);
			expect(def.options).toContain(def.default);
		}
	});

	it("number settings declare min/max bounds", () => {
		for (const def of SETTINGS_SCHEMA.filter((d) => d.type === "number")) {
			expect(typeof def.min).toBe("number");
			expect(typeof def.max).toBe("number");
			expect(def.min).toBeLessThan(def.max!);
		}
	});
});
