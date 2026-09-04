import { beforeEach, describe, expect, it } from "vitest";
import { createAudioUrl, formatAudioDuration } from "@/lib/utils/audio";
import {
	isLoopbackServerUrl,
	isLoopbackTWENTYLABSServerUrl,
	isRemoteModeMisconfigured,
	useServerStore,
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

	it("accepts loopback on any port (custom local backends are local)", () => {
		expect(isLoopbackServerUrl("http://localhost:8080")).toBe(true);
	});

	it("rejects remote host", () => {
		expect(isLoopbackServerUrl("https://api.example.com:17493")).toBe(false);
	});

	it("rejects malformed URLs", () => {
		expect(isLoopbackServerUrl("not-a-url")).toBe(false);
	});

	it("rejects empty string", () => {
		expect(isLoopbackServerUrl("")).toBe(false);
	});

	it("legacy alias matches the renamed helper", () => {
		expect(isLoopbackTWENTYLABSServerUrl).toBe(isLoopbackServerUrl);
		expect(isLoopbackTWENTYLABSServerUrl("http://localhost:17493")).toBe(true);
	});
});

describe("serverStore remote mode (F1–F4)", () => {
	beforeEach(() => {
		useServerStore.setState({
			serverUrl: "http://127.0.0.1:17493",
			mode: "local",
			lastRemoteUrl: null,
		});
	});

	it("setting a LAN URL flips mode to remote and remembers it", () => {
		useServerStore.getState().setServerUrl("http://192.168.1.10:17493");
		const s = useServerStore.getState();
		expect(s.mode).toBe("remote");
		expect(s.lastRemoteUrl).toBe("http://192.168.1.10:17493");
	});

	it("setting a loopback URL flips mode back to local", () => {
		useServerStore.setState({
			serverUrl: "http://192.168.1.10:17493",
			mode: "remote",
			lastRemoteUrl: "http://192.168.1.10:17493",
		});
		useServerStore.getState().setServerUrl("http://127.0.0.1:17493");
		expect(useServerStore.getState().mode).toBe("local");
	});

	it("switching to remote restores the last remote URL", () => {
		useServerStore.setState({
			serverUrl: "http://127.0.0.1:17493",
			mode: "local",
			lastRemoteUrl: "http://192.168.1.10:17493",
		});
		useServerStore.getState().setMode("remote");
		expect(useServerStore.getState().serverUrl).toBe(
			"http://192.168.1.10:17493",
		);
	});

	it("flags remote mode on a loopback URL as misconfigured", () => {
		expect(isRemoteModeMisconfigured("remote", "http://127.0.0.1:17493")).toBe(
			true,
		);
		expect(
			isRemoteModeMisconfigured("remote", "http://192.168.1.10:17493"),
		).toBe(false);
		expect(isRemoteModeMisconfigured("local", "http://127.0.0.1:17493")).toBe(
			false,
		);
	});
});
