/**
 * i18n key-leak guard (P3): every `t("a.b.c")` used in source must resolve
 * to human-readable text in the English catalog — otherwise the UI renders
 * the raw key (e.g. "settings.workspace.tab").
 *
 * A key resolves when the en catalog has the base key, `_one`/`_other`
 * plural forms, or at least one call site supplies a static default
 * (`t("k", "Default")`, `{ defaultValue: "…" }`, or a plain template
 * literal). Call sites with runtime-computed defaults (template literals
 * with ${…}) are safe by construction and exempt.
 *
 * Run: npx vitest run src/test/i18nKeys.test.ts
 */
import { describe, expect, it } from "vitest";
import en from "@/i18n/locales/en/translation.json";

// All sources as raw text (Vite ?raw + eager — no node:fs needed, so this
// runs in any vitest environment and pulls in no new type packages).
const SOURCES = import.meta.glob<string>("../**/*.{ts,tsx}", {
	query: "?raw",
	import: "default",
	eager: true,
});

function flatten(node: unknown, prefix: string, into: Set<string>): void {
	if (node !== null && typeof node === "object" && !Array.isArray(node)) {
		for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
			flatten(v, prefix ? `${prefix}.${k}` : k, into);
		}
	} else {
		into.add(prefix);
	}
}

// t("key") / t('key') — key capture only.
const KEY_RE = /\bt\(\s*["']([A-Za-z0-9_.]+)["']/g;
// t("key", "literal") — plain string default (allows trailing comma).
const STR_DEFAULT_RE =
	/\bt\(\s*["']([A-Za-z0-9_.]+)["']\s*,\s*["']((?:[^"'\\]|\\.)*)["']\s*,?\s*\)/g;
// t("key", { defaultValue: "literal", ... }).
const DV_DEFAULT_RE =
	/\bt\(\s*["']([A-Za-z0-9_.]+)["']\s*,\s*\{\s*defaultValue\s*:\s*["']((?:[^"'\\]|\\.)*)["']/g;
// t("key", `literal`) — backtick without interpolation.
const BT_DEFAULT_RE =
	/\bt\(\s*["']([A-Za-z0-9_.]+)["']\s*,\s*`([^`${]*)`\s*,?\s*\)/g;
// t("key", `template ${…}`) — runtime-computed default: always provided,
// so the key can never leak. Exempt (a static catalog entry would
// OVERRIDE the computed text — do not add one).
const DYNAMIC_DEFAULT_RE =
	/\bt\(\s*["']([A-Za-z0-9_.]+)["']\s*,\s*`[^`]*\$\{[^`]*`\s*,?\s*\)/g;
// t("key", { defaultValue: <expr>, ... }) — static when <expr> is a
// quoted literal (counts as a default); dynamic otherwise (template with
// ${…}, variable, concatenation) which is always provided at runtime and
// therefore exempt — a static catalog entry would OVERRIDE it.
const DV_ANY_RE =
	/\bt\(\s*["']([A-Za-z0-9_.]+)["']\s*,\s*\{\s*defaultValue\s*:\s*([^}]{1,300}?)\s*[,}]/gs;
// Key-holder properties (labelKey, titleKey, …) later passed to t().
// These never appear as a direct t() call, so KEY_RE alone misses them —
// which is how settings.tabs.workspace leaked the raw key into the rail.
const KEY_PROP_RE =
	/\b(?:labelKey|titleKey|descriptionKey|subtitleKey|ariaKey|tooltipKey|placeholderKey)\s*:\s*["']([A-Za-z0-9_.]+)["']/g;

describe("i18n keys", () => {
	it("every used key resolves in the English catalog", () => {
		const defined = new Set<string>();
		flatten(en, "", defined);
		const used = new Map<string, number>();
		const withStaticDefault = new Set<string>();
		const dynamicallyDefaulted = new Set<string>();

		for (const [file, text] of Object.entries(SOURCES)) {
			if (file.includes(".test.")) {
				continue;
			}
			for (const re of [KEY_RE, KEY_PROP_RE, STR_DEFAULT_RE, DV_DEFAULT_RE, BT_DEFAULT_RE]) {
				re.lastIndex = 0;
				for (const m of text.matchAll(re)) {
					const key = m[1];
					if (key) {
						used.set(key, (used.get(key) ?? 0) + 1);
					}
				}
			}
			for (const re of [STR_DEFAULT_RE, DV_DEFAULT_RE, BT_DEFAULT_RE]) {
				re.lastIndex = 0;
				for (const m of text.matchAll(re)) {
					if (m[1]) {
						withStaticDefault.add(m[1]);
					}
				}
			}
			DV_ANY_RE.lastIndex = 0;
			for (const m of text.matchAll(DV_ANY_RE)) {
				const key = m[1];
				const expr = (m[2] ?? "").trim();
				if (!key) {
					continue;
				}
				const isQuoted =
					expr.length >= 2 &&
					((expr.startsWith('"') && expr.endsWith('"')) ||
						(expr.startsWith("'") && expr.endsWith("'")) ||
						(expr.startsWith("`") && expr.endsWith("`")));
				if (isQuoted && !expr.includes("${")) {
					withStaticDefault.add(key);
				} else {
					dynamicallyDefaulted.add(key);
				}
			}
			DYNAMIC_DEFAULT_RE.lastIndex = 0;
			for (const m of text.matchAll(DYNAMIC_DEFAULT_RE)) {
				if (m[1]) {
					dynamicallyDefaulted.add(m[1]);
				}
			}
		}

		const unresolved = [...used.keys()].filter(
			(key) =>
				!defined.has(key) &&
				!defined.has(`${key}_one`) &&
				!defined.has(`${key}_other`) &&
				!withStaticDefault.has(key) &&
				!dynamicallyDefaulted.has(key),
		);
		expect(unresolved).toEqual([]);
	});
});
