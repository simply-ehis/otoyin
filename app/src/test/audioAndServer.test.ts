import { describe, expect, it } from "vitest";
import { createAudioUrl, formatAudioDuration } from "@/lib/utils/audio";
import {
	isLoopbackServerUrl,
	isLoopbackTWENTYLABSServerUrl,
} from "@/stores/serverStore";

describe("createAudioUrl", () => {
	it("constructs a URL from id and server", () => {
		expect(createAudioUrl("abc123", "http://localhost:17493")).toBe(
			"http://localhost:17493/audio/abc123",
		);
	});

	it("handles trailing slash in serverUrl", () => {
		// Current implementation doesn't strip trailing slash — document the behavior
		const url = createAudioUrl("abc", "http://localhost:17493/");
		expect(url).toContain("/audio/abc");
	});

	it("handles audioId with path characters", () => {
		expect(createAudioUrl("gen/abc", "http://localhost:17493")).toBe(
			"http://localhost:17493/audio/gen/abc",
		);
	});
});

describe("formatAudioDuration", () => {
	it("formats 0 seconds", () => {
		expect(formatAudioDuration(0)).toBe("0:00");
	});

	it("formats seconds only", () => {
		expect(formatAudioDuration(30)).toBe("0:30");
	});

	it("formats minutes and seconds", () => {
		expect(formatAudioDuration(90)).toBe("1:30");
	});

	it("pads single-digit seconds", () => {
		expect(formatAudioDuration(61)).toBe("1:01");
	});

	it("handles exactly 10 minutes", () => {
		expect(formatAudioDuration(600)).toBe("10:00");
	});

	it("truncates fractional seconds", () => {
		expect(formatAudioDuration(45.9)).toBe("0:45");
	});
});

describe("isLoopbackServerUrl", () => {
	it("detects localhost:17493", () => {
		expect(isLoopbackServerUrl("http://localhost:17493")).toBe(true);
	});

	it("detects 127.0.0.1:17493", () => {
		expect(isLoopbackServerUrl("http://127.0.0.1:17493")).toBe(true);
	});

	it("detects IPv6 loopback", () => {
		expect(isLoopbackServerUrl("http://[::1]:17493")).toBe(true);
	});

	it("rejects unbracketed IPv6 (not a valid URL)", () => {
		// http://::1:17493 is invalid URL syntax — URL constructor throws
		expect(isLoopbackServerUrl("http://::1:17493")).toBe(false);
	});

	it("rejects wrong port", () => {
		expect(isLoopbackServerUrl("http://localhost:8080")).toBe(false);
	});

	it("rejects remote host", () => {
		expect(isLoopbackServerUrl("https://api.example.com:17493")).toBe(
			false,
		);
	});

	it("rejects malformed URLs", () => {
		expect(isLoopbackServerUrl("not-a-url")).toBe(false);
	});

	it("rejects empty string", () => {
		expect(isLoopbackServerUrl("")).toBe(false);
	});

	it("legacy alias matches the renamed helper", () => {
		expect(isLoopbackTWENTYLABSServerUrl