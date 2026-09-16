import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UseCaseWizard } from "@/features/onboarding/UseCaseWizard";
import { useWorkspaceStore } from "@/stores/workspaceStore";

const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigateMock,
}));

function resetTour() {
	navigateMock.mockClear();
	useWorkspaceStore.setState({
		onboarded: false,
		visibleTabs: null,
		selectedUseCases: [],
	});
}

beforeEach(() => {
	resetTour();
});

describe("UseCaseWizard tour", () => {
	it("opens on the welcome step for new users", async () => {
		render(<UseCaseWizard />);
		expect(
			await screen.findByRole("heading", { name: "Welcome to otoyin" }),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("heading", { name: "What do you want to do?" }),
		).not.toBeInTheDocument();
	});

	it("Get started advances to the kept use-case step", async () => {
		const user = userEvent.setup();
		render(<UseCaseWizard />);
		await user.click(
			await screen.findByRole("button", { name: "Get started" }),
		);
		expect(
			await screen.findByRole("heading", { name: "What do you want to do?" }),
		).toBeInTheDocument();
	});

	it("selecting a use case and continuing reaches setup, then finish onboards", async () => {
		const user = userEvent.setup();
		render(<UseCaseWizard />);
		await user.click(
			await screen.findByRole("button", { name: "Get started" }),
		);
		await user.click(
			await screen.findByRole("button", { name: /TTS \/ Voice generation/ }),
		);
		await user.click(screen.getByRole("button", { name: "Continue" }));
		expect(
			await screen.findByRole("heading", { name: "Get a voice" }),
		).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Next" }));
		expect(
			await screen.findByRole("heading", { name: "Generate and listen" }),
		).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Start generating" }));
		await waitFor(() =>
			expect(useWorkspaceStore.getState().onboarded).toBe(true),
		);
		expect(navigateMock).toHaveBeenCalledWith({ to: "/" });
	});

	it("Back returns to the previous step", async () => {
		const user = userEvent.setup();
		render(<UseCaseWizard />);
		await user.click(
			await screen.findByRole("button", { name: "Get started" }),
		);
		await screen.findByRole("heading", { name: "What do you want to do?" });
		await user.click(screen.getByRole("button", { name: "Back" }));
		expect(
			await screen.findByRole("heading", { name: "Welcome to otoyin" }),
		).toBeInTheDocument();
	});

	it("Skip tour onboards without touching tabs", async () => {
		const user = userEvent.setup();
		render(<UseCaseWizard />);
		await user.click(await screen.findByRole("button", { name: "Skip tour" }));
		await waitFor(() =>
			expect(useWorkspaceStore.getState().onboarded).toBe(true),
		);
		expect(useWorkspaceStore.getState().visibleTabs).toBeNull();
	});

	it("reopening the tour works after finishing", async () => {
		const user = userEvent.setup();
		render(<UseCaseWizard />);
		await user.click(
			await screen.findByRole("button", { name: "Get started" }),
		);
		await user.click(screen.getByRole("button", { name: "Back" }));
		await user.click(await screen.findByRole("button", { name: "Skip tour" }));
		await waitFor(() =>
			expect(useWorkspaceStore.getState().onboarded).toBe(true),
		);
		act(() => {
			useWorkspaceStore.getState().reopenOnboarding();
		});
		expect(
			await screen.findByRole("heading", { name: "Welcome to otoyin" }),
		).toBeInTheDocument();
	});
});
