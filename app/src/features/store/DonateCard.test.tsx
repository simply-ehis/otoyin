/**
 * DonateCard tests — custom-amount donations without a catalog product.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DonateCard } from "./DonateCard";

vi.mock("@/lib/marketplace", () => ({
	getDeviceId: () => "dev-test",
	getLicenseDeviceId: async () => "dev-test",
	openExternalUrl: vi.fn().mockResolvedValue(undefined),
	marketplaceClient: {
		createDonation: vi.fn(),
		pollForLicense: vi.fn(),
	},
}));

import { marketplaceClient } from "@/lib/marketplace";

const mocked = {
	createDonation: vi.mocked(marketplaceClient.createDonation),
	pollForLicense: vi.mocked(marketplaceClient.pollForLicense),
};

describe("DonateCard", () => {
	it("renders presets and reflects the picked amount", async () => {
		const user = userEvent.setup();
		render(<DonateCard />);
		expect(
			screen.getByRole("heading", { name: /support otoyin/i }),
		).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "$25" }));
		expect(
			screen.getByRole("button", { name: "Donate $25" }),
		).toBeInTheDocument();
	});

	it("rejects an invalid custom amount without calling checkout", async () => {
		const user = userEvent.setup();
		mocked.createDonation.mockClear();
		render(<DonateCard />);
		await user.clear(screen.getByLabelText("Custom amount (USD)"));
		await user.type(screen.getByLabelText("Custom amount (USD)"), "abc");
		await user.click(screen.getByRole("button", { name: /^Donate/ }));
		expect(mocked.createDonation).not.toHaveBeenCalled();
	});

	it("completes checkout → poll → thank-you with no license involved", async () => {
		const user = userEvent.setup();
		mocked.createDonation.mockResolvedValue({
			order_ref: "otoyin_d1",
			checkout_url: "https://pay.example/d1",
			amount_usd: 25,
			donation: true,
		});
		mocked.pollForLicense.mockResolvedValue({
			donated: true,
			order_ref: "otoyin_d1",
			amount_usd: 25,
		});
		render(<DonateCard />);
		await user.click(screen.getByRole("button", { name: "$25" }));
		await user.click(screen.getByRole("button", { name: "Donate $25" }));
		expect(mocked.createDonation).toHaveBeenCalledWith(25, "dev-test", "");
		expect(
			await screen.findByText(/thank you for the \$25\.00/i),
		).toBeInTheDocument();
	});
});
