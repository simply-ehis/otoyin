/**
 * GeneralPage — manual "Check for updates" Settings row.
 *
 * The updater is exercised through the real seam: a fake `Platform` is
 * provided via `PlatformProvider`, so the test drives the exact path
 * production uses — button click → `platform.updater.checkForUpdates()` →
 * status broadcast via `subscribe()` → re-render. Covers: up-to-date
 * baseline, version-available → Download → Restart lifecycle, error row,
 * and the dev-mode variant that hides the updater row entirely.
 *
 * The backend-facing queries (server health, performance settings) are
 * mocked at the apiClient boundary; everything else is real.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformProvider } from "@/platform/PlatformContext";
import type { Platform, UpdateStatus } from "@/platform/types";
import { GeneralPage } from "./GeneralPage";

vi.mock("@/lib/api/client", () => ({
	apiClient: {
		getHealth: vi.fn(),
		getPerformanceSettings: vi.fn(),
		updatePerformanceSettings: vi.fn(),
	},
}));

import { apiClient } from "@/lib/api/client";

const mockedApi = {
	getHealth: vi.mocked(apiClient.getHealth),
	getPerformanceSettings: vi.mocked(apiClient.getPerformanceSettings),
	updatePerformanceSettings: vi.mocked(apiClient.updatePerformanceSettings),
};

const IDLE: UpdateStatus = {
	checking: false,
	available: false,
	downloading: false,
	installing: false,
	readyToInstall: false,
};

/** Fake updater: records check calls, lets tests push status updates. */
function makeUpdater(initial: UpdateStatus = IDLE) {
	let status = initial;
	const listeners = new Set<(s: UpdateStatus) => void>();
	return {
		checkForUpdates: vi.fn(async () => {}),
		downloadAndInstall: vi.fn(async () => {}),
		restartAndInstall: vi.fn(async () => {}),
		getStatus: () => ({ ...status }),
		subscribe: vi.fn((cb: (s: UpdateStatus) => void) => {
			listeners.add(cb);
			return () => listeners.delete(cb);
		}),
		emit(next: Partial<UpdateStatus>) {
			status = { ...status, ...next };
			for (const cb of listeners) {
				cb(status);
			}
		},
	};
}

function makePlatform(updater: ReturnType<typeof makeUpdater>): Platform {
	return {
		filesystem: {} as Platform["filesystem"],
		updater,
		audio: {} as Platform["audio"],
		lifecycle: {} as Platform["lifecycle"],
		metadata: { getVersion: vi.fn(async () => "0.2.0"), isTauri: true },
	};
}

function renderPage(platform: Platform) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false, gcTime: 0, staleTime: 0 },
			mutations: { retry: false },
		},
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<PlatformProvider platform={platform}>
				<GeneralPage />
			</PlatformProvider>
		</QueryClientProvider>,
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	// The page renders the updater row only in production builds
	// (isDev = !import.meta.env.PROD); vitest defaults PROD to false.
	vi.stubEnv("PROD", true);
	mockedApi.getHealth.mockResolvedValue({
		status: "ok",
		model_loaded: false,
		gpu_available: false,
	});
	mockedApi.getPerformanceSettings.mockResolvedValue({
		performance_mode: false,
	});
	mockedApi.updatePerformanceSettings.mockResolvedValue({
		performance_mode: false,
	});
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("GeneralPage manual update check", () => {
	it("renders an up-to-date row whose Check button drives the updater", async () => {
		const updater = makeUpdater();
		const platform = makePlatform(updater);

		renderPage(platform);

		// Row + button render from the idle status.
		expect(await screen.findByText("Check for updates")).toBeInTheDocument();
		const checkButton = screen.getByRole("button", { name: "Check" });
		expect(checkButton).toBeEnabled();

		await userEvent.click(checkButton);
		expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
	});

	it("shows the available version row after the updater broadcasts one", async () => {
		const updater = makeUpdater();
		const platform = makePlatform(updater);

		renderPage(platform);
		await screen.findByRole("button", { name: "Check" });

		// Emulate the backend finding a new version mid-session.
		act(() => {
			updater.emit({
				available: true,
				version: "0.3.0",
				checking: false,
			});
		});

		expect(
			await screen.findByText("Version 0.3.0 available"),
		).toBeInTheDocument();
		expect(screen.getByText("Update to 0.3.0")).toBeInTheDocument();

		// Download row wired to the updater's install path.
		await userEvent.click(screen.getByRole("button", { name: "Download" }));
		expect(updater.downloadAndInstall).toHaveBeenCalledTimes(1);

		// Checking is disabled while a flow is in progress.
		act(() => {
			updater.emit({ downloading: true });
		});
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Check" })).toBeDisabled(),
		);
	});

	it("surfaces an updater error in a dedicated row", async () => {
		const updater = makeUpdater({ ...IDLE, error: "manifest fetch failed" });
		const platform = makePlatform(updater);

		renderPage(platform);

		expect(await screen.findByText("Update error")).toBeInTheDocument();
		expect(screen.getByText("manifest fetch failed")).toBeInTheDocument();
	});

	it("shows the ready-to-install row with the Restart Now action", async () => {
		const updater = makeUpdater();
		const platform = makePlatform(updater);

		renderPage(platform);
		await screen.findByRole("button", { name: "Check" });

		act(() => {
			updater.emit({ readyToInstall: true, version: "0.3.0" });
		});

		expect(
			await screen.findByText("Update ready to install"),
		).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: "Restart Now" }));
		expect(updater.restartAndInstall).toHaveBeenCalledTimes(1);
	});

	it("hides the updater row in dev mode and shows the dev notice", async () => {
		vi.stubEnv("PROD", false);
		const updater = makeUpdater();
		const platform = makePlatform(updater);

		renderPage(platform);

		expect(await screen.findByText("Development mode")).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Check" }),
		).not.toBeInTheDocument();
	});
});
