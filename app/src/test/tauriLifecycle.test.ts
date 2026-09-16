/**
 * Tauri lifecycle bridge tests — the platform layer must actually drive the
 * Rust sidecar commands (previously these were web stubs, so the GPU
 * restart buttons and keep-running toggle were placebo).
 * invoke/listen/window are mocked: no Rust needed.
 */
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tauriPlatform } from "@/platform/tauriPlatform";

vi.mock("@tauri-apps/api/core", () => ({
	invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
	emit: vi.fn(),
	listen: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
	getCurrentWindow: vi.fn(),
}));

vi.mock("@/stores/serverStore", () => ({
	useServerStore: {
		getState: () => ({ keepServerRunningOnClose: false }),
	},
}));

const mockedInvoke = vi.mocked(invoke);
const mockedEmit = vi.mocked(emit);
const mockedListen = vi.mocked(listen);
const mockedGetCurrentWindow = vi.mocked(getCurrentWindow);

beforeEach(() => {
	mockedInvoke.mockReset();
	mockedEmit.mockReset();
	mockedListen.mockReset();
	mockedGetCurrentWindow.mockReset();
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

	it("setKeepServerRunning invokes the command", async () => {
		mockedInvoke.mockResolvedValue(undefined);
		await tauriPlatform.lifecycle.setKeepServerRunning(true);
		expect(mockedInvoke).toHaveBeenCalledWith("set_keep_server_running", {
			keepRunning: true,
		});
	});

	it("close handler stops the server then allows close", async () => {
		mockedInvoke.mockResolvedValue(undefined);
		mockedEmit.mockResolvedValue(undefined);
		let handler: ((event: { preventDefault: () => void }) => void) | undefined;
		mockedGetCurrentWindow.mockReturnValue({
			onCloseRequested: vi.fn((h) => {
				handler = h;
				return Promise.resolve(() => {});
			}),
		} as never);
		await tauriPlatform.lifecycle.setupWindowCloseHandler();
		expect(handler).not.toBeNull();
		const preventDefault = vi.fn();
		await handler?.({ preventDefault });
		expect(preventDefault).toHaveBeenCalled();
		expect(mockedInvoke).toHaveBeenCalledWith("stop_server");
		expect(mockedEmit).toHaveBeenCalledWith("window-close-allowed");
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
