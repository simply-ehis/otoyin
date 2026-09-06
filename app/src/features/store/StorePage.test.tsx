/**
 * StorePage tests — remote-catalog refresh failure hint (outage UX).
 *
 * The backend reports `{refreshed: false, reason: "failed"}` when the
 * marketplace is unreachable; the Store must surface that as a subtle,
 * dismissible, non-blocking hint (never a modal, never silent), keep
 * showing the last synced catalog, and clear the hint on the next
 * successful check. Network clients are mocked at the apiClient boundary;
 * everything else (queries, mutations, hint rendering) is real.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/lib/api/client";
import type { Catalog, MarketplaceProduct } from "@/lib/api/types";
import { StorePage } from "./StorePage";

vi.mock("@/lib/api/client", () => ({
	apiClient: {
		getCatalog: vi.fn(),
		refreshCatalog: vi.fn(),
		getEntitlements: vi.fn(),
		getModelStatus: vi.fn(),
		getActiveTasks: vi.fn(),
		getModelsCacheDir: vi.fn(),
		getLicenses: vi.fn(),
		getMarketplaceOffers: vi.fn(),
		installLicense: vi.fn(),
		triggerModelDownload: vi.fn(),
		loadModel: vi.fn(),
		cancelDownload: vi.fn(),
		deleteModel: vi.fn(),
		clearAllTasks: vi.fn(),
	},
}));

vi.mock("@/lib/marketplace", () => ({
	getDeviceId: () => "device-test",
	openExternalUrl: vi.fn().mockResolvedValue(undefined),
	marketplaceClient: {
		fetchCatalog: vi.fn(),
		fetchReviews: vi.fn(),
		postReview: vi.fn(),
		createCheckout: vi.fn(),
		pollForLicense: vi.fn(),
		installLicense: vi.fn(),
		previewTax: vi.fn(),
		fetchWishlist: vi.fn(),
		addWishlist: vi.fn(),
		removeWishlist: vi.fn(),
		createDonation: vi.fn(),
	},
}));

import { marketplaceClient } from "@/lib/marketplace";

const mockedApi = {
	getCatalog: vi.mocked(apiClient.getCatalog),
	refreshCatalog: vi.mocked(apiClient.refreshCatalog),
	getEntitlements: vi.mocked(apiClient.getEntitlements),
	getModelStatus: vi.mocked(apiClient.getModelStatus),
	getActiveTasks: vi.mocked(apiClient.getActiveTasks),
	getModelsCacheDir: vi.mocked(apiClient.getModelsCacheDir),
	getLicenses: vi.mocked(apiClient.getLicenses),
	getMarketplaceOffers: vi.mocked(apiClient.getMarketplaceOffers),
};
const mockedWishlist = vi.mocked(marketplaceClient.fetchWishlist);

const product: MarketplaceProduct = {
	id: "kokoro-onnx",
	name: "Kokoro 82M",
	category: "tts",
	description: "Default otoyin voice",
	price_usd: 0,
	paid: false,
	note: "",
	special_offer: false,
	offer_discount_pct: 0,
	quality_score: 8,
};

const catalog: Catalog = {
	schema_version: 1,
	signed_at: "2026-09-05T00:00:00+00:00",
	currency: "USD",
	products: [product],
};

/** Substring of REFRESH_FAILED_HINT — stable enough to assert on. */
const HINT_FRAGMENT = /showing the last synced version/i;

function renderPage() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false, gcTime: 0, staleTime: 0 },
			mutations: { retry: false },
		},
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<StorePage />
		</QueryClientProvider>,
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	mockedApi.getCatalog.mockResolvedValue(catalog);
	mockedApi.getEntitlements.mockResolvedValue({ entitlements: [] });
	mockedApi.getModelStatus.mockResolvedValue({ models: [] });
	mockedApi.getActiveTasks.mockResolvedValue({
		downloads: [],
		generations: [],
	});
	mockedApi.getModelsCacheDir.mockResolvedValue({ path: "C:/models" });
	mockedApi.getLicenses.mockResolvedValue({ licenses: [] });
	mockedApi.getMarketplaceOffers.mockResolvedValue([]);
	mockedWishlist.mockResolvedValue({ product_ids: [] });
});

describe("StorePage refresh-failure hint", () => {
	it("shows the dismissible hint when the Store-open nudge reports a failed refresh", async () => {
		mockedApi.refreshCatalog.mockResolvedValue({
			refreshed: false,
			reason: "failed",
		});

		renderPage();

		// Hint appears (async — the nudge fires in an effect), catalog still rendered.
		expect(await screen.findByText(HINT_FRAGMENT)).toBeInTheDocument();
		expect(screen.getAllByText("Kokoro 82M").length).toBeGreaterThan(0);

		// Dismissible.
		await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
		await waitFor(() =>
			expect(screen.queryByText(HINT_FRAGMENT)).not.toBeInTheDocument(),
		);
	});

	it("keeps the last synced catalog and stays non-blocking while degraded", async () => {
		mockedApi.refreshCatalog.mockResolvedValue({
			refreshed: false,
			reason: "failed",
		});

		renderPage();

		// The grid renders the (stale but valid) catalog alongside the hint.
		expect(await screen.findByText(HINT_FRAGMENT)).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /check for updates/i }),
		).toBeEnabled();
	});

	it("clears the hint on the next successful check", async () => {
		// Store-open nudge fails; the manual check then succeeds.
		mockedApi.refreshCatalog
			.mockResolvedValueOnce({ refreshed: false, reason: "failed" })
			.mockResolvedValue({ refreshed: true, reason: null });

		const user = userEvent.setup();
		renderPage();

		expect(await screen.findByText(HINT_FRAGMENT)).toBeInTheDocument();

		await user.click(
			screen.getByRole("button", { name: /check for updates/i }),
		);

		await waitFor(() =>
			expect(screen.queryByText(HINT_FRAGMENT)).not.toBeInTheDocument(),
		);
		// Exactly two refresh calls: the mount nudge + the manual check.
		expect(mockedApi.refreshCatalog).toHaveBeenCalledTimes(2);
		expect(mockedApi.refreshCatalog).toHaveBeenLastCalledWith(true);
	});

	it("shows the hint when the refresh request itself rejects (network down)", async () => {
		mockedApi.refreshCatalog.mockRejectedValue(
			new Error("fetch failed: connection refused"),
		);

		renderPage();

		expect(await screen.findByText(HINT_FRAGMENT)).toBeInTheDocument();
	});
});
