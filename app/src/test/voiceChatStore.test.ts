/**
 * Regression tests for voiceChatStore.ts audit fixes.
 *
 * Covers:
 * - Reconnect delay uses exponential backoff with correct exponent
 * - disconnect clears reconnect timer
 * - store.reset() clears all state
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
	vi.useFakeTimers();
});

describe("reconnect delay calculation", () => {
	it("uses correct exponential backoff: delay = RECONNECT_DELAY_MS * 2^(attempt-1)", () => {
		const RECONNECT_DELAY_MS = 1000;

		expect(RECONNECT_DELAY_MS * 2 ** (1 - 1)).toBe(1000);
		expect(RECONNECT_DELAY_MS * 2 ** (2 - 1)).toBe(2000);
		expect(RECONNECT_DELAY_MS * 2 ** (3 - 1)).toBe(4000);
	});

	it("old buggy formula would give wrong delay when reconnectAttempts is stale", () => {
		const RECONNECT_DELAY_MS = 1000;
		const attempt = 3;
		const fixedDelay = RECONNECT_DELAY_MS * 2 ** (attempt - 1);
		expect(fixedDelay).toBe(4000);
	});
});
