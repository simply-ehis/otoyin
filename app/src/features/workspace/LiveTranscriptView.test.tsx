/**
 * LiveTranscriptView tests — model picker install state + Store link.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
import { LiveTranscriptView } from "./LiveTranscriptView";

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

describe("LiveTranscriptView model picker", () => {
	it("renders without install warning when default model is installed", () => {
		renderView(<LiveTranscriptView />);
		// Default model (tiny.en) is downloaded — no warning, no store link
		expect(screen.queryByText(/not installed/i)).not.toBeInTheDocument();
		expect(screen.queryByTestId("store-link")).not.toBeInTheDocument();
		expect(screen.getAllByRole("combobox")[0]).toBeInTheDocument();
	});
});
