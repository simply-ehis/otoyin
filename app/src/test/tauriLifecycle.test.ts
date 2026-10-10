/**
 * Tauri lifecycle bridge tests — the platform layer must actually drive the
 * Rust sidecar commands (previously these were web stubs, so the GPU restart
 * buttons were placebo).
 * invoke/listen are mocked: no Rust needed.
 *
 * Note there is deliberately NO close-handler test asserting that JS calls
 * `stop_server`. Closing the app is owned entirely by Rust
 * (`on_window_event` -> `stop_if_ours`); a JS-side handler racing it was the
 * cause of the orphaned backend. `closing_the_app_is_owned_by_rust` pins that.
 */
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tauriPlatform } from "@/platform/tauriPlatform";

vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
	emit: vi.fn(),
	listen: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);
const mockedListen = vi.mocked(listen);

beforeEach(() => {
	mockedInvoke.mockReset();
	mockedListen.mockReset();
});

describe("tauriPlatform.lifecycle", () => {
	it("restartServer forwards the port to the sidecar command", async () => {
		mockedInvoke.mockResolvedValue("http://127.0.0.1:18080");
		const url = await tauriPlatform.lifecycle.restartServer(null, 18080);
		expect(mockedInvoke).toHaveBeenCalledWith("restart_server", {
			modelsDir: null,
			port: 18080,
		});
		expect(url).toBe("http://127.0.0.1:18080");
	});

	it("startServer passes remote flag and null port by default", async () => {
		mockedInvoke.mockResolvedValue("http://127.0.0.1:17493");
		await tauriPlatform.lifecycle.startServer(false, null);
		expect(mockedInvoke).toHaveBeenCalledWith("start_server", {
			remote: false,
			modelsDir: null,
			port: null,
		});
	});

	it("closing the app is owned by Rust, not by a JS handler", async () => {
		// Registering a webview close handler here is what raced Rust's own
		// handler and let the window close while the backend survived.
		await tauriPlatform.lifecycle.setupWindowCloseHandler();
		expect(mockedListen).not.toHaveBeenCalled();
		expect(mockedInvoke).not.toHaveBeenCalled();
	});

	it("subscribes to server-error events", async () => {
		mockedListen.mockResolvedValue(() => {});
		const seen: unknown[] = [];
		const unsub = tauriPlatform.lifecycle.subscribeToServerErrors((e) =>
			seen.push(e),
		);
		expect(mockedListen).toHaveBeenCalledWith(
			"server-error",
			expect.any(Function),
		);
		// Simulate an arriving event.
		const cb = mockedListen.mock.calls[0]?.[1] as (event: {
			payload: unknown;
		}) => void;
		cb({ payload: { stage: "spawn", message: "boom" } });
		expect(seen).toEqual([{ stage: "spawn", message: "boom" }]);
		expect(typeof unsub).toBe("function");
	});
});
