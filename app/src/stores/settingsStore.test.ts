/**
 * Settings store tests — credential store integration.
 *
 * Tests that credentials are stored in the OS credential store (via Tauri
 * commands) and that the JSON store only records has_key flags.
 */

import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_SCHEMA } from "@/lib/settings/schema";
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
		corruptReset: false,
	});
}

beforeEach(() => {
	resetStore();
	mockedInvoke.mockReset();
});

describe("settingsStore — corruption handling", () => {
	it("flags corruptReset and resets to defaults when settings_read reports corruption", async () => {
		mockedInvoke.mockRejectedValue(
			"settings_corrupt: expected value at line 1",
		);
		await useSettingsStore.getState().loadSettings();
		const state = useSettingsStore.getState();
		expect(state.loaded).toBe(true);
		expect(state.corruptReset).toBe(true);
		expect(state.values).toEqual({});
	});

	it("keeps corruptReset false when the read succeeds", async () => {
		mockedInvoke.mockResolvedValue({ theme: "dark" });
		await useSettingsStore.getState().loadSettings();
		expect(useSettingsStore.getState().corruptReset).toBe(false);
		expect(useSettingsStore.getState().values).toEqual({ theme: "dark" });
	});
});

describe("settingsStore — credential store", () => {
	it("setCredentialKey calls credential_set and sets has_key=true", async () => {
		mockedInvoke.mockResolvedValue(undefined);
		await useSettingsStore.getState().setCredentialKey("llm", "sk-test123");
		expect(mockedInvoke).toHaveBeenCalledWith("credential_set", {
			service: "otoyin",
			username: "llm",
			password: "sk-test123",
		});
		expect(useSettingsStore.getState().hasCredentialKey("llm")).toBe(true);
	});

	it("getCredentialKey calls credential_get and returns the key", async () => {
		mockedInvoke.mockResolvedValue("sk-test123");
		const key = await useSettingsStore.getState().getCredentialKey("llm");
		expect(mockedInvoke).toHaveBeenCalledWith("credential_get", {
			service: "otoyin",
			username: "llm",
		});
		expect(key).toBe("sk-test123");
	});

	it("getCredentialKey returns null when no key is stored", async () => {
		mockedInvoke.mockResolvedValue(null);
		const key = await useSettingsStore.getState().getCredentialKey("tts");
		expect(key).toBe(null);
	});

	it("deleteCredentialKey calls credential_delete and sets has_key=false", async () => {
		mockedInvoke.mockResolvedValue(undefined);
		await useSettingsStore.getState().setCredentialKey("stt", "sk-abc");
		await useSettingsStore.getState().deleteCredentialKey("stt");
		expect(mockedInvoke).toHaveBeenCalledWith("credential_delete", {
			service: "otoyin",
			username: "stt",
		});
		expect(useSettingsStore.getState().hasCredentialKey("stt")).toBe(false);
	});

	it("hasCredentialKey returns false when no key is stored", async () => {
		expect(useSettingsStore.getState().hasCredentialKey("music")).toBe(false);
	});

	it("resetSetting persists the schema default and clears the modified state", async () => {
		mockedInvoke.mockResolvedValue(undefined);
		await useSettingsStore
			.getState()
			.setSetting("appearance.network_access", true);
		expect(
			useSettingsStore.getState().getSetting("appearance.network_access"),
		).toBe(true);
		expect(
			useSettingsStore.getState().isModified("appearance.network_access"),
		).toBe(true);
		await useSettingsStore.getState().resetSetting("appearance.network_access");
		expect(
			useSettingsStore.getState().getSetting("appearance.network_access"),
		).toBe(false);
		expect(
			useSettingsStore.getState().isModified("appearance.network_access"),
		).toBe(false);
		expect(mockedInvoke).toHaveBeenLastCalledWith("settings_write", {
			key: "appearance.network_access",
			value: false,
		});
	});

	it("hasCredentialKey returns true after setCredentialKey", async () => {
		mockedInvoke.mockResolvedValue(undefined);
		await useSettingsStore.getState().setCredentialKey("vc", "sk-vc1");
		expect(useSettingsStore.getState().hasCredentialKey("vc")).toBe(true);
	});

	it("setCredentialKey returns false and does not persist has_key when the OS credential store fails", async () => {
		mockedInvoke.mockRejectedValue(new Error("keyring unavailable"));
		const stored = await useSettingsStore
			.getState()
			.setCredentialKey("llm", "sk-test");
		expect(stored).toBe(false);
		expect(useSettingsStore.getState().hasCredentialKey("llm")).toBe(false);
	});

	it("deleteCredentialKey returns false and keeps has_key when the OS credential store fails", async () => {
		mockedInvoke.mockResolvedValue(undefined);
		await useSettingsStore.getState().setCredentialKey("tts", "sk-abc");
		expect(useSettingsStore.getState().hasCredentialKey("tts")).toBe(true);
		mockedInvoke.mockRejectedValue(new Error("delete failed"));
		const deleted = await useSettingsStore
			.getState()
			.deleteCredentialKey("tts");
		expect(deleted).toBe(false);
		expect(useSettingsStore.getState().hasCredentialKey("tts")).toBe(true);
	});
});
