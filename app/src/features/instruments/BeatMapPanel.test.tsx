/**
 * BeatMapPanel tests — grid wiring and the GM pattern contract.
 *
 * apiClient is mocked at the boundary; jsdom media + URL + rAF are stubbed so
 * the success path (render -> play -> playhead clock) runs without a real
 * audio pipeline. The Play assertion pins the exact `steps` shape the
 * /gm-pattern route validates, so a wiring regression fails here.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BeatMapPanel } from "./BeatMapPanel";

vi.mock("@/lib/api/client", () => ({
	apiClient: { listGMTypes: vi.fn(), playGmPattern: vi.fn() },
}));

import { apiClient } from "@/lib/api/client";

const listGMTypes = vi.mocked(apiClient.listGMTypes);
const playGmPattern = vi.mocked(apiClient.playGmPattern);

const GM_TYPES = {
	note: "General MIDI programs 0-127.",
	programs: [
		{ program: 0, name: "Acoustic Grand Piano", family: "Piano" },
		{ program: 40, name: "String Ensemble 1", family: "Strings" },
	],
};

async function renderPanel() {
	const qc = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	render(
		<QueryClientProvider client={qc}>
			<BeatMapPanel />
		</QueryClientProvider>,
	);
	// Wait for gm-types to load before interacting with the grid.
	await screen.findByRole("button", { name: /Add instrument/ });
}

beforeEach(() => {
	listGMTypes.mockReset();
	playGmPattern.mockReset();
	listGMTypes.mockResolvedValue(GM_TYPES);
	playGmPattern.mockResolvedValue(new Blob(["wav"]));
	vi.stubGlobal(
		"Audio",
		vi.fn(function AudioStub() {
			return {
				loop: false,
				currentTime: 0,
				play: vi.fn().mockResolvedValue(undefined),
				pause: vi.fn(),
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
			createObjectURL: vi.fn(() => "blob:gm-pattern"),
			revokeObjectURL: vi.fn(),
		}),
	);
});

describe("BeatMapPanel", () => {
	it("renders the row's program, note and silent steps", async () => {
		await renderPanel();
		expect(
			screen.getByRole("button", {
				name: "000 — Acoustic Grand Piano · C4, step 1",
			}),
		).toHaveAttribute("aria-pressed", "false");
		expect(
			screen.getByRole("button", { name: /Add instrument/ }),
		).toBeInTheDocument();
	});

	it("posts the grid as GM pattern steps on Play", async () => {
		const user = userEvent.setup();
		await renderPanel();
		// Step 2 (index 1): paint the cell on, velocity defaults to 0.5.
		await user.click(
			screen.getByRole("button", {
				name: "000 — Acoustic Grand Piano · C4, step 2",
			}),
		);
		expect(
			screen.getByRole("button", {
				name: "000 — Acoustic Grand Piano · C4, step 2",
			}),
		).toHaveAttribute("aria-pressed", "true");

		await user.click(screen.getByRole("button", { name: /Play map/ }));

		expect(playGmPattern).toHaveBeenCalledWith({
			steps: [
				[],
				[{ program: 0, note: 60, velocity: 0.5 }],
				[],
				[],
				[],
				[],
				[],
				[],
				[],
				[],
				[],
				[],
				[],
				[],
				[],
				[],
			],
			step_duration: 0.25,
		});
		expect(
			await screen.findByRole("button", { name: /Stop/ }),
		).toBeInTheDocument();
	});

	it("Clear silences every cell", async () => {
		const user = userEvent.setup();
		await renderPanel();
		await user.click(
			screen.getByRole("button", {
				name: "000 — Acoustic Grand Piano · C4, step 2",
			}),
		);
		await user.click(screen.getByRole("button", { name: /Clear/ }));
		expect(
			screen.getByRole("button", {
				name: "000 — Acoustic Grand Piano · C4, step 2",
			}),
		).toHaveAttribute("aria-pressed", "false");
	});
});
