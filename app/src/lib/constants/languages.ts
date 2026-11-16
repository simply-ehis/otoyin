/**
 * Supported languages for voice generation, per engine.
 *
 * kokoro supports 8 languages.
 * styletts2 / pocket_tts are English-centric
 * (with some multilingual coverage); parler_tts is English.
 */

/** All languages that any engine supports. */
export const ALL_LANGUAGES = {
	ar: "Arabic",
	bg: "Bulgarian",
	bn: "Bengali",
	cs: "Czech",
	da: "Danish",
	de: "German",
	et: "Estonian",
	el: "Greek",
	en: "English",
	es: "Spanish",
	fi: "Finnish",
	fr: "French",
	gu: "Gujarati",
	he: "Hebrew",
	hi: "Hindi",
	hr: "Croatian",
	hu: "Hungarian",
	lt: "Lithuanian",
	lv: "Latvian",
	sl: "Slovenian",
	id: "Indonesian",
	it: "Italian",
	ja: "Japanese",
	ka: "Georgian",
	kn: "Kannada",
	ko: "Korean",
	ml: "Malayalam",
	mr: "Marathi",
	ms: "Malay",
	nl: "Dutch",
	no: "Norwegian",
	or: "Odia",
	pa: "Punjabi",
	pl: "Polish",
	pt: "Portuguese",
	"pt-BR": "Portuguese (Brazil)",
	ro: "Romanian",
	ru: "Russian",
	sk: "Slovak",
	sv: "Swedish",
	sw: "Swahili",
	ta: "Tamil",
	te: "Telugu",
	th: "Thai",
	tl: "Filipino",
	tr: "Turkish",
	uk: "Ukrainian",
	ur: "Urdu",
	vi: "Vietnamese",
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
	voxcpm2: WIDE_23,
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
	pocket_tts: ["en", "es", "fr", "de", "it", "pt"],
	parler_tts: ["en"],
	moss_tts_nano: WIDE_23,
	neutts: ["en"],
	neutts_2e: ["en"],
	orpheus: ["en"],
	// audio.cpp GGUF engines (from backend ModelConfig.languages)
	audio8_tts: ["en", "zh", "de", "es", "fr", "it", "ja", "ko", "nl", "pl"],
	chatterbox_turbo: ["en"],
	cosyvoice3: ["zh", "en", "ja", "ko", "de", "es", "fr", "it", "ru"],
	fish_drama3: ["en"],
	inflect_v2: ["en"],
	magpie_tts: ["de", "en", "es", "fr", "hi", "it", "ko", "pt-BR", "vi", "zh"],
	omnivoice: ["en", "zh", "ja", "ko", "fr", "de", "es", "it", "pt", "ru", "ar", "hi"],
	phonon: ["en"],
	piper_tts: ["en"],
	steer_tts: ["en"],
	supertonic: ["en", "ko", "ja", "ar", "bg", "cs", "da", "de", "el", "es", "et", "fi", "fr", "hi", "hr", "hu", "id", "it", "lt", "lv", "nl", "pl", "pt", "ro", "ru", "sk", "sl", "sv", "tr", "uk", "vi"],
	zonos3: ["ar", "bg", "bn", "cs", "da", "de", "el", "en", "es", "fi", "fr", "gu", "he", "hi", "hu", "id", "it", "ja", "ka", "kn", "ko", "ml", "mr", "ms", "nl", "no", "or", "pa", "pl", "pt", "ro", "ru", "sk", "sv", "ta", "te", "th", "tl", "tr", "uk", "ur", "vi", "zh"],
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
