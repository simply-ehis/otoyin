/**
 * Settings store — single source of truth for user settings.
 *
 * Settings are defined in `@/lib/settings/schema` and persisted to
 * `settings.json` via Tauri commands (`settings_read` / `settings_write`).
 * The store holds values in memory, validates/clamps against the schema, and
 * reports which settings differ from their defaults.
 *
 * `theme` is the proof-point setting migrated here from `useUIStore`'s
 * localStorage persistence; all consumers keep using `useUIStore` and the
 * store syncs theme transparently.
 */

import { create } from "zustand";
import {
	CREDENTIAL_SERVICE,
	deleteCredential,
	getCredential,
	setCredential,
} from "@/lib/settings/credentialStore";
import {
	clampValue,
	SETTINGS_SCHEMA,
	type SettingDef,
	settingDef,
} from "@/lib/settings/schema";
import { readSettings, writeSetting } from "@/lib/settings/storage";

interface SettingsState {
	/** The full schema — the single source of truth for setting rules. */
	schema: SettingDef[];
	/** Values loaded from settings.json (key → value). */
	values: Record<string, unknown>;
	/** True once loadSettings has completed. */
	loaded: boolean;
	/** True when settings.json was corrupted on load and reset to defaults (.bak kept). */
	corruptReset: boolean;

	/** Load settings from settings.json (merge with defaults). */
	loadSettings: () => Promise<void>;
	/** Validate, clamp, persist, and store one setting value. */
	setSetting: (key: string, value: unknown) => Promise<void>;
	/** Persist the schema default for a key (clears the "modified" state). */
	resetSetting: (key: string) => Promise<void>;
	/** Return the effective value for a key (persisted or default). */
	getSetting: (key: string) => unknown;
	/** True if the current value differs from the schema default. */
	isModified: (key: string) => boolean;

	/** Store an API key in the OS credential store and mark has_key=true.
	 * Returns false (and writes nothing) when the credential store fails. */
	setCredentialKey: (domain: string, apiKey: string) => Promise<boolean>;
	/** Read an API key from the OS credential store. Returns null if not set. */
	getCredentialKey: (domain: string) => Promise<string | null>;
	/** Delete an API key from the OS credential store and mark has_key=false.
	 * Returns false when the credential store fails. */
	deleteCredentialKey: (domain: string) => Promise<boolean>;
	/** Check whether a key exists for the given domain. */
	hasCredentialKey: (domain: string) => boolean;
	/** Dismiss the "settings were corrupted and reset" notice. */
	dismissCorruptNotice: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
	schema: SETTINGS_SCHEMA,
	values: {},
	loaded: false,
	corruptReset: false,

	loadSettings: async () => {
		const { values, corrupted } = await readSettings();
		set({ values, loaded: true, corruptReset: corrupted });
	},

	setSetting: async (key, value) => {
		const def = settingDef(key);
		const clamped = def ? clampValue(def, value) : value;
		await writeSetting(key, clamped);
		set((state) => ({ values: { ...state.values, [key]: clamped } }));
	},

	resetSetting: async (key) => {
		const def = settingDef(key);
		// Refuse to persist a value we cannot validate, and never delete local
		// state without the write landing — callers above guard too.
		if (!def) {
			console.error("[settings] resetSetting called for unknown key", key);
			return;
		}
		// Persist the default explicitly: isModified compares against def.default,
		// so storing it clears the modified badge deterministically.
		await writeSetting(key, def.default);
		set((state) => ({ values: { ...state.values, [key]: def.default } }));
	},

	getSetting: (key) => {
		const def = settingDef(key);
		const { values } = get();
		if (key in values) {
			return def ? clampValue(def, values[key]) : values[key];
		}
		return def?.default;
	},

	isModified: (key) => {
		const def = settingDef(key);
		const current = get().getSetting(key);
		return current !== def?.default;
	},

	/** Store an API key in the OS credential store and mark has_key=true.
	 * Returns false (and writes nothing) when the credential store fails. */
	setCredentialKey: async (
		domain: string,
		apiKey: string,
	): Promise<boolean> => {
		const stored = await setCredential(CREDENTIAL_SERVICE, domain, apiKey);
		if (!stored) {
			return false;
		}
		await writeSetting(`api_keys.${domain}.has_key`, true);
		set((state) => ({
			values: { ...state.values, [`api_keys.${domain}.has_key`]: true },
		}));
		return true;
	},

	/** Read an API key from the OS credential store. Returns null if not set. */
	getCredentialKey: async (domain: string): Promise<string | null> => {
		return getCredential(CREDENTIAL_SERVICE, domain);
	},

	/** Delete an API key from the OS credential store and mark has_key=false.
	 * Returns false when the credential store fails. */
	deleteCredentialKey: async (domain: string): Promise<boolean> => {
		const removed = await deleteCredential(CREDENTIAL_SERVICE, domain);
		if (!removed) {
			return false;
		}
		await writeSetting(`api_keys.${domain}.has_key`, false);
		set((state) => ({
			values: { ...state.values, [`api_keys.${domain}.has_key`]: false },
		}));
		return true;
	},

	/** Check whether a key exists for the given domain. */
	hasCredentialKey: (domain: string): boolean => {
		return get().getSetting(`api_keys.${domain}.has_key`) === true;
	},

	dismissCorruptNotice: () => set({ corruptReset: false }),
}));

/** Kick off loading as soon as the store module is imported. */
void useSettingsStore.getState().loadSettings();
