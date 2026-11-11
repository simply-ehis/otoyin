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
	{
		key: "api_keys.llm.has_key",
		type: "boolean",
		default: false,
		label: "LLM API key",
		description:
			"LLM (chat/assistant) API key stored in the OS credential store.",
		group: "api_keys",
		keywords: ["api key", "llm", "credential", "store"],
		needsRestart: false,
		version: SCHEMA_VERSION,
	},
	{
		key: "api_keys.stt.has_key",
		type: "boolean",
		default: false,
		label: "STT API key",
		description: "Speech-to-text API key stored in the OS credential store.",
		group: "api_keys",
		keywords: ["api key", "stt", "speech", "transcription", "credential"],
		needsRestart: false,
		version: SCHEMA_VERSION,
	},
	{
		key: "api_keys.tts.has_key",
		type: "boolean",
		default: false,
		label: "TTS API key",
		description: "Text-to-speech API key stored in the OS credential store.",
		group: "api_keys",
		keywords: ["api key", "tts", "voice", "synthesis", "credential"],
		needsRestart: false,
		version: SCHEMA_VERSION,
	},
	{
		key: "api_keys.sfx.has_key",
		type: "boolean",
		default: false,
		label: "SFX API key",
		description: "Sound effects API key stored in the OS credential store.",
		group: "api_keys",
		keywords: ["api key", "sfx", "sound", "freesound", "credential"],
		needsRestart: false,
		version: SCHEMA_VERSION,
	},
	{
		key: "api_keys.music.has_key",
		type: "boolean",
		default: false,
		label: "Music API key",
		description: "Music generation API key stored in the OS credential store.",
		group: "api_keys",
		keywords: ["api key", "music", "generation", "credential"],
		needsRestart: false,
		version: SCHEMA_VERSION,
	},
	{
		key: "api_keys.vc.has_key",
		type: "boolean",
		default: false,
		label: "Voice Conversion API key",
		description: "Voice conversion API key stored in the OS credential store.",
		group: "api_keys",
		keywords: ["api key", "voice", "conversion", "vc", "credential"],
		needsRestart: false,
		version: SCHEMA_VERSION,
	},
	{
		key: "appearance.on_launch",
		type: "select",
		default: "new_generate",
		options: ["new_generate", "last_tab", "library"],
		label: "On launch",
		description:
			"What Otoyin opens on startup: a new Generate window, the last tab you used, or the Library.",
		group: "appearance",
		keywords: ["on launch", "startup", "open", "default tab"],
		needsRestart: false,
		version: SCHEMA_VERSION,
	},
	{
		key: "appearance.accent_hue",
		type: "number",
		default: 0,
		label: "Accent hue",
		description:
			"Custom accent color hue (0–360 degrees). Overrides the accent preset color.",
		group: "appearance",
		keywords: ["accent", "hue", "color", "customize"],
		needsRestart: false,
		version: SCHEMA_VERSION,
	},
	{
		key: "appearance.background_pattern",
		type: "select",
		default: "line-in-motion",
		options: ["line-in-motion", "waveform", "none"],
		label: "Background pattern",
		description: "Background tile style shown in empty canvas areas.",
		group: "appearance",
		keywords: ["background", "pattern", "tile", "canvas"],
		needsRestart: false,
		version: SCHEMA_VERSION,
	},
	{
		key: "appearance.network_access",
		type: "boolean",
		default: false,
		label: "Network access",
		description:
			"Allow the app to access the network for model downloads and updates.",
		group: "appearance",
		keywords: ["network", "access", "internet", "download", "update"],
		needsRestart: false,
		version: SCHEMA_VERSION,
	},
	{
		key: "appearance.performance_mode",
		type: "boolean",
		default: false,
		label: "Performance mode",
		description:
			"Prioritize performance over visual quality. Reduces animations and visual effects.",
		group: "appearance",
		keywords: ["performance", "mode", "animation", "visual"],
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
