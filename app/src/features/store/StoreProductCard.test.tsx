/**
 * StoreProductCard tests — the three per-product states (06/07 Part C).
 *
 * Same proof floor as the ui/ library: render each state, pin the exact
 * design-token chips and the action bar each state exposes, and exercise
 * the one-step Activate + keyboard-accessible card body.
 *
 * The card derives its state as `cached = installed || localStatus ===
 * "cached"` and renders:
 *   - cached          -> "Installed" chip + Activate / Delete / Manage
 *   - owned && !cached -> "Owned" chip + Install (license verified locally)
 *   - !cached, !owned  -> needs download: price chip + Buy (paid) or
 *                         "Free" chip + Download
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MarketplaceProduct } from "@/lib/api/types";
import { StoreProductCard } from "./StoreProductCard";

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
		...overrides,
	};
}

function renderCard(
	product: MarketplaceProduct = makeProduct(),
	props: {
		owned?: boolean;
		installed?: boolean;
		localStatus?: "cached" | "not_downloaded";
		activating?: boolean;
		onActivate?: (id: string) => void;
	} = {},
) {
	return render(
		<StoreProductCard
			product={product}
			owned={props.owned ?? false}
			installed={props.installed ?? false}
			localStatus={props.localStatus}
			activating={props.activating}
			onActivate={props.onActivate}
			isDownloading={false}
			onDetail={vi.fn()}
		/>,
	);
}

describe("StoreProductCard — cached state (one-step Activate)", () => {
	it("renders the Installed chip + Activate/Delete/Manage actions from local_status", () => {
		renderCard(makeProduct(), { localStatus: "cached" });
		const chip = screen.getByText("Installed");
		expect(chip).toBeInTheDocument();
		// Design tokens: success chip, per the proof (07 Part C).
		expect(chip.className).toContain("bg-success-soft");
		expect(chip.className).toContain("border-success/40");
		expect(
			screen.getByRole("button", { name: "Activate" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /delete kokoro/i }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Manage" })).toBeInTheDocument();
	});

	it("treats the live installed signal as cached too (installed || localStatus)", () => {
		renderCard(makeProduct(), { installed: true });
		expect(screen.getByText("Installed")).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Activate" }),
		).toBeInTheDocument();
	});

	it("shows the pending activating state and blocks the button", () => {
		renderCard(makeProduct(), { localStatus: "cached", activating: true });
		// Spinner contributes "Loading" to the accessible name.
		const btn = screen.getByRole("button", { name: /activating/i });
		expect(btn).toBeDisabled();
	});

	it("fires onActivate with the product id", async () => {
		const user = userEvent.setup();
		const onActivate = vi.fn();
		renderCard(makeProduct(), { localStatus: "cached", onActivate });
		await user.click(screen.getByRole("button", { name: "Activate" }));
		expect(onActivate).toHaveBeenCalledWith("kokoro-onnx");
	});
});

describe("StoreProductCard — needs-download state", () => {
	it("renders the Free chip + Buy Free CTA for a free unowned model", () => {
		renderCard(makeProduct());
		const chip = screen.getByText("Free");
		expect(chip).toBeInTheDocument();
		expect(chip.className).toContain("bg-success-soft");
		expect(
			screen.getByRole("button", { name: "Buy Free" }),
		).toBeInTheDocument();
	});

	it("Buy Free routes into the detail/checkout modal (unowned installs go through checkout)", async () => {
		const user = userEvent.setup();
		const onDetail = vi.fn();
		render(
			<StoreProductCard
				product={makeProduct()}
				owned={false}
				installed={false}
				localStatus="not_downloaded"
				isDownloading={false}
				onDetail={onDetail}
			/>,
		);
		await user.click(screen.getByRole("button", { name: "Buy Free" }));
		expect(onDetail).toHaveBeenCalledWith(makeProduct());
	});
});

describe("StoreProductCard — card body", () => {
	it("opens detail from the card body via keyboard (role=button, Enter)", async () => {
		const user = userEvent.setup();
		const onDetail = vi.fn();
		render(
			<StoreProductCard
				product={makeProduct()}
				owned={false}
				installed={false}
				localStatus="not_downloaded"
				isDownloading={false}
				onDetail={onDetail}
			/>,
		);
		const body = screen.getByRole("button", { name: /kokoro 82m/i });
		body.focus();
		expect(body).toHaveFocus();
		await user.keyboard("{Enter}");
		expect(onDetail).toHaveBeenCalledWith(makeProduct());
	});
});

describe("StoreProductCard — New badge (info token family)", () => {
	function renderNewCard(product: MarketplaceProduct, isNew: boolean) {
		return render(
			<StoreProductCard
				product={product}
				owned={false}
				installed={false}
				isDownloading={false}
				isNew={isNew}
				onDetail={vi.fn()}
			/>,
		);
	}

	it("renders the New badge with the info token family for a new product", () => {
		renderNewCard(makeProduct(), true);
		const badge = screen.getByText("New");
		expect(badge).toBeInTheDocument();
		expect(badge.className).toContain("bg-info-soft");
		expect(badge.className).toContain("text-info-text");
		expect(badge.className).toContain("border-info/40");
	});

	it("renders no New badge for an existing product", () => {
		renderNewCard(makeProduct(), false);
		expect(screen.queryByText("New")).not.toBeInTheDocument();
	});

	it("keeps the New badge visible across all three product states", () => {
		// cached state + New
		const { unmount } = render(
			<StoreProductCard
				product={makeProduct()}
				owned={false}
				installed={false}
				localStatus="cached"
				isDownloading={false}
				isNew
				onDetail={vi.fn()}
			/>,
		);
		expect(screen.getByText("New")).toBeInTheDocument();
		expect(screen.getByText("Installed")).toBeInTheDocument();
		unmount();
		// owned-not-installed + New
		const ownedRender = render(
			<StoreProductCard
				product={makeProduct()}
				owned
				installed={false}
				isDownloading={false}
				isNew
				onDetail={vi.fn()}
			/>,
		);
		expect(screen.getByText("New")).toBeInTheDocument();
		ownedRender.unmount();
		// needs-download + New
		render(
			<StoreProductCard
				product={makeProduct()}
				owned={false}
				installed={false}
				isDownloading={false}
				isNew
				onDetail={vi.fn()}
			/>,
		);
		expect(screen.getByText("New")).toBeInTheDocument();
		expect(screen.getByText("Free")).toBeInTheDocument();
	});
});
