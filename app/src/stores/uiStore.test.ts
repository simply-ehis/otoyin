import { beforeEach, describe, expect, it } from "vitest";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUIStore } from "@/stores/uiStore";

/**
 * settingsStore → uiStore sync. The Ctrl+K "Theme" entry writes through
 * setSetting; the UI picker must pick it up without a reload.
 */
describe("settings → uiStore theme sync", () => {
	beforeEach(() => {
		useSettingsStore.setState((s) => ({
			values: { ...s.values, theme: "system" },
			loaded: true,
		}));
		useUIStore.setState({ theme: "system" });
	});

	it("applies a schema-driven theme change live", () => {
		useSettingsStore.setState((s) => ({
			values: { ...s.values, theme: "dark" },
		}));
		expect(useUIStore.getState().theme).toBe("dark");
	});

	it("ignores values outside the known theme set", () => {
		useSettingsStore.setState((s) => ({
			values: { ...s.values, theme: "bogus-theme" },
		}));
		expect(useUIStore.getState().theme).toBe("system");
	});

	it("does not thrash when the theme did not change", () => {
		useSettingsStore.setState((s) => ({
			values: { ...s.values, someOtherUnrelatedKey: "whatever" },
		}));
		expect(useUIStore.getState().theme).toBe("system");
	});
});
