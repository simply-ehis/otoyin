/**
 * Regional pricing tests — locale→currency mapping, conversion math,
 * Intl formatting, and the hook's offline/cache behavior.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	convertUsd,
	currencyForLocale,
	formatMoney,
	regionForLocale,
	useRegionCurrency,
} from "@/lib/regionCurrency";

function setNavigatorLanguage(value: string) {
	Object.defineProperty(window.navigator, "language", {
		value,
		configurable: true,
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
	localStorage.clear();
});

describe("regionForLocale", () => {
	it("maps region tags and home languages", () => {
		expect(regionForLocale("de-DE")).toBe("DE");
		expect(regionForLocale("pt-BR")).toBe("BR");
		expect(regionForLocale("ko-KR")).toBe("KR");
		expect(regionForLocale("en-US")).toBe("US");
		expect(regionForLocale("de")).toBe("DE");
		expect(regionForLocale("ko")).toBe("KR");
		expect(regionForLocale("it")).toBe("US");
		expect(regionForLocale("")).toBe("US");
	});
});

describe("currencyForLocale", () => {
	it("covers the shipped locales plus buyer markets", () => {
		expect(currencyForLocale("de-DE")).toBe("EUR");
		expect(currencyForLocale("fr-FR")).toBe("EUR");
		expect(currencyForLocale("es-ES")).toBe("EUR");
		expect(currencyForLocale("pt-BR")).toBe("BRL");
		expect(currencyForLocale("ko-KR")).toBe("KRW");
		expect(currencyForLocale("ja-JP")).toBe("JPY");
		expect(currencyForLocale("en-NG")).toBe("NGN");
		expect(currencyForLocale("xx-YY")).toBe("USD");
	});
});

describe("convertUsd + formatMoney", () => {
	it("multiplies by the rate", () => {
		expect(convertUsd(15, 0.92)).toBeCloseTo(13.8);
	});

	it("formats per locale with the right currency", () => {
		const eur = formatMoney(13.79, "EUR", "de-DE");
		expect(eur).toContain("€");
		const jpy = formatMoney(2200, "JPY", "ja-JP");
		expect(jpy).toContain("￥");
	});

	it("falls back to dollars on unknown currency", () => {
		expect(formatMoney(15, "XX", "en-US")).toBe("$15.00");
	});
});

describe("useRegionCurrency", () => {
	it("stays USD for US English without fetching", async () => {
		setNavigatorLanguage("en-US");
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const { result } = renderHook(() => useRegionCurrency());
		expect(result.current).toMatchObject({ currency: "USD", rate: 1 });
		await new Promise((r) => setTimeout(r, 20));
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("resolves EUR + rate for German once rates arrive", async () => {
		setNavigatorLanguage("de-DE");
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: () => Promise.resolve({ rates: { EUR: 0.92 } }),
			}),
		);
		const { result } = renderHook(() => useRegionCurrency());
		expect(result.current.currency).toBe("EUR");
		await waitFor(() => expect(result.current.rate).toBeCloseTo(0.92));
	});

	it("falls back to USD when rates fail", async () => {
		setNavigatorLanguage("pt-BR");
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
		const { result } = renderHook(() => useRegionCurrency());
		await new Promise((r) => setTimeout(r, 20));
		expect(result.current).toMatchObject({ currency: "BRL", rate: 1 });
	});

	it("serves a fresh localStorage cache without fetching", async () => {
		setNavigatorLanguage("fr-FR");
		localStorage.setItem(
			"otoyin:fx-rates",
			JSON.stringify({ at: Date.now(), base: "USD", rates: { EUR: 0.9 } }),
		);
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		const { result } = renderHook(() => useRegionCurrency());
		await waitFor(() => expect(result.current.rate).toBeCloseTo(0.9));
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
