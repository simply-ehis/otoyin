/**
 * InstrumentBrowser tests — family filtering, audition wiring, and the
 * no-SoundFont error box.
 *
 * apiClient is mocked at the boundary (gm-types payload + audition render);
 * playPreviewBlob is mocked so no real Audio plays in jsdom. A memory router
 * hosts the component because the error box links to /store.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InstrumentBrowser } from "./InstrumentBrowser";

vi.mock("@/lib/api/client", () => ({
	apiClient: { listGMTypes: vi.fn(), playGMInstrument: vi.fn() },
}));
vi.mock("@/features/workspace/playBlob", () => ({
	playPreviewBlob: vi.fn(() => ({ pause: vi.fn() })),
}));

import { apiClient } from "@/lib/api/client";

const listGMTypes = vi.mocked(apiClient.listGMTypes);
const playGMInstrument = vi.mocked(apiClient.playGMInstrument);

const GM_TYPES = {
	note: "General MIDI programs 0-127.",
	programs: [
		{ program: 0, name: "Acoustic Grand Piano", family: "Piano" },
		{ program: 1, name: "Bright Acoustic Piano", family: "Piano" },
		{ program: 32, name: "Acoustic Bass", family: "Bass" },
	],
};

async function renderBrowser() {
	const qc = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	const rootRoute = createRootRoute({ component: () => <Outlet /> });
	const storeRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/store",
		component: () => <div />,
	});
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => (
			<QueryClientProvider client={qc}>
				<InstrumentBrowser />
			</QueryClientProvider>
		),
	});
	const router = createRouter({
		routeTree: rootRoute.addChildren([indexRoute, storeRoute]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	await router.load();
	render(<RouterProvider router={router} />);
	return router;
}

beforeEach(() => {
	listGMTypes.mockReset();
	playGMInstrument.mockReset();
	listGMTypes.mockResolvedValue(GM_TYPES);
	playGMInstrument.mockResolvedValue(new Blob(["wav"]));
});

describe("InstrumentBrowser", () => {
	it("filters programs by family chip", async () => {
		const user = userEvent.setup();
		await renderBrowser();
		// First test in the file pays cold-module cost (see vitest.config.ts):
		// the default 1000ms findBy timeout can expire before the query settles.
		expect(
			await screen.findByRole(
				"button",
				{ name: /Acoustic Grand Piano/ },
				{ timeout: 5000 },
			),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /Acoustic Bass/ }),
		).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Bass" }));

		expect(
			screen.queryByRole("button", { name: /Acoustic Grand Piano/ }),
		).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /Acoustic Bass/ }),
		).toBeInTheDocument();
	});

	it("auditions the clicked program through the GM endpoint", async () => {
		const user = userEvent.setup();
		await renderBrowser();
		await user.click(
			await screen.findByRole("button", { name: /Acoustic Grand Piano/ }),
		);
		expect(playGMInstrument).toHaveBeenCalledWith({
			program: 0,
			note: 60,
			duration: 1.0,
		});
	});

	it("shows the Store hint when the audition fails (no SoundFont)", async () => {
		playGMInstrument.mockRejectedValue(
			new Error("No SoundFont found — install an instrument pack"),
		);
		const user = userEvent.setup();
		await renderBrowser();
		await user.click(
			await screen.findByRole("button", { name: /Acoustic Bass/ }),
		);

		expect(await screen.findByText(/No SoundFont found/)).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: "Open the Store" }),
		).toHaveAttribute("href", "/store");
	});
});
