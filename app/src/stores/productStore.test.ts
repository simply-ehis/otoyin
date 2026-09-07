import { beforeEach, describe, expect, it } from "vitest";
import { isProductNew, useProductStore } from "./productStore";
import { act } from "@testing-library/react";

/**
 * productStore tests — the "New" badge bookkeeping.
 *
 * The backend re-stamps catalog `signed_at` on every fetch, so the store
 * records per-product *introduction* stamps (first fetch in which the id
 * appeared) and the last-seen marker advances only when the user leaves the
 * Store. These tests pin both behaviors.
 */
describe("productStore — New badge bookkeeping", () => {
	beforeEach(() => {
		useProductStore.setState({ firstSeenAt: {}, lastSeenCatalogAt: "" });
	});

	it("records the first introduction stamp per product and ignores later ones", () => {
		const { recordProducts } = useProductStore.getState();
		act(() => {
			recordProducts("2026-09-01T00:00:00+00:00", ["alpha", "beta"]);
		});
		act(() => {
			recordProducts("2026-09-05T00:00:00+00:00", ["beta", "gamma"]);
		});
		const s = useProductStore.getState();
		// beta's introduction stays at its FIRST appearance, not the later fetch.
		expect(s.firstSeenAt.beta).toBe("2026-09-01T00:00:00+00:00");
		expect(s.firstSeenAt.gamma).toBe("2026-09-05T00:00:00+00:00");
	});

	it("isProductNew: introduced after the last seen marker", () => {
		expect(
			isProductNew("2026-09-05T00:00:00+00:00", "2026-09-01T00:00:00+00:00"),
		).toBe(true);
		expect(
			isProductNew("2026-09-01T00:00:00+00:00", "2026-09-05T00:00:00+00:00"),
		).toBe(false);
		// Same stamp = present at baseline, not new.
		expect(
			isProductNew("2026-09-01T00:00:00+00:00", "2026-09-01T00:00:00+00:00"),
		).toBe(false);
	});

	it("isProductNew: missing stamps or unparseable dates are never new", () => {
		expect(isProductNew(undefined, "2026-09-01T00:00:00+00:00")).toBe(false);
		expect(isProductNew("2026-09-05T00:00:00+00:00", "")).toBe(false);
		expect(isProductNew("not-a-date", "2026-09-01T00:00:00+00:00")).toBe(false);
	});

	it("markCatalogSeen advances the marker; baseline rules keep first-launch products unseen", () => {
		const s0 = useProductStore.getState();
		act(() => {
			// First ever Store open: baseline — record + mark in one step.
			s0.recordProducts("2026-09-01T00:00:00+00:00", ["kokoro"]);
			s0.markCatalogSeen("2026-09-01T00:00:00+00:00");
		});
		act(() => {
			// Later catalog introduces a new product…
			s0.recordProducts("2026-09-05T00:00:00+00:00", ["kokoro", "fresh"]);
		});
		const s1 = useProductStore.getState();
		// …which is New because its introduction postdates the marker.
		expect(isProductNew(s1.firstSeenAt.fresh, s1.lastSeenCatalogAt)).toBe(true);
		// …while the baseline product is not.
		expect(isProductNew(s1.firstSeenAt.kokoro, s1.lastSeenCatalogAt)).toBe(
			false,
		);
		act(() => {
			s1.markCatalogSeen("2026-09-05T00:00:00+00:00");
		});
		const s2 = useProductStore.getState();
		expect(isProductNew(s2.firstSeenAt.fresh, s2.lastSeenCatalogAt)).toBe(
			false,
		);
	});

	it("markCatalogSeen is idempotent for the same stamp", () => {
		const s = useProductStore.getState();
		act(() => {
			s.markCatalogSeen("2026-09-01T00:00:00+00:00");
		});
		act(() => {
			s.markCatalogSeen("2026-09-01T00:00:00+00:00");
		});
		expect(useProductStore.getState().lastSeenCatalogAt).toBe(
			"2026-09-01T00:00:00+00:00",
		);
	});
});
