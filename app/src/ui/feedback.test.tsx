/**
 * Canonical banner + state-block tests — render + interaction floor (14).
 *
 * Encodes desktop-ui-feedback-messaging rules: danger banners use role=alert,
 * others role=status (no focus theft); banners persist until dismissed;
 * every view covers empty/loading/error, and error retry is reachable.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Banner } from "./banner";
import { EmptyState, ErrorState, LoadingState } from "./states";

describe("Banner", () => {
	it("renders info tone as a polite status, not an alert", () => {
		render(<Banner tone="info">Update available next restart</Banner>);
		const status = screen.getByRole("status");
		expect(status).toHaveTextContent("Update available next restart");
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});

	it("renders danger tone as an assertive alert", () => {
		render(<Banner tone="danger">Render failed — disk full</Banner>);
		expect(screen.getByRole("alert")).toHaveTextContent(
			"Render failed — disk full",
		);
	});

	it("dismisses via a labeled, keyboard-reachable button", async () => {
		const user = userEvent.setup();
		const onDismiss = vi.fn();
		render(
			<Banner tone="warning" onDismiss={onDismiss}>
				Voice pack expiring
			</Banner>,
		);
		const dismiss = screen.getByRole("button", { name: "Dismiss" });
		dismiss.focus();
		expect(dismiss).toHaveFocus();
		expect(dismiss).toHaveAttribute("title", "Dismiss");
		await user.click(dismiss);
		expect(onDismiss).toHaveBeenCalledTimes(1);
	});

	it("renders no dismiss control when onDismiss is absent", () => {
		render(<Banner tone="success">Installed</Banner>);
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});
});

describe("EmptyState", () => {
	it("names what lives here and offers the filling action", async () => {
		const user = userEvent.setup();
		const onAdd = vi.fn();
		render(
			<EmptyState
				title="No voice profiles yet"
				body="Clone a voice to get started"
				action={
					<button type="button" onClick={onAdd}>
						New profile
					</button>
				}
			/>,
		);
		expect(screen.getByText("No voice profiles yet")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "New profile" }));
		expect(onAdd).toHaveBeenCalledTimes(1);
	});
});

describe("LoadingState", () => {
	it("announces itself as a status with the given label", () => {
		render(<LoadingState label="Loading voices" lines={2} />);
		const status = screen.getByRole("status", { name: "Loading voices" });
		expect(status).toBeInTheDocument();
		// Skeleton rows are decorative — hidden from assistive tech
		expect(status.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
	});
});

describe("ErrorState", () => {
	it("presents the failure as an alert with a working retry", async () => {
		const user = userEvent.setup();
		const onRetry = vi.fn();
		render(
			<ErrorState
				title="Couldn't load voices"
				body="Check the server and retry"
				onRetry={onRetry}
			/>,
		);
		expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load voices");
		await user.click(screen.getByRole("button", { name: "Retry" }));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it("omits retry when no handler is provided", () => {
		render(<ErrorState title="Boom" />);
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});
});
