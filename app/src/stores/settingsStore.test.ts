/**
 * Settings store tests — credential store integration.
 *
 * Tests that credentials are stored in the OS credential store (via Tauri
 * commands) and that the JSON store only records has_key flags.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "@/stores/settingsStore";
import { SETTINGS_SCHEMA } from "@/lib/settings/schema";

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
