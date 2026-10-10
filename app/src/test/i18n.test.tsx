/**
 * i18n registration + fallback tests (localization prompt).
 *
 * Encodes: 9 supported locales, unsupported OS locales fall back to
 * English, unreviewed locale files stay explicitly marked (never silently
 * mixed machine translation), and the Settings switcher lists them all.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import { LanguageSelect } from "@/features/settings/LanguageSelect";
import { SUPPORTED_LANGUAGES } from "@/i18n";
import de from "@/i18n/locales/de/translation.json";
import en from "@/i18n/locales/en/translation.json";
import es from "@/i18n/locales/es/translation.json";
import fr from "@/i18n/locales/fr/translation.json";
import ja from "@/i18n/locales/ja/translation.json";
import ko from "@/i18n/locales/ko/translation.json";
import ptBR from "@/i18n/locales/pt-BR/translation.json";
import zhCN from "@/i18n/locales/zh-CN/translation.json";
import zhTW from "@/i18n/locales/zh-TW/translation.json";

const EXPECTED = [
	"en",
	"ja",
	"zh-CN",
	"zh-TW",
	"es",
	"fr",
	"de",
	"pt-BR",
	"ko",
] as const;

describe("supported locales", () => {
	it("registers exactly the nine supported languages", () => {
		expect(SUPPORTED_LANGUAGES.map((l) => l.code)).toEqual([...EXPECTED]);
	});

	it("labels every language in its own script", () => {
		const labels = Object.fromEntries(
			SUPPORTED_LANGUAGES.map((l) => [l.code, l.label]),
		);
		expect(labels.es).toBe("Español");
		expect(labels.fr).toBe("Français");
		expect(labels.de).toBe("Deutsch");
		expect(labels["pt-BR"]).toBe("Português (Brasil)");
		expect(labels.ko).toBe("한국어");
	});

	it("marks unreviewed mirrors explicitly; reviewed locales carry no marker", () => {
		for (const mirror of [es, fr, de, ptBR, ko]) {
			expect((mirror as Record<string, unknown>)._meta).toMatchObject({
				status: "needs-human-review",
				source: "en",
			});
		}
		for (const reviewed of [en, ja, zhCN, zhTW]) {
			expect((reviewed as Record<string, unknown>)._meta).toBeUndefined();
		}
	});
});

describe("fallback behavior", () => {
	function sidebarOf(locale: unknown): Record<string, string> {
		return (locale as { sidebar: Record<string, string> }).sidebar;
	}

	async function tIn(lng: string, key: string): Promise<string> {
		const inst = createInstance();
		await inst.init({
			lng,
			fallbackLng: "en",
			supportedLngs: [...EXPECTED],
			load: "currentOnly",
			resources: {
				en: { translation: en },
				es: { translation: es },
			},
			interpolation: { escapeValue: false },
		});
		return inst.t(key);
	}

	it("falls back to English for an unsupported OS locale (Italian)", async () => {
		await expect(tIn("it", "sidebar.generate")).resolves.toBe(
			sidebarOf(en).generate,
		);
	});

	it("resolves a registered locale from its own file", async () => {
		await expect(tIn("es", "sidebar.generate")).resolves.toBe(
			sidebarOf(es).generate,
		);
	});
});

describe("LanguageSelect", () => {
	it("lists all nine languages", async () => {
		render(<LanguageSelect />);
		// Radix Select in jsdom: open via keyboard (clicks hit the
		// dismissable-layer pointer-events gap) — same pattern as
		// overlays.test.tsx "opens the listbox and chooses an option".
		fireEvent.keyDown(screen.getByRole("combobox", { name: "Interface language" }), {
			key: "ArrowDown",
		});
		for (const code of EXPECTED) {
			expect(
				await screen.findByRole("option", {
					name: SUPPORTED_LANGUAGES.find((l) => l.code === code)?.label ?? code,
				}),
			).toBeInTheDocument();
		}
		expect(screen.getAllByRole("option")).toHaveLength(9);
	});
});
