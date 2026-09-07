/**
 * License-poll recovery tests — a timed-out checkout can re-poll the same
 * order (backend keeps paid orders queryable), so slow payers are never
 * asked to pay twice.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { marketplaceClient } from "@/lib/marketplace";

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

async function settlePoll<T>(promise: Promise<T>): Promise<T> {
	// Drive the 5s poll cadence with fake timers until it settles.
	for (let i = 0; i < 65; i++) {
		await vi.advanceTimersByTimeAsync(5000);
	}
	return promise;
}

describe("pollForLicense recovery", () => {
	it("returns the license when payment lands mid-poll", async () => {
		vi.useFakeTimers();
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse(402, { detail: "pending" }))
			.mockResolvedValueOnce(jsonResponse(402, { detail: "pending" }))
			.mockResolvedValueOnce(
				jsonResponse(200, { product_id: "qwen3-tts", signature: "sig" }),
			);
		vi.stubGlobal("fetch", fetchMock);
		const license = await settlePoll(
			marketplaceClient.pollForLicense("otoyin_abc"),
		);
		expect(license).toMatchObject({ product_id: "qwen3-tts" });
		expect(fetchMock).toHaveBeenCalledTimes(3);
		expect(vi.mocked(fetchMock).mock.calls[0]?.[0]).toContain("otoyin_abc");
	});

	it("a second pollForLicense call re-checks the same still-open order", async () => {
		vi.useFakeTimers();
		const licenseBody = { product_id: "qwen3-tts", signature: "sig" };
		const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, licenseBody));
		vi.stubGlobal("fetch", fetchMock);
		// Simulates the "Check again" button: brand-new poll, same order ref.
		const license = await settlePoll(
			marketplaceClient.pollForLicense("otoyin_still_open"),
		);
		expect(license).toMatchObject(licenseBody);
		expect(vi.mocked(fetchMock).mock.calls[0]?.[0]).toContain(
			"otoyin_still_open",
		);
	});

	it("non-402 failures still surface immediately", async () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(jsonResponse(404, { detail: "gone" })),
		);
		const pending = marketplaceClient.pollForLicense("otoyin_nope");
		// Attach the rejection assertion synchronously so the rejection is
		// handled even if it settles before the clock advance below.
		const assertion = expect(pending).rejects.toThrow(
			"License fetch failed: 404",
		);
		await vi.advanceTimersByTimeAsync(5000);
		await assertion;
	});
});
