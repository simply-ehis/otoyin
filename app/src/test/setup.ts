import * as jestDomMatchers from "@testing-library/jest-dom/matchers";
import type {} from "@testing-library/jest-dom/vitest";
import { expect, vi } from "vitest";

// jest-dom's `/vitest` entry silently no-ops at runtime under this toolchain
// (its re-export chain never reaches expect.extend), so extend explicitly
// from the `/matchers` entry — verified working by probe. The type-only
// import keeps jest-dom's Assertion<T> augmentation (toBeInTheDocument etc.)
// for every test file; vitest.d.ts contains only the ambient declaration.
expect.extend(jestDomMatchers);

// ── jsdom gaps Radix primitives need (browsers have these natively) ──
if (typeof window !== "undefined") {
	const w = window as unknown as Record<string, unknown>;
	if (!("ResizeObserver" in window)) {
		w.ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		};
	}
	if (!window.HTMLElement.prototype.scrollIntoView) {
		window.HTMLElement.prototype.scrollIntoView = vi.fn();
	}
	for (const method of [
		"hasPointerCapture",
		"setPointerCapture",
		"releasePointerCapture",
	] as const) {
		if (!(method in window.HTMLElement.prototype)) {
			(window.HTMLElement.prototype as unknown as Record<string, unknown>)[
				method
			] = vi.fn(() => false);
		}
	}
}
