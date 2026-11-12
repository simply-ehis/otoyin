/**
 * S8 S3 - lazy route graph integrity.
 *
 * Three guarantees the hidden-tabs registry can't give us:
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
 *    graph - the P5 deferral boundary is enforced here, not by convention.
 *
 * 4. Every lazy import consumed as `.then((m) => ({ default: m.Name }))`
 *    resolves to a module that actually exports `Name`. If the export is
 *    renamed, the lazy component would crash at render time while (1) and
 *    (2) stay green.
 *
 * Sources are read as raw strings via Vite's `?raw` / `import.meta.glob`
 * so this test stays in the Vite module graph (no node builtins - see
 * i18nKeys.test.ts for the same pattern). It never executes the route
 * modules.
 */

import { describe, expect, it } from "vitest";
import { REGISTRY } from "@/lib/tabs/registry";
import routerSource from "../router.tsx?raw";

const FILE_KEYS = new Set(Object.keys(import.meta.glob("../**/*.{ts,tsx}")));

const SOURCES = import.meta.glob<string>("../**/*.{ts,tsx}", {
	query: "?raw",
	import: "default",
	eager: true,
});

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
	const lazyExportMap = new Map<string, string>();
	for (const m of routerSource.matchAll(
		/import\(\s*["']([^"']+)["']\s*\)\.then\(\s*\(m\)\s*=>\s*\(\s*\{\s*default:\s*m\.([A-Za-z0-9_$]+)/g,
	)) {
		if (!lazyExportMap.has(m[1])) {
			lazyExportMap.set(m[1], m[2]);
		}
	}

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

	for (const [spec, name] of lazyExportMap) {
		it(`${spec} exports ${name}`, () => {
			const key = specToCandidates(spec).find((c) => c in SOURCES);
			expect(key, `no module source for lazy import ${spec}`).toBeTruthy();
			if (!key) {
				return;
			}
			const src = SOURCES[key] ?? "";
			const declared = new RegExp(
				`export\\s+(?:default\\s+)?(?:async\\s+)?(?:function|const|class)\\s+${name}\\b`,
			);
			const reExported = new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`);
			expect(
				declared.test(src) || reExported.test(src),
				`${key} does not export ${name} - lazy route would crash at render`,
			).toBe(true);
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
