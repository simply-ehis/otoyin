/**
 * ErrorBoundary integration test — verifies that when a child component
 * throws during render, reportCrashToBackend is actually called (not just
 * wired and assumed working).
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "@/layouts/ErrorBoundary/ErrorBoundary";
import { apiClient } from "@/lib/api/client";

vi.mock("@/lib/api/client", () => ({
	apiClient: {
		reportCrash: vi.fn(),
	},
}));

beforeEach(() => {
	vi.mocked(apiClient.reportCrash).mockReset();
	vi.mocked(apiClient.reportCrash).mockResolvedValue({
		stored: true,
		id: "test-id",
	});
});

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
	if (shouldThrow) {
		throw new Error("kaboom");
	}
	return <div>child ok</div>;
}

describe("ErrorBoundary", () => {
	it("calls reportCrashToBackend when a child throws", () => {
		// Suppress console.error from the boundary's componentDidCatch
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});

		render(
			<ErrorBoundary>
				<ThrowingChild shouldThrow />
			</ErrorBoundary>,
		);

		// The crash screen should be visible
		expect(screen.getByText("Unexpected Glitch")).toBeInTheDocument();

		// reportCrashToBackend should have been called (via apiClient.reportCrash)
		expect(apiClient.reportCrash).toHaveBeenCalledTimes(1);
		const payload = vi.mocked(apiClient.reportCrash).mock.calls[0][0];
		expect(payload.layer).toBe("frontend");
		expect(payload.kind).toBe("Error");
		expect(payload.message).toBe("kaboom");

		spy.mockRestore();
	});

	it("renders fallback UI and does not show children", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});

		render(
			<ErrorBoundary>
				<ThrowingChild shouldThrow />
			</ErrorBoundary>,
		);

		expect(screen.getByText("Unexpected Glitch")).toBeInTheDocument();
		expect(screen.queryByText("child ok")).not.toBeInTheDocument();

		vi.mocked(console.error).mockRestore();
	});

	it("renders custom fallback when provided", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});

		render(
			<ErrorBoundary
				fallback={(err, retry) => (
					<div>
						custom: {err.title}{" "}
						<button type="button" onClick={retry}>
							retry
						</button>
					</div>
				)}
			>
				<ThrowingChild shouldThrow />
			</ErrorBoundary>,
		);

		expect(screen.getByText(/custom:/)).toBeInTheDocument();
		expect(screen.queryByText("Unexpected Glitch")).not.toBeInTheDocument();

		vi.mocked(console.error).mockRestore();
	});

	it("recovers on retry after error", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const user = userEvent.setup();

		function Parent() {
			const [shouldThrow, setShouldThrow] = useState(true);
			return (
				<div>
					<ErrorBoundary>
						<ThrowingChild shouldThrow={shouldThrow} />
					</ErrorBoundary>
					<button
						type="button"
						data-testid="fix"
						onClick={() => setShouldThrow(false)}
					>
						fix
					</button>
				</div>
			);
		}

		render(<Parent />);

		// Error boundary catches the throw and shows crash screen
		expect(screen.getByText("Unexpected Glitch")).toBeInTheDocument();
		expect(screen.queryByText("child ok")).not.toBeInTheDocument();

		// Fix the underlying problem (toggle shouldThrow to false) —
		// this button is OUTSIDE the ErrorBoundary so always accessible
		await user.click(screen.getByTestId("fix"));

		// Now click retry — boundary clears error state and re-renders children.
		// Since shouldThrow is now false, child renders successfully.
		const retryBtn = screen.getByRole("button", { name: /retry/i });
		await user.click(retryBtn);

		expect(screen.getByText("child ok")).toBeInTheDocument();
		expect(screen.queryByText("Unexpected Glitch")).not.toBeInTheDocument();

		vi.mocked(console.error).mockRestore();
	});

	it("invokes onError callback when provided", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const onError = vi.fn();

		render(
			<ErrorBoundary onError={onError}>
				<ThrowingChild shouldThrow />
			</ErrorBoundary>,
		);

		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
		expect(onError.mock.calls[0][0].message).toBe("kaboom");

		vi.mocked(console.error).mockRestore();
	});
});
