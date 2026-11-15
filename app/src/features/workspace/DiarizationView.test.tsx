/**
 * DiarizationView tests — model picker install state.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const models = [
	{
		model_name: "whisper-tiny-en",
		engine: "whisper",
		model_size: "tiny.en",
		downloaded: true,
	},
	{
		model_name: "whisper-base-en",
		engine: "whisper",
		model_size: "base.en",
		downloaded: false,
	},
] as any;

vi.mock("@/lib/api/client", () => ({
	apiClient: {
		getModelStatus: vi.fn(() => Promise.resolve({ models })),
	},
}));
vi.mock("@tanstack/react-router", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@tanstack/react-router")>();
	return {
		...actual,
		Link: ({ children, to }: any) => (
			<a href={String(to)} data-testid="store-link">
				{children}
			</a>
		),
	};
});
vi.mock("@/ui/use-toast", () => ({
	useToast: vi.fn(() => ({ toast: vi.fn() })),
}));

import { apiClient } from "@/lib/api/client";
import { DiarizationView } from "./DiarizationView";

const mockedApi = {
	getModelStatus: vi.mocked(apiClient.getModelStatus),
};

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const renderView = (ui: React.ReactElement) =>
	render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);

beforeEach(() => {
	vi.resetAllMocks();
	mockedApi.getModelStatus.mockResolvedValue({ models });
});

describe("DiarizationView model picker", () => {
	it("renders without install warning when default model is installed", async () => {
		renderView(<DiarizationView />);
		await waitFor(() => {
			expect(screen.queryByText(/not installed/i)).not.toBeInTheDocument();
		});
		expect(screen.queryByTestId("store-link")).not.toBeInTheDocument();
		expect(screen.getAllByRole("combobox")[0]).toBeInTheDocument();
	});

	it("shows store link placeholder for uninstalled model", () => {
		renderView(<DiarizationView />);
		// Default model tiny.en is downloaded; store link should not appear
		expect(screen.queryByTestId("store-link")).not.toBeInTheDocument();
	});
});
