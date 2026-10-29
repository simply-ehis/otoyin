import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DonateCard } from "./DonateCard";

vi.mock("@/lib/api/client", () => ({
	apiClient: {
		cloudDonate: vi
			.fn()
			.mockResolvedValue({ checkout_url: "https://pay.example/d1" }),
	},
}));

describe("DonateCard", () => {
	it("renders the support heading", () => {
		render(<DonateCard />);
		expect(
			screen.getByRole("heading", { name: /support otoyin/i }),
		).toBeInTheDocument();
	});

	it("reflects the picked amount on the donate button", async () => {
		const user = userEvent.setup();
		render(<DonateCard />);
		await user.click(screen.getByRole("button", { name: "$25" }));
		expect(
			screen.getByRole("button", { name: /Donate \$25/i }),
		).toBeInTheDocument();
	});

	it("opens the donation link when clicked", async () => {
		const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
		const user = userEvent.setup();
		render(<DonateCard />);
		await user.click(screen.getByRole("button", { name: /Donate \$10/i }));
		expect(openSpy).toHaveBeenCalled();
		openSpy.mockRestore();
	});
});
