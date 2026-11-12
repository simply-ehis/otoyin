/**
 * S8 S3 — lazy route graph integrity.
 *
 * Two guarantees the hidden-tabs registry can't give us:
 *
 * 1. Every dynamic import() in router.tsx resolves to a real module under
 *    src/. A deleted or renamed component behind a lazy route compiles
 *    fine but fails at runtime ("Reload tab").
 *
 * 2. Every tab path in the tab registry is registered as a route in
 *    router.tsx. A registry entry without a matching route is a tab that
 *    renders nothing.
 *
 * 3. router.tsx carries no static `@/features/...` imports. Anything loaded
 *    statically lands in the boot chunk, which defeats the whole lazy
 *    graph — the P5 deferral boundary is enforced here, not by convention.
 *
 * Sources are read as raw strings via Vite's `?raw` / `import.meta.glob`
 * so this test stays in the Vite module graph (no node builtins — see
 * i18nKeys.test.ts for the same pattern). It never executes the route
 * modules.
 */

import { describe, expect, it } from "vitest";
import { REGISTRY } from "@/lib/tabs/registry";
import routerSource from "../router.tsx?raw";

const FILE_KEYS = new Set(Object.keys(import.meta.glob("../**/*.{ts,tsx}")));

function specToCandidates(spec: string): string[] {
	const clean = spec.replace(/^@\//, "").replace(/^\.\//, "../");
	const base = `../${clean}`;
	return [
		base,
		`${base}.tsx`,
		`${base}.ts`,
		`${base}.jsx`,
		`${base}.js`,
		`${base}/index.tsx`,
		`${base}/index.ts`,
	];
}

describe("lazy route graph", () => {
	const specs = [
		...new Set(
			[...routerSource.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map(
				(m) => m[1],
			),
		),
	];

	it("router.tsx declares at least one lazy import", () => {
		expect(specs.length).toBeGreaterThan(0);
	});

	it("router.tsx carries no static @/features/... imports (P5 boot-chunk boundary)", () => {
		const staticFeatureImports = [
			...routerSource.matchAll(/import\s*\{[^}]*\}\s*from\s*"@\/features\//g),
		];
		expect(
			staticFeatureImports.map((m) => m[0]),
			"boot chunk must not statically import feature modules",
		).toEqual([]);
	});

	for (const spec of specs) {
		it(`resolves ${spec}`, () => {
			const found = specToCandidates(spec).some((c) => FILE_KEYS.has(c));
			expect(found, `no module for lazy import ${spec}`).toBe(true);
		});
	}

	for (const entry of REGISTRY) {
		it(`registry tab ${entry.path} has a route`, () => {
			// Route registrations use `path: "/x/y"` or `path: "/"` for index.
			const escaped = entry.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			const pattern = new RegExp(`path:\\s*["']${escaped}["']`);
			expect(
				pattern.test(routerSource),
				`no route registered for registry tab ${entry.path}`,
			).toBe(true);
		});
	}
});
