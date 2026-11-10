/**
 * Settings store tests — schema, persistence bridge, defaults, and the
 * theme migration proof point.
 *
 * `@tauri-apps/api/core` is mocked so no Tauri runtime is needed.
 */

import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_SCHEMA, settingDef } from "@/lib/settings/schema";
import { useSettingsStore } from "@/stores/settingsStore";

vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

function resetStore() {
	useSettingsStore.setState({
		schema: SETTINGS_SCHEMA,
		values: {},
		loaded: false,
	});
}

beforeEach(() => {
	resetStore();
	mockedInvoke.mockReset();
});

describe("settingsStore — schema", () => {
	it("defines the theme setting with expected defaults", () => {
		const theme = settingDef("theme");
		expect(theme).toBeDefined();
		expect(theme?.type).toBe("select");
		expect(theme?.default).toBe("system");
		expect(theme?.group).toBe("appearance");
		expect(theme?.needsRestart).toBe(false);
	});

	it("schema entries all have required fields", () => {
		const { schema } = useSettingsStore.getState();
		for (const def of schema) {
			expect(def.key.length).toBeGreaterThan(0);
			expect(["string", "number", "boolean", "select"]).toContain(def.type);
			expect(def.label.length).toBeGreaterThan(0);
			expect(def.description.length).toBeGreaterThan(0);
			expect(def.group.length).toBeGreaterThan(0);
			expect(def.keywords.length).toBeGreaterThan(0);
			expect(typeof def.needsRestart).toBe("boolean");
			expect(typeof def.version).toBe("number");
		}
	});
});

describe("settingsStore — getSetting defaults", () => {
	it("returns the schema default when nothing is persisted", () => {
		expect(useSettingsStore.getState().getSetting("theme")).toBe("system");
	});

	it("clamps an out-of-range select value to the default", () => {
		useSettingsStore.setState({ values: { theme: "not-a-theme" } });
		expect(useSettingsStore.getState().getSetting("theme")).toBe("system");
	});
});

describe("settingsStore — persistence", () => {
	it("writes a setting via invoke and updates local state", async () => {
		mockedInvoke.mockResolvedValue(undefined);
		const store = useSettingsStore.getState();
		await store.setSetting("theme", "dark");
		expect(mockedInvoke).toHaveBeenCalledWith("settings_write", {
			key: "theme",
			value: "dark",
		});
		expect(store.getSetting("theme")).toBe("dark");
		expect(store.isModified("theme")).toBe(true);
	});

	it("loadSettings merges persisted values and marks loaded", async () => {
		mockedInvoke.mockResolvedValue({
			theme: "dark",
			schema_version: 1,
		});
		await useSettingsStore.getState().loadSettings();
		expect(useSettingsStore.getState().loaded).toBe(true);
		expect(useSettingsStore.getState().getSetting("theme")).toBe("dark");
		expect(useSettingsStore.getState().isModified("theme")).toBe(true);
	});

	it("isModified is false when value equals the default", async () => {
		mockedInvoke.mockResolvedValue({ theme: "system" });
		await useSettingsStore.getState().loadSettings();
		expect(useSettingsStore.getState().isModified("theme")).toBe(false);
	});

	it("degrades gracefully when invoke is unavailable", async () => {
		mockedInvoke.mockRejectedValue(new Error("no Tauri"));
		await useSettingsStore.getState().loadSettings();
		expect(useSettingsStore.getState().loaded).toBe(true);
		expect(useSettingsStore.getState().getSetting("theme")).toBe("system");
		// setSetting should not throw even if invoke fails.
		await expect(
			useSettingsStore.getState().setSetting("theme", "light"),
		).resolves.toBeUndefined();
		expect(useSettingsStore.getState().getSetting("theme")).toBe("light");
	});
});
