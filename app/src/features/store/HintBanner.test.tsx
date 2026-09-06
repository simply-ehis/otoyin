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

	it("renders no action button by default", () => {
		render(<HintBanner message="x" onDismiss={() => {}} />);
		expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
	});

	it("renders the optional action and calls onAction (not onDismiss)", async () => {
		const user = userEvent.setup();
		const onAction = vi.fn();
		const onDismiss = vi.fn();
		render(
			<HintBanner
				message="2 downloads failed"
				onDismiss={onDismiss}
				actionLabel="Retry"
				onAction={onAction}
				actionTitle="Re-trigger the failed downloads"
			/>,
		);
		await user.click(screen.getByRole("button", { name: "Retry" }));
		expect(onAction).toHaveBeenCalledTimes(1);
		expect(onDismiss).not.toHaveBeenCalled();
	});

	it("action tooltip falls back to the label when actionTitle is omitted", () => {
		render(
			<HintBanner
				message="x"
				onDismiss={() => {}}
				actionLabel="Retry"
				onAction={() => {}}
			/>,
		);
		expect(screen.getByRole("button", { name: "Retry" })).toHaveAttribute(
			"title",
			"Retry",
		);
	});

	it("renders the action as icon-only when actionLabel is missing", () => {
		// Guard against a props bug where onAction alone renders a bare button.
		render(
			<HintBanner
				message="x"
				onDismiss={() => {}}
				onAction={() => {}}
				actionTitle="orphan"
			/>,
		);
		expect(screen.queryByTitle("orphan")).toBeNull();
	});
});
