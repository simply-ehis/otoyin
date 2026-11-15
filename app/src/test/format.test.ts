import { describe, expect, it } from "vitest";
import {
	formatDate,
	formatDuration,
	formatEngineName,
	formatFileSize,
} from "@/lib/utils/format";

describe("formatDuration", () => {
	it("formats 0 seconds", () => {
		expect(formatDuration(0)).toBe("0:00");
	});

	it("formats seconds only", () => {
		expect(formatDuration(45)).toBe("0:45");
	});

	it("formats minutes and seconds", () => {
		expect(formatDuration(125)).toBe("2:05");
	});

	it("pads single-digit seconds", () => {
		expect(formatDuration(61)).toBe("1:01");
	});

	it("formats exactly one hour", () => {
		expect(formatDuration(3600)).toBe("60:00");
	});

	it("truncates fractional seconds", () => {
		expect(formatDuration(90.7)).toBe("1:30");
	});

	it("handles large values", () => {
		expect(formatDuration(7384)).toBe("123:04");
	});
});

describe("formatDate", () => {
	it("returns 'just now' for recent dates", () => {
		const now = new Date();
		expect(formatDate(now)).toBe("just now");
	});

	it("returns minutes ago", () => {
		const d = new Date(Date.now() - 5 * 60 * 1000);
		expect(formatDate(d)).toBe("5m ago");
	});

	it("returns hours ago", () => {
		const d = new Date(Date.now() - 3 * 3600 * 1000);
		expect(formatDate(d)).toBe("3h ago");
	});

	it("returns days ago", () => {
		const d = new Date(Date.now() - 7 * 86400 * 1000);
		expect(formatDate(d)).toBe("7d ago");
	});

	it("returns months ago", () => {
		const d = new Date(Date.now() - 3 * 2592000 * 1000);
		expect(formatDate(d)).toBe("3mo ago");
	});

	it("returns years ago", () => {
		const d = new Date(Date.now() - 2 * 31536000 * 1000);
		expect(formatDate(d)).toBe("2y ago");
	});

	it("accepts ISO string input", () => {
		const d = new Date(Date.now() - 120 * 1000);
		expect(formatDate(d.toISOString())).toBe("2m ago");
	});
});

describe("formatEngineName", () => {
	it("formats known engines", () => {
		expect(formatEngineName("kokoro")).toBe("Kokoro");
		expect(formatEngineName("voxcpm2")).toBe("VoxCPM2");
		expect(formatEngineName("styletts2")).toBe("StyleTTS2");
		expect(formatEngineName("orpheus")).toBe("Orpheus");
	});

	it("includes model size when provided", () => {
		expect(formatEngineName("kokoro", "2B-Q4_K_M")).toBe("Kokoro 2B-Q4_K_M");
	});

	it("returns raw engine name when unknown", () => {
		expect(formatEngineName("unknown_engine")).toBe("unknown_engine");
	});

	it("returns 'No model' for undefined", () => {
		expect(formatEngineName()).toBe("No model");
	});

	it("returns 'No model' for undefined with size", () => {
		expect(formatEngineName(undefined, "tiny")).toBe("No model");
	});
});

describe("formatFileSize", () => {
	it("formats 0 bytes", () => {
		expect(formatFileSize(0)).toBe("0 Bytes");
	});

	it("formats bytes", () => {
		expect(formatFileSize(500)).toBe("500 Bytes");
	});

	it("formats kilobytes", () => {
		expect(formatFileSize(1024)).toBe("1 KB");
	});

	it("formats megabytes", () => {
		expect(formatFileSize(1048576)).toBe("1 MB");
	});

	it("formats gigabytes", () => {
		expect(formatFileSize(1073741824)).toBe("1 GB");
	});

	it("rounds to 2 decimal places", () => {
		expect(formatFileSize(1536)).toBe("1.5 KB");
	});

	it("handles fractional MB", () => {
		expect(formatFileSize(2621440)).toBe("2.5 MB");
	});
});
