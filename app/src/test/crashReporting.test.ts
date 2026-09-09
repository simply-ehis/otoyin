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

	it("redacts Bearer tokens", () => {
		const error = new Error("auth failed");
		error.stack = "Bearer eyJhbGciOiJIUzI1NiJ9.secret.signature";
		reportCrashToBackend(error);

		const payload = vi.mocked(apiClient.reportCrash).mock.calls[0][0];
		expect(payload.stack).not.toContain("eyJhbGciOiJIUzI1NiJ9");
		expect(payload.stack).toContain("Bearer <redacted-key>");
	});

	it("redacts api_key= values", () => {
		const error = new Error(
			"request failed with api_key=supersecret123 in url",
		);
		reportCrashToBackend(error);

		const payload = vi.mocked(apiClient.reportCrash).mock.calls[0][0];
		expect(payload.message).not.toContain("supersecret123");
		expect(payload.message).toContain("<redacted-key>");
	});

	it("redacts credentialed URLs", () => {
		const error = new Error(
			"connection to https://admin:password123@db.example.com failed",
		);
		reportCrashToBackend(error);

		const payload = vi.mocked(apiClient.reportCrash).mock.calls[0][0];
		expect(payload.message).not.toContain("password123");
		// Email regex may fire first on admin@db.example.com — either <email> or <credentials> is fine
		expect(
			payload.message ===
				"connection to https://admin:password123@db.example.com failed",
		).toBe(false);
	});

	it("redacts /home/ Linux paths", () => {
		const error = new Error("file not found");
		error.stack = "at load (/home/runner/project/src/index.js:10:5)";
		reportCrashToBackend(error);

		const payload = vi.mocked(apiClient.reportCrash).mock.calls[0][0];
		expect(payload.stack).not.toContain("/home/runner");
		expect(payload.stack).toContain("<home>");
	});

	it("truncates componentStack to 4000 chars", () => {
		const longStack = "x".repeat(5000);
		const error = new Error("boom");
		reportCrashToBackend(error, { componentStack: longStack } as never);

		const payload = vi.mocked(apiClient.reportCrash).mock.calls[0][0];
		expect(payload.context).toBeDefined();
		const componentStack = (payload.context as { componentStack: string })
			.componentStack;
		expect(componentStack.length).toBeLessThanOrEqual(4000);
	});

	it("handles error with undefined message gracefully", () => {
		const error = new Error();
		error.message = undefined as unknown as string;
		reportCrashToBackend(error);

		const payload = vi.mocked(apiClient.reportCrash).mock.calls[0][0];
		expect(payload.message).toBeDefined();
		expect(typeof payload.message).toBe("string");
	});

	it("defaults kind to 'Error' when error.name is falsy", () => {
		const error = new Error("boom");
		error.name = "";
		reportCrashToBackend(error);

		const payload = vi.mocked(apiClient.reportCrash).mock.calls[0][0];
		expect(payload.kind).toBe("Error");
	});

	it("scrubs nested context values recursively", () => {
		const error = new Error("boom");
		// Pass componentStack that contains sensitive data
		reportCrashToBackend(error, {
			componentStack: "\n    in User Component (admin@company.com) at div",
		} as never);

		const payload = vi.mocked(apiClient.reportCrash).mock.calls[0][0];
		expect(payload.context).toBeDefined();
		const scrubbed = (payload.context as { componentStack: string })
			.componentStack;
		expect(scrubbed).not.toContain("admin@company.com");
		expect(scrubbed).toContain("<email>");
	});
});
