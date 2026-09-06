/**
 * HintBanner tests — the Store's shared dismissible failure hint.
 *
 * The pattern contract: warning-soft surface with warning text, a single
 * dismiss control (title + aria-label "Dismiss"), message rendered verbatim,
 * dismiss calls back once.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HintBanner } from "./HintBanner";

describe("HintBanner", () => {
	it("renders the message verbatim", () => {
		render(<HintBanner message="Something failed." onDismiss={() => {}} />);
		expect(screen.getByText("Something failed.")).toBeInTheDocument();
	});

	it("renders the warning icon accessibly (decorative, banner carries the text)", () => {
		const { container } = render(
			<HintBanner message="Something failed." onDismiss={() => {}} />,
		);
		expect(container.querySelector("svg")).toBeInTheDocument();
	});

	it("calls onDismiss when the dismiss button is clicked", async () => {
		const user = userEvent.setup();
		const onDismiss = vi.fn();
		render(<HintBanner message="Something failed." onDismiss={onDismiss} />);
		const dismiss = screen.getByRole("button", { name: "Dismiss" });
		await user.click(dismiss);
		expect(onDismiss).toHaveBeenCalledTimes(1);
	});

	it("dismiss control has both title and aria-label", () => {
		render(<HintBanner message="x" onDismiss={() => {}} />);
		const dismiss = screen.getByRole("button", { name: "Dismiss" });
		expect(dismiss).toHaveAttribute("title", "Dismiss");
		expect(dismiss).toHaveAttribute("aria-label", "Dismiss");
	});
});
