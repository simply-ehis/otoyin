import { useEffect, useState } from "react";

/**
 * Display-side regional pricing: catalog prices are canonical USD, but
 * shoppers shouldn't all see dollar tags. The browser locale picks the
 * display currency (no IP tracking, no new server state), FX rates come
 * from frankfurter.dev (CORS-open, keyless) with a 24h localStorage cache,
 * and anything failing silently falls back to USD.
 *
 * This is DISPLAY ONLY — Paddle localizes and collects the actual charge
 * at checkout (and computes the real tax). Donations stay USD for the
 * same reason: the donor is charged dollars regardless of display.
 */

const REGION_CURRENCY: Record<string, string> = {
	US: "USD",
	GB: "GBP",
	NG: "NGN",
	ZA: "ZAR",
	KE: "KES",
	GH: "GHS",
	IN: "INR",
	BR: "BRL",
	MX: "MXN",
	JP: "JPY",
	CN: "CNY",
	KR: "KRW",
	DE: "EUR",
	FR: "EUR",
	ES: "EUR",
	IT: "EUR",
	NL: "EUR",
	PT: "EUR",
	PL: "PLN",
	SE: "SEK",
	NO: "NOK",
	DK: "DKK",
	CH: "CHF",
	AU: "AUD",
	CA: "CAD",
	NZ: "NZD",
	SG: "SGD",
	AE: "AED",
	TR: "TRY",
	AR: "ARS",
	CL: "CLP",
	CO: "COP",
};

const RATES_KEY = "otoyin:fx-rates";
const RATES_TTL_MS = 24 * 3600 * 1000;

export interface FxState {
	/** ISO currency for display (USD when unknown/offline). */
	currency: string;
	/** USD→currency multiplier, 1 for USD. */
	rate: number;
	/** BCP47 tag used for number formatting. */
	locale: string;
}

export function regionForLocale(locale: string): string {
	const tag = locale.replace("_", "-");
	const parts = tag.split("-");
	const last = parts[parts.length - 1] ?? "";
	// "pt-BR" → BR, "de" → DE (language-only tags map to their home region
	// for the languages we ship; unknown → US).
	if (last.length === 2 && last === last.toUpperCase()) {
		return last;
	}
	const home: Record<string, string> = {
		de: "DE",
		fr: "FR",
		es: "ES",
		ko: "KR",
		ja: "JP",
		pt: "BR",
		en: "US",
	};
	return home[parts[0]?.toLowerCase() ?? ""] ?? "US";
}

export function currencyForLocale(locale: string): string {
	return REGION_CURRENCY[regionForLocale(locale)] ?? "USD";
}

export function convertUsd(amountUsd: number, rate: number): number {
	return amountUsd * rate;
}

export function formatMoney(
	amount: number,
	currency: string,
	locale: string,
): string {
	try {
		return new Intl.NumberFormat(locale, {
			style: "currency",
			currency,
			maximumFractionDigits: amount >= 1000 ? 0 : 2,
		}).format(amount);
	} catch {
		return `$${amount.toFixed(2)}`;
	}
}

interface CachedRates {
	at: number;
	base: string;
	rates: Record<string, number>;
}

function readCachedRates(): Record<string, number> | null {
	try {
		const raw = localStorage.getItem(RATES_KEY);
		if (!raw) {
			return null;
		}
		const cached = JSON.parse(raw) as CachedRates;
		if (
			cached.base !== "USD" ||
			typeof cached.at !== "number" ||
			Date.now() - cached.at > RATES_TTL_MS
		) {
			return null;
		}
		return cached.rates;
	} catch {
		return null;
	}
}

// Module-level shared fetch: every mounted price tag awaits the same
// promise, so N products still cost one network request.
let inflight: Promise<Record<string, number>> | null = null;

async function fetchRates(): Promise<Record<string, number>> {
	if (!inflight) {
		inflight = (async () => {
			try {
				const cached = readCachedRates();
				if (cached) {
					return cached;
				}
				const resp = await fetch(
					"https://api.frankfurter.dev/v1/latest?base=USD",
					{ signal: AbortSignal.timeout(8000) },
				);
				if (!resp.ok) {
					throw new Error(`rates HTTP ${resp.status}`);
				}
				const data = (await resp.json()) as {
					rates?: Record<string, number>;
				};
				const rates = data.rates ?? {};
				try {
					localStorage.setItem(
						RATES_KEY,
						JSON.stringify({ at: Date.now(), base: "USD", rates }),
					);
				} catch {
					// Private mode / quota — in-memory promise still dedupes.
				}
				return rates;
			} catch {
				return {};
			} finally {
				// Reset on failure so a later mount retries; on success the
				// localStorage cache serves future sessions.
				const p = inflight;
				queueMicrotask(() => {
					if (inflight === p) {
						inflight = null;
					}
				});
			}
		})();
	}
	return inflight;
}

/**
 * Display currency for the shopper. Resolves locale → currency
 * synchronously, then upgrades USD→local once rates arrive (or stays USD
 * offline). Safe to call from any number of price tags.
 */
export function useRegionCurrency(): FxState {
	const [locale] = useState(
		() =>
			(typeof navigator !== "undefined" && navigator.language) || "en-US",
	);
	const currency = currencyForLocale(locale);
	const [rate, setRate] = useState(1);

	useEffect(() => {
		if (currency === "USD") {
			return;
		}
		let live = true;
		void fetchRates().then((rates) => {
			const next = rates[currency];
			if (live && typeof next === "number" && next > 0) {
				setRate(next);
			}
		});
		return () => {
			live = false;
		};
	}, [currency]);

	return { currency, rate, locale };
}
