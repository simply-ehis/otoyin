import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Per-product catalog introduction tracking for the Store's "New" badge.
 *
 * `firstSeenAt` records the `signed_at` of the first catalog document in
 * which each product id appeared. A product is "New" while the catalog it
 * arrived in is newer than `lastSeenCatalogAt` — the marker the user sets
 * by browsing the Store (and which every Store open re-advances). Products
 * that were present on first launch ever are never "New": their
 * introduction equals the initial marker, not something after it.
 */
interface ProductCatalogState {
	/** product id -> signed_at of the catalog it first appeared in. */
	firstSeenAt: Record<string, string>;
	/** signed_at of the newest catalog the user has laid eyes on. */
	lastSeenCatalogAt: string;
	recordProducts: (signedAt: string, productIds: string[]) => void;
	markCatalogSeen: (signedAt: string) => void;
}

export const useProductStore = create<ProductCatalogState>()(
	persist(
		(set) => ({
			firstSeenAt: {},
			lastSeenCatalogAt: "",
			recordProducts: (signedAt, productIds) =>
				set((s) => {
					const next = { ...s.firstSeenAt };
					let changed = false;
					for (const id of productIds) {
						if (!next[id]) {
							next[id] = signedAt;
							changed = true;
						}
					}
					return changed ? { firstSeenAt: next } : s;
				}),
			markCatalogSeen: (signedAt) =>
				set((s) =>
					s.lastSeenCatalogAt === signedAt
						? s
						: { lastSeenCatalogAt: signedAt },
				),
		}),
		{ name: "Otoyin-products" },
	),
);

/**
 * True when the product's *introduction* catalog is newer than the last seen
 * one. NOTE: the backend re-stamps `signed_at` on every catalog fetch, so the
 * current document's stamp must never be used as the introduction time — only
 * the recorded `firstSeenAt` (the first fetch in which the id appeared) is
 * stable enough to compare against the marker.
 */
export function isProductNew(
	introducedAt: string | undefined,
	lastSeenCatalogAt: string,
): boolean {
	if (!introducedAt || !lastSeenCatalogAt) {
		return false;
	}
	const intro = new Date(introducedAt).getTime();
	const seen = new Date(lastSeenCatalogAt).getTime();
	if (!Number.isFinite(intro) || !Number.isFinite(seen)) {
		return false;
	}
	return intro > seen;
}
