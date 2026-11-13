/**
 * Command palette — the static commands still work, and typing a query now
 * also searches the server-side help catalog (app_features.json), opening
 * the Help Center with the query when a help result is chosen.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "@/features/help/CommandPalette";
import { apiClient } from "@/lib/api/client";
import { useWorkspaceStore } from "@/stores/workspaceStore";

vi.mock("@/lib/api/client", () => ({
	apiClient: {
		searchHelp: vi.fn(),
	},
}));

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, opts?: { defaultValue?: string }) =>
			opts?.defaultValue ?? key,
	}),
}));

const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigateMock,
}));

beforeEach(() => {
	vi.clearAllMocks();
});

describe("CommandPalette", () => {
	it("shows static commands when opened", () => {
		render(<CommandPalette open={true} onClose={() => {}} />);
		expect(screen.getByText("Generate speech")).toBeInTheDocument();
		expect(screen.getByText("Marketplace")).toBeInTheDocument();
	});

	it("searches the help catalog and opens Help Center with the query", async () => {
		vi.mocked(apiClient.searchHelp).mockResolvedValue({
			query: "voice clone",
			results: [
				{
					id: "voice-clone",
					name: "Voice cloning",
					category: "Voice generation",
					summary: "Learn a voice from a sample",
					where: "Voices → Clone",
					tools: [],
					score: 5,
				},
			],
		});
		const openHelpCapture = vi.fn();
		window.addEventListener("open-help-center", openHelpCapture);

		const user = userEvent.setup();
		const onClose = vi.fn();
		render(<CommandPalette open={true} onClose={onClose} />);

		await user.type(
			screen.getByPlaceholderText(/Type a command/i),
			"voice clone",
		);
		expect(await screen.findByText("Voice cloning")).toBeInTheDocument();
		expect(apiClient.searchHelp).toHaveBeenCalledWith("voice clone");
		expect(screen.getByText("Voices → Clone")).toBeInTheDocument();

		await user.click(screen.getByText("Voice cloning"));
		expect(onClose).toHaveBeenCalled();
		expect(openHelpCapture).toHaveBeenCalledTimes(1);
		const detail = (openHelpCapture.mock.calls[0][0] as CustomEvent).detail;
		expect(detail).toEqual({ query: "voice clone" });

		window.removeEventListener("open-help-center", openHelpCapture);
	});

	it("shows help results even when no static command matches", async () => {
		vi.mocked(apiClient.searchHelp).mockResolvedValue({
			query: "master",
			results: [
				{
					id: "stem-master",
					name: "Stem mastering",
					category: "Mixer & delivery",
					summary: "Master a mix per stem",
					where: "Mixer → Master",
					tools: [],
					score: 4,
				},
			],
		});

		const user = userEvent.setup();
		render(<CommandPalette open={true} onClose={() => {}} />);
		await user.type(screen.getByPlaceholderText(/Type a command/i), "master");
		expect(await screen.findByText("Stem mastering")).toBeInTheDocument();
	});

	describe("CommandPalette — settings from the schema", () => {
		beforeEach(() => {
			useWorkspaceStore.setState({
				hiddenTabs: [],
				visibleTabs: null,
				selectedUseCases: [],
				onboarded: true,
			});
			localStorage.removeItem("otoyin:search-recents");
			vi.mocked(apiClient.searchHelp).mockResolvedValue({
				query: "",
				results: [],
			});
		});

		it("finds a setting by label and navigates to the schema page", async () => {
			const user = userEvent.setup();
			render(<CommandPalette open={true} onClose={() => {}} />);
			await user.type(screen.getByPlaceholderText(/Type a command/i), "theme");
			expect(await screen.findByText("Theme")).toBeInTheDocument();
			expect(screen.getByText("Settings")).toBeInTheDocument();
			await user.click(screen.getByText("Theme"));
			expect(navigateMock).toHaveBeenCalledWith({ to: "/settings/schema" });
		});

		it("finds a setting by keyword (search synonyms from the schema)", async () => {
			const user = userEvent.setup();
			render(<CommandPalette open={true} onClose={() => {}} />);
			// "on launch" is a keyword on appearance.on_launch
			await user.type(
				screen.getByPlaceholderText(/Type a command/i),
				"on launch",
			);
			expect(await screen.findByText("On launch")).toBeInTheDocument();
		});
	});

	describe("CommandPalette — registry tabs", () => {
		beforeEach(() => {
			useWorkspaceStore.setState({
				hiddenTabs: [],
				visibleTabs: null,
				selectedUseCases: [],
				onboarded: true,
			});
			localStorage.removeItem("otoyin:search-recents");
			vi.mocked(apiClient.searchHelp).mockResolvedValue({
				query: "",
				results: [],
			});
		});

		it("finds a tab by keyword (synonyms from the registry)", async () => {
			const user = userEvent.setup();
			render(<CommandPalette open={true} onClose={() => {}} />);
			await user.type(
				screen.getByPlaceholderText(/Type a command/i),
				"denoise",
			);
			// "denoise" is a keyword on the Noise Reduction tab
			expect(await screen.findByText("/noise-reduction")).toBeInTheDocument();
			expect(navigateMock).not.toHaveBeenCalled();
		});

		it("finds a hidden tab, marks it (hidden), and enables + opens it on select", async () => {
			useWorkspaceStore.setState({ hiddenTabs: ["/noise-reduction"] });
			const user = userEvent.setup();
			render(<CommandPalette open={true} onClose={() => {}} />);
			await user.type(screen.getByPlaceholderText(/Type a command/i), "noise");
			expect(await screen.findByText("/noise-reduction")).toBeInTheDocument();
			expect(screen.getByText("/noise-reduction (hidden)")).toBeInTheDocument();

			await user.click(screen.getByText("/noise-reduction"));
			expect(navigateMock).toHaveBeenCalledWith({
				to: "/noise-reduction",
			});
			// Enabling removed it from the hidden set
			expect(useWorkspaceStore.getState().hiddenTabs).not.toContain(
				"/noise-reduction",
			);
		});

		it("navigates the first result with keyboard", async () => {
			const user = userEvent.setup();
			render(<CommandPalette open={true} onClose={() => {}} />);
			await user.keyboard("{ArrowDown}");
			await user.keyboard("{Enter}");
			expect(navigateMock).toHaveBeenCalledWith({ to: "/" });
		});
	});
});
