/**
 * BatchQueueView tests — honest running state (no fake percentage while
 * running) and stage labels for pending/completed.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runningJob = {
	id: "job-aaaaaaaa",
	name: "Render episode",
	status: "running" as const,
	progress: 0.5,
	result: null,
	result_path: null,
	error: null,
	created_at: "2026-11-10T08:00:00Z",
	completed_at: null,
	func_name: "tts_generate",
};

const pendingJob = {
	...runningJob,
	id: "job-bbbbbbbb",
	name: "Queue item",
	status: "pending" as const,
};

vi.mock("@/lib/api/client", () => ({
	apiClient: {
		listBatchJobs: vi.fn(),
		listScriptingFunctions: vi.fn(),
		cancelBatchJob: vi.fn(),
		createBatchJob: vi.fn(),
	},
}));

vi.mock("@/ui/use-toast", () => ({
	useToast: vi.fn(() => ({ toast: vi.fn() })),
}));

import { apiClient } from "@/lib/api/client";
import { BatchQueueView } from "./BatchQueueView";

const mockedApi = {
	listBatchJobs: vi.mocked(apiClient.listBatchJobs),
	listScriptingFunctions: vi.mocked(apiClient.listScriptingFunctions),
	cancelBatchJob: vi.mocked(apiClient.cancelBatchJob),
	createBatchJob: vi.mocked(apiClient.createBatchJob),
};

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const renderView = () =>
	render(
		<QueryClientProvider client={qc}>{<BatchQueueView />}</QueryClientProvider>,
	);

beforeEach(() => {
	vi.resetAllMocks();
});

describe("BatchQueueView honest progress", () => {
	it("shows Running with an indeterminate status, not a fake percentage", async () => {
		mockedApi.listBatchJobs.mockResolvedValue({ jobs: [runningJob] });
		renderView();
		expect(await screen.findByText("Render episode")).toBeInTheDocument();
		expect(screen.getByRole("status", { name: "Running" })).toBeInTheDocument();
		expect(screen.queryByText("50%")).not.toBeInTheDocument();
		expect(screen.getByText("Running")).toBeInTheDocument();
	});

	it("shows Queued for pending jobs", async () => {
		mockedApi.listBatchJobs.mockResolvedValue({ jobs: [pendingJob] });
		renderView();
		expect(await screen.findByText("Queue item")).toBeInTheDocument();
		expect(screen.getByText("Queued")).toBeInTheDocument();
	});

	it("cancel button calls cancelBatchJob for the running job", async () => {
		mockedApi.listBatchJobs.mockResolvedValue({ jobs: [runningJob] });
		mockedApi.cancelBatchJob.mockResolvedValue({
			message: "Job cancelled",
			id: runningJob.id,
		});
		const user = userEvent.setup();
		renderView();
		const cancel = await screen.findByRole("button", {
			name: /Cancel Render episode/i,
		});
		await user.click(cancel);
		await waitFor(() =>
			expect(mockedApi.cancelBatchJob).toHaveBeenCalledWith(runningJob.id),
		);
	});
});
