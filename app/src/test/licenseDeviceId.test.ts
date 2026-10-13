/**
 * getLicenseDeviceId — machine-bound device id for checkout/license binding.
 *
 * Must use the bundled backend's fingerprint (the same one
 * licensing.verify_license() checks at install time) and cache it; falls
 * back to the anonymous local id when the backend is unreachable, and
 * retries on a later call instead of caching the failure.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiClientMock } = vi.hoisted(() => ({
	apiClientMock: { getLicenseDeviceId: vi.fn() },
}));

vi.mock("@/lib/api/client", () => ({ apiClient: apiClientMock }));

const LOCAL_ID = "local-fallback-id";

/** Fresh module per test — getLicenseDeviceId caches in module state. */
async function importHelper() {
	const mod = await import("@/lib/marketplace");
	return mod.getLicenseDeviceId;
}

beforeEach(() => {
	vi.resetModules();
	apiClientMock.getLicenseDeviceId.mockReset();
	localStorage.setItem("21labs_device_id", LOCAL_ID);
});

describe("getLicenseDeviceId", () => {
	it("returns the backend machine fingerprint when available", async () => {
		apiClientMock.getLicenseDeviceId.mockResolvedValue({
			device_id: "f".repeat(64),
		});
		const getId = await importHelper();
		await expect(getId()).resolves.toBe("f".repeat(64));
	});

	it("caches the id across calls", async () => {
		apiClientMock.getLicenseDeviceId.mockResolvedValue({ device_id: "cached" });
		const getId = await importHelper();
		await expect(getId()).resolves.toBe("cached");
		await expect(getId()).resolves.toBe("cached");
		expect(apiClientMock.getLicenseDeviceId).toHaveBeenCalledTimes(1);
	});

	it("falls back to the local id when the backend is unreachable", async () => {
		apiClientMock.getLicenseDeviceId.mockRejectedValue(new Error("down"));
		const getId = await importHelper();
		await expect(getId()).resolves.toBe(LOCAL_ID);
	});

	it("retries after a failure instead of caching it", async () => {
		apiClientMock.getLicenseDeviceId
			.mockRejectedValueOnce(new Error("down"))
			.mockResolvedValueOnce({ device_id: "recovered" });
		const getId = await importHelper();
		await expect(getId()).resolves.toBe(LOCAL_ID);
		await expect(getId()).resolves.toBe("recovered");
	});
});
