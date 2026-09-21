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
	triggerModelDownload: vi.mocked(apiClient.triggerModelDownload),
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

describe("StorePage end-to-end wiring", () => {
	// Four products covering every card state through a different signal:
	//  - kokoro: installed via /models/status `downloaded` (no local_status
	//    in the catalog — exercises the live model-status path)
	//  - pocket-tts-free: free, needs download -> "Free" chip
	//  - neutts-air: paid but entitled via entitlements -> "Owned" chip
	//  - whisper-tiny: paid, not owned -> price chip, needs download
	const kokoro: MarketplaceProduct = {
		id: "kokoro-onnx",
		name: "Kokoro 82M",
		category: "tts",
		description: "Default otoyin voice",
		price_usd: 0,
		paid: false,
		note: "",
		special_offer: false,
		offer_discount_pct: 0,
	};
	const pocket: MarketplaceProduct = {
		...kokoro,
		id: "pocket-tts-free",
		name: "Pocket TTS",
	};
	const neutts: MarketplaceProduct = {
		...kokoro,
		id: "neutts-air",
		name: "NeuTTS Air",
		price_usd: 9,
		paid: true,
	};
	const whisper: MarketplaceProduct = {
		...kokoro,
		id: "whisper-tiny",
		name: "Whisper Tiny",
		category: "stt",
		price_usd: 3,
		paid: true,
	};

	function wireCatalog() {
		mockedApi.getCatalog.mockResolvedValue({
			...catalog,
			products: [kokoro, pocket, neutts, whisper],
		});
		mockedApi.getModelStatus.mockResolvedValue({
			models: [
				{
					model_name: "kokoro-onnx",
					display_name: "Kokoro 82M",
					downloaded: true,
					downloading: false,
					loaded: false,
				},
				{
					model_name: "whisper-tiny",
					display_name: "Whisper Tiny",
					downloaded: false,
					downloading: false,
					loaded: false,
				},
			],
		});
		mockedApi.getEntitlements.mockResolvedValue({
			entitlements: ["models:neutts-air"],
		});
	}

	it("renders hero counts, per-product state chips, and the failure hint from the mocked queries", async () => {
		wireCatalog();
		// Refresh fails: the hint must coexist with a fully wired grid + hero.
		mockedApi.refreshCatalog.mockResolvedValue({
			refreshed: false,
			reason: "failed",
		});

		renderPage();

		// Hero aggregates from the catalog + model-status queries.
		expect(await screen.findByText(/4 models/)).toBeInTheDocument();
		expect(screen.getByText(/2 free, 2 one-time paid/)).toBeInTheDocument();
		expect(screen.getByText(/1 installed on this device/)).toBeInTheDocument();
		// Cache-dir query wired into the hero.
		expect(screen.getByText("C:/models")).toBeInTheDocument();

		// Grid renders every state chip from the right signal.
		expect(screen.getAllByText("Installed").length).toBeGreaterThan(0); // kokoro: model-status downloaded
		expect(screen.getAllByText("Owned").length).toBeGreaterThan(0); // neutts: entitlements
		expect(screen.getAllByText("Free").length).toBeGreaterThan(0); // pocket: free, not installed
		expect(screen.getAllByText("$3").length).toBeGreaterThan(0); // whisper: paid, not owned

		// The refresh-failure hint renders alongside the wired grid.
		expect(screen.getByText(HINT_FRAGMENT)).toBeInTheDocument();
	});

	it("orders the grid installed/owned-first, free-before-paid", async () => {
		wireCatalog();
		mockedApi.refreshCatalog.mockResolvedValue({
			refreshed: false,
			reason: "failed",
		});

		renderPage();
		await screen.findByText("C:/models");

		// Default sort contract: installed||owned group first (free before
		// paid inside it: kokoro q8 > neutts q7), then the rest (pocket
		// before whisper).
		const order = ["Kokoro 82M", "NeuTTS Air", "Pocket TTS", "Whisper Tiny"];
		const elements = order
			.map((n) => screen.getAllByText(n)[0])
			.filter((el): el is HTMLElement => el !== undefined);
		expect(elements).toHaveLength(order.length);
		for (let i = 0; i < elements.length - 1; i++) {
			expect(
				elements[i].compareDocumentPosition(elements[i + 1]) &
					Node.DOCUMENT_POSITION_FOLLOWING,
			).toBeTruthy();
		}
	});

	it("narrows the grid via search while hero counts stay catalog-wide", async () => {
		wireCatalog();
		mockedApi.refreshCatalog.mockResolvedValue({
			refreshed: false,
			reason: "failed",
		});

		const user = userEvent.setup();
		renderPage();
		await screen.findByText("C:/models");

		await user.type(
			screen.getByRole("textbox", { name: "Search models" }),
			"whisper",
		);

		await waitFor(() =>
			expect(screen.queryByText("Kokoro 82M")).not.toBeInTheDocument(),
		);
		expect(screen.getAllByText("Whisper Tiny").length).toBeGreaterThan(0);
		// Hero still describes the whole catalog, not the filtered view.
		expect(screen.getByText(/4 models/)).toBeInTheDocument();
	});
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

describe("StorePage failed-download hint + retry", () => {
	/** Wire one catalog product and a matching errored download task. */
	function wireFailedDownload() {
		mockedApi.getCatalog.mockResolvedValue({
			...catalog,
			products: [product],
		});
		mockedApi.getActiveTasks.mockResolvedValue({
			downloads: [
				{
					model_name: "kokoro-onnx",
					status: "error",
					started_at: "2026-09-06T00:00:00Z",
					error: "disk full",
				},
			],
			generations: [],
		});
	}

	it("surfaces failed downloads in the hint banner with a Retry action", async () => {
		wireFailedDownload();
		mockedApi.triggerModelDownload.mockResolvedValue({ message: "ok" });

		renderPage();

		// The failure hint appears with the model name in the message.
		expect(
			await screen.findByText(/1 download failed: kokoro-onnx/),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
	});

	it("Retry re-triggers the failed download through the download mutation", async () => {
		wireFailedDownload();
		mockedApi.triggerModelDownload.mockResolvedValue({ message: "ok" });
		// A real successful retry clears/restarts the task: first fetch reports
		// the errored task, the post-retry refetch reports it gone.
		mockedApi.getActiveTasks
			.mockResolvedValueOnce({
				downloads: [
					{
						model_name: "kokoro-onnx",
						status: "error",
						started_at: "2026-09-06T00:00:00Z",
						error: "disk full",
					},
				],
				generations: [],
			})
			.mockResolvedValue({ downloads: [], generations: [] });

		const user = userEvent.setup();
		renderPage();
		await screen.findByText(/1 download failed: kokoro-onnx/);

		await user.click(screen.getByRole("button", { name: "Retry" }));

		await waitFor(() =>
			expect(mockedApi.triggerModelDownload).toHaveBeenCalledWith(
				"kokoro-onnx",
			),
		);
		// The mutation's success path refreshes the task list; the errored
		// task is gone, so the hint clears (next-success contract).
		await waitFor(() =>
			expect(
				screen.queryByText(/1 download failed: kokoro-onnx/),
			).not.toBeInTheDocument(),
		);
	});

	it("Retry keeps the hint and re-arms it when the re-trigger fails again", async () => {
		wireFailedDownload();
		mockedApi.triggerModelDownload.mockRejectedValue(
			new Error("still no disk space"),
		);

		const user = userEvent.setup();
		renderPage();
		await screen.findByText(/1 download failed: kokoro-onnx/);

		await user.click(screen.getByRole("button", { name: "Retry" }));

		// Failure path re-sets the download-start hint (still non-blocking).
		await waitFor(() =>
			expect(
				screen.getByText(/couldn't be started.*still no disk space/is),
			).toBeInTheDocument(),
		);
		// And the failed-task hint survives beside it.
		expect(
			screen.getByText(/1 download failed: kokoro-onnx/),
		).toBeInTheDocument();
	});
});
