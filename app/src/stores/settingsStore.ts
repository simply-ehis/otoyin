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

	/** Load settings from settings.json (merge with defaults). */
	loadSettings: () => Promise<void>;
	/** Validate, clamp, persist, and store one setting value. */
	setSetting: (key: string, value: unknown) => Promise<void>;
	/** Return the effective value for a key (persisted or default). */
	getSetting: (key: string) => unknown;
	/** True if the current value differs from the schema default. */
	isModified: (key: string) => boolean;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
	schema: SETTINGS_SCHEMA,
	values: {},
	loaded: false,

	loadSettings: async () => {
		const values = await readSettings();
		set({ values, loaded: true });
	},

	setSetting: async (key, value) => {
		const def = settingDef(key);
		const clamped = def ? clampValue(def, value) : value;
		await writeSetting(key, clamped);
		set((state) => ({ values: { ...state.values, [key]: clamped } }));
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
}));

/** Kick off loading as soon as the store module is imported. */
void useSettingsStore.getState().loadSettings();
