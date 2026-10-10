import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBootReadiness } from "@/lib/hooks/useBootReadiness";

function mockFetchOnce(payload: unknown, ok = true, status = 200) {
	return vi.fn().mockResolvedValueOnce({
		ok,
		status,
		json: () => Promise.resolve(payload),
	});
}

function mockFetchAlways(payload: unknown) {
	return (async () => ({
		ok: true,
		status: 200,
		json: () => Promise.resolve(payload),
	})) as unknown as typeof fetch;
}

describe("useBootReadiness", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal("fetch", vi.fn());
		return () => {
			vi.useRealTimers();
			vi.unstubAllGlobals();
		};
	});

	it("starts waiting and flips ready on a healthy response", async () => {
		vi.mocked(fetch).mockImplementation(
			mockFetchOnce({ ready: true, status: "ok" }),
		);
		const { result } = renderHook(() =>
			useBootReadiness("http://127.0.0.1:17493"),
		);
		expect(result.current.ready).toBe(false);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(100);
		});
		expect(result.current.ready).toBe(true);
		expect(result.current.status).toBe("ok");
	});

	it("keeps polling through connection failures without giving up", async () => {
		vi.mocked(fetch)
			.mockRejectedValueOnce(new Error("fetch failed"))
			.mockRejectedValueOnce(new Error("fetch failed"))
			.mockImplementation(mockFetchOnce({ ready: true, status: "ok" }));
		const { result } = renderHook(() =>
			useBootReadiness("http://127.0.0.1:17493"),
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1600);
		});
		expect(result.current.ready).toBe(false);
		expect(result.current.status).toBe("waiting");
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1600);
		});
		expect(result.current.ready).toBe(true);
	});

	it("surfaces startup_failed with the server error", async () => {
		vi.mocked(fetch).mockImplementation(
			mockFetchOnce({
				ready: false,
				status: "startup_failed",
				error: "corrupt database",
			}),
		);
		const { result } = renderHook(() =>
			useBootReadiness("http://127.0.0.1:17493"),
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(100);
		});
		expect(result.current.ready).toBe(false);
		expect(result.current.status).toBe("startup_failed");
		expect(result.current.error).toBe("corrupt database");
	});

	// Regression: the router gate and BackendStatusBanner each ran their own
	// poller, producing 18 /health/ready requests in 20s. A shared poller
	// must serve both without multiplying the request rate.
	it("shares one poller across concurrent subscribers", async () => {
		vi.mocked(fetch).mockImplementation(
			mockFetchAlways({ ready: false, status: "initializing" }),
		);

		const a = renderHook(() => useBootReadiness("http://127.0.0.1:17493"));
		const b = renderHook(() => useBootReadiness("http://127.0.0.1:17493"));
		const c = renderHook(() => useBootReadiness("http://127.0.0.1:17493"));

		await act(async () => {
			await vi.advanceTimersByTimeAsync(10_000);
		});

		// 10s / 1.5s interval = 1 initial probe + 6 interval ticks = 7 total,
		// regardless of how many components are subscribed.
		const polls = vi.mocked(fetch).mock.calls.length;
		expect(polls).toBeLessThanOrEqual(8);
		expect(polls).toBeGreaterThan(0);

		// Every subscriber observes the same signal.
		expect(a.result.current.status).toBe("initializing");
		expect(b.result.current.status).toBe(a.result.current.status);
		expect(c.result.current.status).toBe(a.result.current.status);
	});

	it("stops polling once the last subscriber unmounts", async () => {
		vi.mocked(fetch).mockImplementation(
			mockFetchAlways({ ready: true, status: "ok" }),
		);

		const first = renderHook(() => useBootReadiness("http://127.0.0.1:17493"));
		const second = renderHook(() => useBootReadiness("http://127.0.0.1:17493"));
		await act(async () => {
			await vi.advanceTimersByTimeAsync(100);
		});

		first.unmount();
		second.unmount();
		const afterUnmount = vi.mocked(fetch).mock.calls.length;

		await act(async () => {
			await vi.advanceTimersByTimeAsync(10_000);
		});
		expect(vi.mocked(fetch).mock.calls.length).toBe(afterUnmount);
	});
});
