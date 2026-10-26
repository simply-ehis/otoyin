/**
 * DrumMachinePanel tests — grid wiring and the backend lane contract.
 *
 * apiClient is mocked at the boundary; jsdom media + URL + rAF are stubbed so
 * the success path (render -> play -> playhead clock) runs without a real
 * audio pipeline. The Play assertion pins the exact `lanes` shape the backend
 * validates, so a wiring regression fails here.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DrumMachinePanel } from "./DrumMachinePanel";

vi.mock("@/lib/api/client", () => ({
	apiClient: { playDrumMachine: vi.fn() },
}));
vi.mock("@/lib/errors", () => ({
	showStudioErrorToast: vi.fn(),
}));

import { apiClient } from "@/lib/api/client";

const playDrumMachine = vi.mocked(apiClient.playDrumMachine);
const audioPlay = vi.fn().mockResolvedValue(undefined);
const audioPause = vi.fn();

function renderPanel() {
	const qc = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	render(
		<QueryClientProvider client={qc}>
			<DrumMachinePanel />
		</QueryClientProvider>,
	);
}

beforeEach(() => {
	playDrumMachine.mockReset();
	audioPlay.mockReset();
	audioPlay.mockResolvedValue(undefined);
	audioPause.mockReset();
	vi.stubGlobal(
		"Audio",
		vi.fn(function AudioStub() {
			// A regular function so `new Audio(url)` actually constructs.
			return {
				loop: false,
				currentTime: 0,
				play: audioPlay,
				pause: audioPause,
			};
		}),
	);
	vi.stubGlobal(
		"requestAnimationFrame",
		vi.fn(() => 0),
	);
	vi.stubGlobal(
		"URL",
		Object.assign(Object.create(URL), {
			createObjectURL: vi.fn(() => "blob:drum-machine"),
			revokeObjectURL: vi.fn(),
		}),
	);
});

describe("DrumMachinePanel", () => {
	it("shows the starter beat as pressed steps", () => {
		renderPanel();
		expect(
			screen.getByRole("button", { name: "Kick, step 1" }),
		).toHaveAttribute("aria-pressed", "true");
		expect(
			screen.getByRole("button", { name: "Snare, step 5" }),
		).toHaveAttribute("aria-pressed", "true");
		expect(screen.getByRole("button", { name: "Tom, step 1" })).toHaveAttribute(
			"aria-pressed",
			"false",
		);
	});

	it("renders the grid to backend lanes on Play", async () => {
		playDrumMachine.mockResolvedValue(new Blob(["wav"]));
		const user = userEvent.setup();
		renderPanel();
		await user.click(screen.getByRole("button", { name: "Play beat" }));

		expect(playDrumMachine).toHaveBeenCalledWith({
			lanes: {
				kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
				snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
				hihat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
				clap: Array.from({ length: 16 }, () => 0),
				tom: Array.from({ length: 16 }, () => 0),
			},
			step_duration: 0.125,
		});
		expect(
			await screen.findByRole("button", { name: "Stop" }),
		).toBeInTheDocument();
	});

	it("Clear empties the pattern", async () => {
		const user = userEvent.setup();
		renderPanel();
		await user.click(screen.getByRole("button", { name: "Clear" }));
		expect(
			screen.getByRole("button", { name: "Kick, step 1" }),
		).toHaveAttribute("aria-pressed", "false");
		expect(
			screen.getByRole("button", { name: "Snare, step 5" }),
		).toHaveAttribute("aria-pressed", "false");
	});
});
