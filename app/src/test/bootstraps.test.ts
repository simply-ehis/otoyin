/**
 * Theme bootstrap drift guard: the pre-paint scripts in app/index.html and
 * tauri/index.html statically duplicate the theme id list (they run before
 * any JS module loads). This test pins both copies to the canonical
 * THEME_IDS so a theme added or retired never boots with a dead class.
 */
import { describe, expect, it } from "vitest";
import { ALL_THEMES } from "@/lib/themes";
import tauriIndexHtml from "../../../tauri/index.html?raw";
import appIndexHtml from "../../index.html?raw";

function knownFrom(html: string): string[] | null {
	const m = html.match(/const KNOWN = \[([^\]]*)\]/);
	if (!m) {
		return null;
	}
	return m[1]
		.split(",")
		.map((t) => t.trim().replace(/['"]/g, ""))
		.filter(Boolean);
}

describe("theme bootstraps", () => {
	it("app/index.html KNOWN list matches canonical ALL_THEMES", () => {
		expect(knownFrom(appIndexHtml)).toEqual([...ALL_THEMES]);
	});

	it("tauri/index.html KNOWN list matches canonical ALL_THEMES", () => {
		expect(knownFrom(tauriIndexHtml)).toEqual([...ALL_THEMES]);
	});

	it("neither bootstrap references retired themes", () => {
		for (const retired of ["di-stefano", "coastal-light", "mesh-dark"]) {
			expect(appIndexHtml).not.toContain(retired);
			expect(tauriIndexHtml).not.toContain(retired);
		}
	});
});
