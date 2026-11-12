import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UseCaseWizard } from "@/features/onboarding/UseCaseWizard";
import { apiClient } from "@/lib/api/client";
import type {
	DeviceCapabilitiesResponse,
	RecommendedModelsResponse,
} from "@/lib/api/types";
import { getDiskSpace } from "@/lib/system/disk";
import { useWorkspaceStore } from "@/stores/workspaceStore";

const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => navigateMock,
}));

// Same seam as VoiceCleanABToggle.test: provide t() without booting i18next.
// Supports both react-i18next overloads: t(key, defaultString) and
// t(key, { defaultValue }).
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, def?: string | { defaultValue?: string }) =>
			typeof def === "string" ? def : (def?.defaultValue ?? key),
	}),
}));

vi.mock("@/lib/api/client", () => ({
	apiClient: {
		getRecommendedModels: vi.fn(),
		getDeviceCapabilities: vi.fn(),
		getModelsCacheDir: vi.fn(),
		triggerModelDownload: vi.fn(),
	},
}));

vi.mock("@/lib/system/disk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/system/disk")>();
	return { ...actual, getDiskSpace: vi.fn() };
});

const PACK: RecommendedModelsResponse = {
	models: [
		{
			model_name: "kokoro-onnx",
			role: "tts",
			reason: "Recommended voice engine",
			downloaded: false,
		},
		{
			model_name: "whisper-tiny-en",
			role: "stt",
			reason: "Transcription and speech-to-speech input",
			downloaded: true,
		},
		{
			model_name: "planner-4b",
			role: "llm",
			reason: "On-device assistant brain",
			downloaded: false,
		},
		{
			model_name: "demucs-htdemucs",
			role: "music",
			reason: "Music source separation",
			downloaded: true,
		},
	],
	missing: [
		{
			model_name: "kokoro-onnx",
			role: "tts",
			reason: "Recommended voice engine",
			downloaded: false,
		},
	],
	all_downloaded: false,
	current_tts_engine: null,
};

const DEVICE: DeviceCapabilitiesResponse = {
	total_ram_mb: 16384,
	available_ram_mb: 8192,
	total_vram_mb: 0,
	free_vram_mb: 0,
	gpu_name: null,
	gpu_type: null,
	cpu_cores: 8,
	tier: "mid_range",
	models: [
		{
			model_name: "kokoro-onnx",
			display_name: "Kokoro 82M",
			category: "tts",
			size_mb: 114,
			gpu_only: false,
			min_ram_mb: 2048,
			min_vram_mb: 0,
			compatible: true,
			reason: null,
			estimated_ram_mb: 500,
			estimated_vram_mb: 0,
		},
		{
			model_name: "planner-4b",
			display_name: "Planner 4B",
			category: "llm",
			size_mb: 2400,
			gpu_only: false,
			min_ram_mb: 8192,
			min_vram_mb: 0,
			compatible: true,
			reason: null,
			estimated_ram_mb: 3500,
			estimated_vram_mb: 0,
		},
	],
};

function mockEngine({
	diskFreeBytes = 400_000_000_000,
}: {
	diskFreeBytes?: number;
} = {}) {
	vi.mocked(apiClient.getRecommendedModels).mockResolvedValue(PACK);
	vi.mocked(apiClient.getDeviceCapabilities).mockResolvedValue(DEVICE);
	vi.mocked(apiClient.getModelsCacheDir).mockResolvedValue({
		path: "C:/fake/models",
	});
	vi.mocked(apiClient.triggerModelDownload).mockResolvedValue({
		message: "started",
	});
	vi.mocked(getDiskSpace).mockResolvedValue({
		mountPoint: "C:\\",
		totalBytes: 500_000_000_000,
		freeBytes: diskFreeBytes,
	});
}

function resetTour() {
	navigateMock.mockClear();
	vi.clearAllMocks();
	mockEngine();
	useWorkspaceStore.setState({
		onboarded: false,
		visibleTabs: null,
		selectedUseCases: [],
	});
}

beforeEach(() => {
	resetTour();
});

/** Welcome → pick TTS → Continue: lands on the models step. */
async function advanceToModels(user: ReturnType<typeof userEvent.setup>) {
	render(<UseCaseWizard />);
	await user.click(await screen.findByRole("button", { name: "Get started" }));
	await user.click(
		await screen.findByRole("button", { name: /TTS \/ Voice generation/ }),
	);
	await user.click(screen.getByRole("button", { name: "Continue" }));
	return screen.findByRole("heading", { name: "Models for your picks" });
}

/** Welcome → pick TTS → models → agent. */
async function advanceToAgent(user: ReturnType<typeof userEvent.setup>) {
	await advanceToModels(user);
	await user.click(screen.getByRole("button", { name: "Next" }));
	return screen.findByRole("heading", { name: "Assistant & coding agent" });
}

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

	it("selecting a use case and continuing reaches models, then agent, then generate; finish onboards", async () => {
		const user = userEvent.setup();
		await advanceToAgent(user);

		expect(
			screen.getByRole("heading", { name: "Assistant & coding agent" }),
		).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Next" }));
		expect(
			await screen.findByRole("heading", { name: "Generate and listen" }),
		).toBeInTheDocument();
		expect(
			screen.getByText("Tip — press Ctrl+K to search anything."),
		).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Start generating" }));
		await waitFor(() =>
			expect(useWorkspaceStore.getState().onboarded).toBe(true),
		);
		expect(navigateMock).toHaveBeenCalledWith({ to: "/" });
	});

	it("Back from the agent step returns to models; Back from models returns to use case", async () => {
		const user = userEvent.setup();
		await advanceToAgent(user);

		await user.click(screen.getByRole("button", { name: "Back" }));
		expect(
			await screen.findByRole("heading", { name: "Models for your picks" }),
		).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Back" }));
		expect(
			await screen.findByRole("heading", { name: "What do you want to do?" }),
		).toBeInTheDocument();
	});

	it("lists the models the picks need with sizes and a downloaded state", async () => {
		const user = userEvent.setup();
		render(<UseCaseWizard />);
		await user.click(
			await screen.findByRole("button", { name: "Get started" }),
		);
		await user.click(
			await screen.findByRole("button", { name: /TTS \/ Voice generation/ }),
		);
		await user.click(
			await screen.findByRole("button", { name: /Voice changer/ }),
		);
		await user.click(screen.getByRole("button", { name: "Continue" }));
		expect(
			await screen.findByRole("heading", { name: "Models for your picks" }),
		).toBeInTheDocument();

		expect(await screen.findByText("Kokoro 82M")).toBeInTheDocument();
		expect(screen.getByText("114 MB")).toBeInTheDocument();
		// Only the missing one offers Install; the pack's LLM brain is not shown here.
		expect(screen.getByRole("button", { name: "Install" })).toBeInTheDocument();
		expect(screen.getByText("Installed")).toBeInTheDocument();
		expect(screen.queryByText("Planner 4B")).not.toBeInTheDocument();
	});

	it("installs a missing model from the models step", async () => {
		const user = userEvent.setup();
		await advanceToModels(user);

		const install = await screen.findByRole("button", { name: "Install" });
		await user.click(install);
		expect(apiClient.triggerModelDownload).toHaveBeenCalledWith("kokoro-onnx");
	});

	it("warns when the disk cannot fit the missing models", async () => {
		const user = userEvent.setup();
		vi.mocked(getDiskSpace).mockResolvedValue({
			mountPoint: "C:\\",
			totalBytes: 500_000_000_000,
			freeBytes: 50 * 1024 * 1024, // 50 MiB — below the 114 MiB kokoro needs
		});
		await advanceToModels(user);

		expect(
			await screen.findByText(/but only 50 MB is free/),
		).toBeInTheDocument();
	});

	it("degrades gracefully when the engine is unreachable", async () => {
		const user = userEvent.setup();
		vi.mocked(apiClient.getRecommendedModels).mockRejectedValue(
			new Error("engine not running"),
		);
		vi.mocked(apiClient.getDeviceCapabilities).mockRejectedValue(
			new Error("engine not running"),
		);

		render(<UseCaseWizard />);
		await user.click(
			await screen.findByRole("button", { name: "Get started" }),
		);
		await user.click(
			await screen.findByRole("button", { name: /TTS \/ Voice generation/ }),
		);
		await user.click(screen.getByRole("button", { name: "Continue" }));

		expect(
			await screen.findByText(/Couldn't reach the engine/),
		).toBeInTheDocument();
		// Continue still works — onboarding never hard-blocks on the backend.
		await user.click(screen.getByRole("button", { name: "Next" }));
		expect(
			await screen.findByRole("heading", {
				name: "Assistant & coding agent",
			}),
		).toBeInTheDocument();
	});

	it("agent step installs the local planner from the recommendations pack", async () => {
		const user = userEvent.setup();
		await advanceToAgent(user);

		const install = await screen.findByRole("button", {
			name: "Install planner (4B)",
		});
		await user.click(install);
		expect(apiClient.triggerModelDownload).toHaveBeenCalledWith("planner-4b");
	});

	it("blocks the planner install and shows the backend verdict when the host cannot run it", async () => {
		const user = userEvent.setup();
		vi.mocked(apiClient.getDeviceCapabilities).mockResolvedValue({
			...DEVICE,
			tier: "low_end",
			models: DEVICE.models.map((m) =>
				m.model_name === "planner-4b"
					? {
							...m,
							compatible: false,
							reason: "Not enough RAM for the planner",
						}
					: m,
			),
		});

		await advanceToAgent(user);

		const install = await screen.findByRole("button", {
			name: "Install planner (4B)",
		});
		expect(install).toBeDisabled();
		expect(
			screen.getByText("Not enough RAM for the planner"),
		).toBeInTheDocument();
	});

	it("agent step shows the installed state instead of Install when the planner is present", async () => {
		const user = userEvent.setup();
		vi.mocked(apiClient.getRecommendedModels).mockResolvedValue({
			...PACK,
			models: PACK.models.map((m) =>
				m.model_name === "planner-4b" ? { ...m, downloaded: true } : m,
			),
		});

		await advanceToAgent(user);
		expect(await screen.findByText("Planner installed")).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Install planner (4B)" }),
		).not.toBeInTheDocument();
	});

	it("agent step shows the coding-agent MCP command for copy", async () => {
		const user = userEvent.setup();
		await advanceToAgent(user);

		expect(
			await screen.findByText(/claude mcp add 21-labs/),
		).toBeInTheDocument();
	});

	it("Skip on the models step onboards without navigating", async () => {
		const user = userEvent.setup();
		await advanceToModels(user);

		await user.click(screen.getByRole("button", { name: "Skip tour" }));
		await waitFor(() =>
			expect(useWorkspaceStore.getState().onboarded).toBe(true),
		);
		expect(navigateMock).toHaveBeenCalledTimes(0);
	});

	it("Skip on the agent step onboards without navigating", async () => {
		const user = userEvent.setup();
		await advanceToAgent(user);

		await user.click(screen.getByRole("button", { name: "Skip tour" }));
		await waitFor(() =>
			expect(useWorkspaceStore.getState().onboarded).toBe(true),
		);
		expect(navigateMock).toHaveBeenCalledTimes(0);
	});

	it("Skip on the generate step onboards without navigating", async () => {
		const user = userEvent.setup();
		await advanceToAgent(user);

		await user.click(screen.getByRole("button", { name: "Next" }));
		expect(
			await screen.findByRole("heading", { name: "Generate and listen" }),
		).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Skip tour" }));
		await waitFor(() =>
			expect(useWorkspaceStore.getState().onboarded).toBe(true),
		);
		expect(navigateMock).toHaveBeenCalledTimes(0);
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

	it("use-case card lists the tabs it enables and model space", async () => {
		const user = userEvent.setup();
		render(<UseCaseWizard />);
		await user.click(
			await screen.findByRole("button", { name: "Get started" }),
		);
		const tts = screen.getByRole("button", {
			name: /TTS \/ Voice generation/,
		});
		expect(tts.textContent).toContain("/voices");
		expect(tts.textContent).toContain("~400 MB");
		const music = screen.getByRole("button", {
			name: /Music production/,
		});
		expect(music.textContent).toContain("/songwriter");
		expect(music.textContent).toContain("~1.2 GB");
	});
});
