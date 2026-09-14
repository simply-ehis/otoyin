/**
 * TranslateView tests — the dedicated translation interface.
 *
 * Backend is mocked at the apiClient boundary; everything else is real:
 * language loading, translate flow with detected-language display, swap
 * behavior with auto-detect source, and the offline/pack error hint.
 * Routing uses a memory-history router (the view links to /store).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/i18n";
import { TranslateView } from "./TranslateView";

vi.mock("@/lib/api/client", () => ({
	apiClient: {
		getTranslateLanguages: vi.fn(),
		translateText: vi.fn(),
	},
}));

import { apiClient } from "@/lib/api/client";

const mockedApi = {
	getTranslateLanguages: vi.mocked(apiClient.getTranslateLanguages),
	translateText: vi.mocked(apiClient.translateText),
};

async function renderView() {
	const qc = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const rootRoute = createRootRoute({
		component: () => (
			<QueryClientProvider client={qc}>
				<TranslateView />
			</QueryClientProvider>
		),
	});
	const storeRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/store",
		component: () => <div />,
	});
	const translateRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => (
			<QueryClientProvider client={qc}>
				<TranslateView />
			</QueryClientProvider>
		),
	});
	const router = createRouter({
		routeTree: rootRoute.addChildren([translateRoute, storeRoute]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	await router.load();
	render(<RouterProvider router={router} />);
	return router;
}

beforeEach(() => {
	mockedApi.getTranslateLanguages.mockReset();
	mockedApi.translateText.mockReset();
	mockedApi.getTranslateLanguages.mockResolvedValue({
		languages: { en: "English", fr: "French", es: "Spanish" },
	});
});

describe("TranslateView", () => {
	it("loads languages into both selects", async () => {
		await renderView();
		expect(await screen.findAllByText("French")).toHaveLength(2);
		expect(
			screen.getByRole("combobox", { name: "Target Language" }),
		).toBeInTheDocument();
	});

	it("translates and shows output with detected language", async () => {
		mockedApi.translateText.mockResolvedValue({
			translated_text: "Bonjour",
			source_lang: "auto",
			detected_lang: "en",
		});
		const user = userEvent.setup();
		await renderView();
		await user.type(
			screen.getByPlaceholderText("Type or paste text to translate…"),
			"Hello",
		);
		await user.click(screen.getByRole("button", { name: "Translate" }));
		expect(await screen.findByText("Bonjour")).toBeInTheDocument();
		expect(screen.getByText(/Translated · en/)).toBeInTheDocument();
		expect(mockedApi.translateText).toHaveBeenCalledWith("Hello", "auto", "en");
	});

	it("disables swap while source is auto-detect", async () => {
		await renderView();
		await screen.findAllByText("French");
		expect(
			screen.getByRole("button", { name: "Swap languages" }),
		).toBeDisabled();
	});

	it("shows the offline/pack hint on backend failure", async () => {
		mockedApi.translateText.mockRejectedValue(
			new Error("Translation failed: offline"),
		);
		const user = userEvent.setup();
		await renderView();
		await user.type(
			screen.getByPlaceholderText("Type or paste text to translate…"),
			"Hello",
		);
		await user.click(screen.getByRole("button", { name: "Translate" }));
		expect(
			await screen.findByText("Translation failed: offline"),
		).toBeInTheDocument();
		expect(
			screen.getByText("Get offline packs in the Store"),
		).toBeInTheDocument();
	});
});
