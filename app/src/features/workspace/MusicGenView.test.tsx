/**
 * MusicGenView tests — model picker install state + engine passed to generate.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const models = [
	{
		model_name: "acestep-1-5-gguf",
		engine: "acestep_gguf",
		downloaded: true,
	} as any,
	{ model_name: "heartmula-3b", engine: "heartmula", downloaded: false } as any,
	{ model_name: "music-cloud", engine: "cloud", downloaded: true } as any,
];

vi.mock("@/lib/api/client", () => ({
	apiClient: {
		getModelStatus: vi.fn(() => Promise.resolve({ models })),
		generateMusic: vi.fn(() => Promise.resolve(new Blob())),
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
	toast: vi.fn(),
	dismissToast: vi.fn(),
}));

import { apiClient } from "@/lib/api/client";
import { MusicGenView } from "./MusicGenView";

const mockedApi = {
	getModelStatus: vi.mocked(apiClient.getModelStatus),
	generateMusic: vi.mocked(apiClient.generateMusic),
};

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const renderView = (ui: React.ReactElement) =>
	render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);

beforeEach(() => {
	vi.resetAllMocks();
	// node Blob is not jsdom-shaped; stub the URL factories (used by the player).
	URL.createObjectURL = vi.fn(() => "blob:music-test");
	URL.revokeObjectURL = vi.fn();
	mockedApi.getModelStatus.mockResolvedValue({ models });
	mockedApi.generateMusic.mockResolvedValue(new Blob());
});

describe("MusicGenView model picker", () => {
	it("shows no install warning for installed default engine", async () => {
		renderView(<MusicGenView />);
		await waitFor(() => {
			expect(screen.queryByText(/not installed/i)).not.toBeInTheDocument();
		});
		expect(screen.queryByTestId("store-link")).not.toBeInTheDocument();
	});

	it("passes the selected engine to generateMusic", async () => {
		const user = userEvent.setup();
		renderView(<MusicGenView />);

		await user.type(
			screen.getByPlaceholderText(/Describe the music/),
			"ambient beat",
		);
		fireEvent.click(screen.getByRole("button", { name: /Generate Music/i }));

		await waitFor(() =>
			expect(mockedApi.generateMusic).toHaveBeenCalledTimes(1),
		);
		const [req] = mockedApi.generateMusic.mock.calls[0];
		expect(req.engine).toBe("acestep_gguf");
		expect(req.prompt).toBe("ambient beat");
	});
});
