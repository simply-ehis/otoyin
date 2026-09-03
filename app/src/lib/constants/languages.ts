/**
 * Supported languages for voice generation, per engine.
 *
 * kokoro supports 8 languages.
 * fish_speech / zonos / chattts / f5_tts / styletts2 / pocket_tts are English-centric
 * (with some multilingual coverage); parler_tts is English.
 */

/** All languages that any engine supports. */
export const ALL_LANGUAGES = {
	ar: "Arabic",
	da: "Danish",
	de: "German",
	el: "Greek",
	en: "English",
	es: "Spanish",
	fi: "Finnish",
	fr: "French",
	he: "Hebrew",
	hi: "Hindi",
	it: "Italian",
	ja: "Japanese",
	ko: "Korean",
	ms: "Malay",
	nl: "Dutch",
	no: "Norwegian",
	pl: "Polish",
	pt: "Portuguese",
	ru: "Russian",
	sv: "Swedish",
	sw: "Swahili",
	tr: "Turkish",
	zh: "Chinese",
} as const;

export type LanguageCode = keyof typeof ALL_LANGUAGES;

const KOKORO_8 = ["en", "es", "fr", "hi", "it", "pt", "ja", "zh"] as const;
const WIDE_23 = [
	"ar",
	"da",
	"de",
	"el",
	"en",
	"es",
	"fi",
	"fr",
	"he",
	"hi",
	"it",
	"ja",
	"ko",
	"ms",
	"nl",
	"no",
	"pl",
	"pt",
	"ru",
	"sv",
	"sw",
	"tr",
	"zh",
] as const;

/** Per-engine supported language codes. */
export const ENGINE_LANGUAGES: Record<string, readonly LanguageCode[]> = {
	kokoro: KOKORO_8,
	fish_speech_s2: ["en", "zh", "ja", "ko", "de", "fr", "es", "pt", "ru", "it"],
	fish_speech: [
		"en",
		"zh",
		"ja",
		"de",
		"fr",
		"es",
		"ko",
		"ar",
		"ru",
		"nl",
		"it",
		"pl",
		"pt",
	],
	zonos: ["en", "ja", "zh", "fr", "de"],
	qwen3_tts: ["zh", "en", "de", "it", "pt", "es", "ja", "ko", "fr", "ru"],
	bark_small: [
		"en",
		"de",
		"es",
		"fr",
		"hi",
		"it",
		"ja",
		"ko",
		"pl",
		"pt",
		"ru",
		"tr",
		"zh",
	],
	styletts2: ["en"],
	chattts: ["zh", "en"],
	f5_tts: ["en", "zh"],
	pocket_tts: ["en", "es", "fr", "de", "it", "pt"],
	parler_tts: ["en"],
	moss_tts_nano: WIDE_23,
	neutts: ["en"],
	neutts_2e: ["en"],
	orpheus: ["en"],
} as const;

/** Helper: get language options for a given engine. */
export function getLanguageOptionsForEngine(engine: string) {
	const codes = ENGINE_LANGUAGES[engine] ?? (["en"] as readonly LanguageCode[]);
	return codes.map((code) => ({
		value: code,
		label: ALL_LANGUAGES[code],
	}));
}

// ── Backwards-compatible exports used elsewhere ──────────────────────
export const SUPPORTED_LANGUAGES = ALL_LANGUAGES;
export const LANGUAGE_CODES = Object.keys(ALL_LANGUAGES) as LanguageCode[];
export const LANGUAGE_OPTIONS = LANGUAGE_CODES.map((code) => ({
	value: code,
	label: ALL_LANGUAGES[code],
}));
