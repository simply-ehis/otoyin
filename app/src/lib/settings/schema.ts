/**
 * Typed settings schema — the single source of truth for every user setting.
 *
 * Each setting is defined once here: key, type, default, allowed range or
 * options, label, help text, group, search keywords, needs-restart flag, and
 * the version it appeared in. The settings UI is generated from this schema,
 * and every setting must have a rule here because the schema requires one.
 *
 * Rust (`tauri/src-tauri/src/settings.rs`) persists raw JSON values; the
 * frontend owns validation, defaults, and clamping via this schema.
 */

export type SettingType = "string" | "number" | "boolean" | "select";

export interface SettingDef {
	/** Unique key persisted in settings.json. */
	key: string;
	/** Value type, used for coercion and clamping. */
	type: SettingType;
	/** Default value when the user has never set it. */
	default: unknown;
	/** Allowed values when type is "select". */
	options?: string[];
	/** Human-readable label shown in the UI. */
	label: string;
	/** One-line plain-language description. */
	description: string;
	/** Settings group this setting belongs to. */
	group: string;
	/** Search keywords — every setting must be findable in Ctrl+K. */
	keywords: string[];
	/** True if changing this requires a restart. */
	needsRestart: boolean;
	/** Schema version this setting was introduced in. */
	version: number;
}

const SCHEMA_VERSION = 1;

export const SETTINGS_SCHEMA: SettingDef[] = [
	{
		key: "theme",
		type: "select",
		default: "system",
		options: [
			"system",
			"light",
			"dark",
			"di-stefano",
			"stripe",
			"coastal-light",
			"mesh-dark",
		],
		label: "Theme",
		description: "Match your system, or pick a fixed light or dark appearance.",
		group: "appearance",
		keywords: ["theme", "appearance", "dark mode", "light mode"],
		needsRestart: false,
		version: SCHEMA_VERSION,
	},
];

/** Look up a setting definition by key. */
export function settingDef(key: string): SettingDef | undefined {
	return SETTINGS_SCHEMA.find((s) => s.key === key);
}

/**
 * Coerce and clamp a value to its setting definition. Type coercion keeps
 * persisted values honest; select values outside `options` fall back to the
 * default; unknown keys are returned as-is.
 */
export function clampValue(def: SettingDef, value: unknown): unknown {
	switch (def.type) {
		case "boolean":
			return Boolean(value);
		case "number":
			return Number(value);
		case "select":
			return def.options?.includes(value as string) ? value : def.default;
		default:
			return value;
	}
}

/** The settings.json schema version Rust and the frontend agree on. */
export const SETTINGS_SCHEMA_VERSION = SCHEMA_VERSION;
