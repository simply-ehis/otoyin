/**
 * Regression tests for the updater toast wiring.
 *
 * Pins the exact production chain: AutoUpdateFlow → useAutoUpdater →
 * canonical toast store (@/ui/use-toast) → @/ui/toaster viewport, with a
 * fake Platform updater driven through PlatformProvider (same seam
 * GeneralPage.test.tsx uses).
 *
 * Bug history these tests keep dead:
 * 1. Dual toast stores — the router mounted the legacy @/components/ui/toaster
 *    while the hook pushed into @/ui/use-toast, so the "Update Available"
 *    toast landed in a store nobody rendered. The legacy store is now a shim
 *    re-exporting the canonical one; the identity + behavioral tests below
 *    fail if the paths ever fork again.
 * 2. `duration: Infinity` coercion — setTimeout(fn, Infinity) fires at 0ms
 *    (ToInt32), so persistent updater toasts flashed and vanished. The store
 *    now treats non-finite durations as "persist until dismissed".
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as legacyStore from "@/components/ui/use-toast";
import { AutoUpdateFlow } from "@/features/settings/AutoUpdateFlow";
import { PlatformProvider } from "@/platform/PlatformContext";
import type { Platform, UpdateStatus } from "@/platform/types";
import { Toaster } from "@/ui/toaster";
import * as canonicalStore from "@/ui/use-toast";
import { dismissToast, toast } from "@/ui/use-toast";

const IDLE: UpdateStatus = {
	checking: false,
	available: false,
	downloading: false,
	installing: false,
	readyToInstall: false,
};

/** Fake updater: records calls, lets tests push status updates. */
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
			return () => {
				listeners.delete(cb);
			};
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
		metadata: { getVersion: vi.fn(async () => "0.1.0"), isTauri: true },
	};
}

function renderFlow(updater: ReturnType<typeof makeUpdater>) {
	return render(
		<PlatformProvider platform={makePlatform(updater)}>
			<AutoUpdateFlow />
			<Toaster />
		</PlatformProvider>,
	);
}

beforeEach(() => {
	// The toast store is module-global — clear state AND pending timers.
	act(() => {
		dismissToast();
	});
});

describe("AutoUpdateFlow toast wiring", () => {
	it("available update renders the persistent toast through the real Toaster", async () => {
		const updater = makeUpdater();
		renderFlow(updater);

		// Mount-time auto-check fires (isTauri: true)
		await waitFor(() => {
			expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
		});

		act(() => {
			updater.emit({ available: true, version: "0.3.0" });
		});

		expect(await screen.findByText("Update Available")).toBeInTheDocument();
		expect(
			screen.getByText(/Version 0\.3\.0 is ready to download/),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /update now/i }),
		).toBeInTheDocument();
	});

	it("Update Now drives downloadAndInstall through the platform seam", async () => {
		const user = userEvent.setup();
		const updater = makeUpdater();
		renderFlow(updater);

		act(() => {
			updater.emit({ available: true, version: "0.3.0" });
		});
		await user.click(
			await screen.findByRole("button", { name: /update now/i }),
		);

		expect(updater.downloadAndInstall).toHaveBeenCalledTimes(1);
	});

	it("downloading state swaps the toast to progress, then to Restart Now", async () => {
		const updater = makeUpdater();
		renderFlow(updater);

		act(() => {
			updater.emit({ available: true, version: "0.3.0" });
		});
		await screen.findByText("Update Available");

		act(() => {
			updater.emit({
				downloading: true,
				downloadedBytes: 1024 * 1024 * 5,
				totalBytes: 1024 * 1024 * 10,
				downloadProgress: 50,
			});
		});
		expect(await screen.findByText("Downloading Update")).toBeInTheDocument();

		act(() => {
			updater.emit({ downloading: false, readyToInstall: true });
		});
		expect(await screen.findByText("Update Ready")).toBeInTheDocument();
		expect(screen.queryByText("Downloading Update")).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /restart now/i }),
		).toBeInTheDocument();
	});

	it("error status surfaces the destructive Update Failed toast", async () => {
		const updater = makeUpdater();
		renderFlow(updater);

		act(() => {
			updater.emit({ available: true, version: "0.3.0" });
		});
		await screen.findByText("Update Available");

		act(() => {
			updater.emit({
				available: false,
				downloading: false,
				readyToInstall: false,
				error: "signature verification failed",
			});
		});
		expect(await screen.findByText("Update Failed")).toBeInTheDocument();
		expect(
			screen.getByText("signature verification failed"),
		).toBeInTheDocument();
	});
});

describe("dual-store regression pins", () => {
	it("the legacy import path resolves to the canonical store instance", () => {
		expect(legacyStore.toast).toBe(canonicalStore.toast);
		expect(legacyStore.useToast).toBe(canonicalStore.useToast);
		expect(legacyStore.dismissToast).toBe(canonicalStore.dismissToast);
	});

	it("a toast pushed through the legacy path renders in the canonical viewport", () => {
		render(<Toaster />);
		act(() => {
			legacyStore.toast({ title: "Via legacy path" });
		});
		expect(screen.getByText("Via legacy path")).toBeInTheDocument();
	});

	it("duration: Infinity persists (no 0ms setTimeout coercion)", () => {
		vi.useFakeTimers();
		try {
			render(<Toaster />);
			act(() => {
				toast({ title: "Persistent", duration: Infinity });
				toast({ title: "Ephemeral", duration: 1000 });
			});
			expect(screen.getByText("Persistent")).toBeInTheDocument();

			act(() => {
				vi.advanceTimersByTime(60_000);
			});
			expect(screen.getByText("Persistent")).toBeInTheDocument();
			expect(screen.queryByText("Ephemeral")).not.toBeInTheDocument();
		} finally {
			vi.useRealTimers();
		}
	});
});
