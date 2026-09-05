/**
 * Crash reporter tests — redaction before send, never-throw guarantee.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/lib/api/client";
import { reportCrashToBackend } from "@/lib/crashReporting";

vi.mock("@/lib/api/client", () => ({
	apiClient: {
		reportCrash: vi.fn(),
	},
}));

beforeEach(() => {
	vi.mocked(apiClient.reportCrash).mockReset();
	vi.mocked(apiClient.reportCrash).mockResolvedValue({
		stored: true,
		id: "abc",
	});
});

describe("reportCrashToBackend", () => {
	it("redacts emails, keys, and home paths before sending", () => {
		const error = new TypeError("failed for buyer@example.com");
		error.stack = "at f (C:\\Users\\Ehis\\a.js:1) key=sk-abc123XYZ456";
		reportCrashToBackend(error, { componentStack: "\n    in Panel" } as never);

		expect(apiClient.reportCrash).toHaveBeenCalledTimes(1);
		const payload = vi.mocked(apiClient.reportCrash).mock.calls[0][0];
		expect(payload.layer).toBe("frontend");
		expect(payload.kind).toBe("TypeError");
		expect(payload.message).toContain("<email>");
		expect(payload.message).not.toContain("buyer@example.com");
		expect(payload.stack).not.toContain("Ehis");
		expect(payload.stack).not.toContain("sk-abc123XYZ456");
		expect(payload.stack).toContain("<home>");
	});

	it("never throws, even when the client fails", () => {
		vi.mocked(apiClient.reportCrash).mockRejectedValue(new Error("down"));
		expect(() => reportCrashToBackend(new Error("boom"))).not.toThrow();
	});

	it("never throws, even when the client itself throws synchronously", () => {
		vi.mocked(apiClient.reportCrash).mockImplementation(() => {
			throw new Error("sync boom");
		});
		expect(() => reportCrashToBackend(new Error("boom"))).not.toThrow();
	});
});
