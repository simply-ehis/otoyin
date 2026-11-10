/**
 * shortLicense — raw Freesound license URLs must become readable labels.
 */
import { describe, expect, it } from "vitest";
import { shortLicense } from "./SoundEffectsView";

describe("shortLicense", () => {
	it("maps common Creative Commons URLs to short labels", () => {
		expect(shortLicense("https://creativecommons.org/licenses/by/4.0/")).toBe(
			"CC BY 4.0",
		);
		expect(shortLicense("https://creativecommons.org/licenses/by/3.0/")).toBe(
			"CC BY 3.0",
		);
		expect(
			shortLicense("https://creativecommons.org/licenses/by-nc/4.0/"),
		).toBe("CC BY-NC");
		expect(
			shortLicense("https://creativecommons.org/licenses/by-nc-sa/4.0/"),
		).toBe("CC BY-NC-SA");
		expect(
			shortLicense("https://creativecommons.org/licenses/by-nc-nd/4.0/"),
		).toBe("CC BY-NC-ND");
		expect(
			shortLicense("https://creativecommons.org/licenses/by-sa/4.0/"),
		).toBe("CC BY-SA");
		expect(
			shortLicense("https://creativecommons.org/licenses/by-nd/4.0/"),
		).toBe("CC BY-ND");
	});

	it("maps public-domain style URLs", () => {
		expect(
			shortLicense("https://creativecommons.org/publicdomain/zero/1.0/"),
		).toBe("Public Domain");
		expect(shortLicense("http://opensource.org/licenses/CC0-1.0")).toBe("CC0");
	});

	it("passes through an unrecognized URL unchanged", () => {
		expect(shortLicense("https://example.com/my-license.txt")).toBe(
			"https://example.com/my-license.txt",
		);
	});

	it("returns 'Unknown license' for empty input", () => {
		expect(shortLicense("")).toBe("Unknown license");
	});
});
