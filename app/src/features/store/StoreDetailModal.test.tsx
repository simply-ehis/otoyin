/**
 * StoreDetailModal tests — detail-modal state chips + Activate action.
 *
 * Same proof floor as the ui/ library: mock the network clients (apiClient /
 * marketplaceClient), drive the dialog through a real QueryClient, and assert
 * the rendered chips and the one-step Activate ("Activate now") that cached
 * models expose.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/lib/api/client";
import type { Catalog, MarketplaceProduct } from "@/lib/api/types";
import { marketplaceClient } from "@/lib/marketplace";
import { StoreDetailModal } from "./StoreDetailModal";

function makeProduct(
	overrides: Partial<MarketplaceProduct> = {},
): MarketplaceProduct {
	return {
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
		...overrides,
	};
}

const product = makeProduct();

const catalog: Catalog = {
	schema_version: 1,
	signed_at: "2026-09-05T00:00:00+00:00",
	currency: "USD",
	products: [product],
};

vi.mock("@/lib/api/client", () => ({
	apiClient: {
		getCatalog: vi.fn(),
		installLicense: vi.fn(),
	},
}));

vi.mock("@/lib/marketplace", () => ({
	marketplaceClient: {
		fetchReviews: vi.fn(),
		postReview: vi.fn(),
		createCheckout: vi.fn(),
		pollForLicense: vi.fn(),
		installLicense: vi.fn(),
		previewTax: vi.fn(),
	},
	getDeviceId: () => "test-device",
	openExternalUrl: vi.fn(),
}));

vi.mock("@/lib/errors", () => ({
	showStudioErrorToast: vi.fn(),
}));

beforeEach(() => {
	vi.mocked(apiClient.getCatalog).mockResolvedValue(catalog);
	vi.mocked(marketplaceClient.fetchReviews).mockResolvedValue([]);
});

type ModalProps = React.ComponentProps<typeof StoreDetailModal>;

function renderModal(overrides: Partial<ModalProps> = {}) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<StoreDetailModal
				product={product}
				owned={false}
				installed={false}
				isDownloading={false}
				open
				onOpenChange={vi.fn()}
				onDownload={vi.fn()}
				onCancel={vi.fn()}
				onDelete={vi.fn()}
				{...overrides}
			/>
		</QueryClientProvider>,
	);
}

describe("StoreDetailModal — cached model", () => {
	it("renders the dialog with the Installed state and one-step Activate", () => {
		renderModal({ localStatus: "cached" });
		expect(
			screen.getByRole("dialog", { name: "Kokoro 82M" }),
		).toBeInTheDocument();
		expect(screen.getByText("Installed on this device.")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Activate now" }),
		).toBeInTheDocument();
	});

	it("fires onActivate with the product id", async () => {
		const user = userEvent.setup();
		const onActivate = vi.fn();
		renderModal({ localStatus: "cached", onActivate });
		await user.click(screen.getByRole("button", { name: "Activate now" }));
		expect(onActivate).toHaveBeenCalledWith("kokoro-onnx");
	});

	it("shows the pending activating state and blocks the button", () => {
		renderModal({ localStatus: "cached", activating: true });
		// Spinner contributes "Loading" to the accessible name.
		const btn = screen.getByRole("button", { name: /activating/i });
		expect(btn).toBeDisabled();
	});

	it("closes via the header Close button", async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();
		renderModal({ localStatus: "cached", onOpenChange });
		await user.click(screen.getByRole("button", { name: "Close" }));
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});
});

describe("StoreDetailModal — owned but not cached", () => {
	it("renders the Owned chip and routes to Install (download once)", () => {
		renderModal({ owned: true, localStatus: "not_downloaded" });
		expect(
			screen.getByText("Owned — install on this device"),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Install" })).toBeInTheDocument();
		// No Activate for a model that isn't on this device yet.
		expect(
			screen.queryByRole("button", { name: "Activate now" }),
		).not.toBeInTheDocument();
	});
});
