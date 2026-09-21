import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en from "./locales/en/translation.json";

export const SUPPORTED_LANGUAGES = [
	{ code: "en", label: "English" },
	{ code: "ja", label: "日本語" },
	{ code: "zh-CN", label: "简体中文" },
	{ code: "zh-TW", label: "繁體中文" },
	{ code: "es", label: "Español" },
	{ code: "fr", label: "Français" },
	{ code: "de", label: "Deutsch" },
	{ code: "pt-BR", label: "Português (Brasil)" },
	{ code: "ko", label: "한국어" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

i18n
	.use(LanguageDetector)
	.use(initReactI18next)
	.init({
		resources: {
			en: { translation: en },
		},
		fallbackLng: "en",
		supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
		load: "currentOnly",
		interpolation: { escapeValue: false },
		react: { useSuspense: false },
		detection: {
			order: ["localStorage", "navigator"],
			lookupLocalStorage: "otoyin:lang",
			caches: ["localStorage"],
		},
	});

const loadedLocales = new Set<LanguageCode>(["en"]);

/** Load a locale bundle on demand. Only English ships in the entry chunk;
 * the other eight locales split into lazy chunks (P1.3). */
export async function ensureLocale(code: LanguageCode): Promise<void> {
	if (loadedLocales.has(code)) {
		return;
	}
	const mod = await import(`./locales/${code}/translation.json`);
	i18n.addResourceBundle(code, "translation", mod.default ?? mod, true, true);
	loadedLocales.add(code);
}

/** Switch interface language, loading its bundle first. Falls back to
 * English when the bundle cannot be loaded. */
export async function changeLanguage(code: LanguageCode): Promise<void> {
	try {
		await ensureLocale(code);
	} catch {
		code = "en";
	}
	await i18n.changeLanguage(code);
}

// Fetch the detected/stored language once at startup (English is bundled,
// so cold start never waits on a chunk).
void (async () => {
	const lng = i18n.language;
	if (lng !== "en" && SUPPORTED_LANGUAGES.some((l) => l.code === lng)) {
		await changeLanguage(lng as LanguageCode);
	}
})();

export default i18n;
