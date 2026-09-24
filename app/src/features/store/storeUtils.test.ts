/**
 * storeUtils unit tests — the Store's pure-logic floor.
 *
 * Covers buildFilteredProducts end to end: category / use-case / wishlist /
 * show filters, search (name, id, note, rich-description fallback, HF repo
 * id), every sort mode, and the installed/owned ordering contract — plus
 * randomized property tests for the sort contract and unit coverage for the
 * remaining pure helpers (errors, progress, tone, price, bytes, size).
 */
import { describe, expect, it } from "vitest";
import type {
	ActiveDownloadTask,
	MarketplaceProduct,
	ModelStatus,
} from "@/lib/api/types";
import {
	buildDownloadProgressMap,
	buildErroredDownloads,
	buildFilteredProducts,
	bytesToProgress,
	CATEGORIES,
	CATEGORY_LABELS,
	type CategoryId,
	formatPrice,
	formatSize,
	getCapabilityChips,
	priceTone,
	type SortMode,
} from "./storeUtils";

// ── property-test harness (seeded PRNG — deterministic, no deps) ─────────

/** mulberry32: tiny seeded PRNG, stable across runs/platforms. */
function makeRng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const ALL_SORT_MODES: SortMode[] = [
	"default",
	"price-asc",
	"price-desc",
	"name",
];

/** Duplicate-heavy pools force tie-break paths hand-written tests miss. */
const NAME_POOL = ["Aurora", "Ember", "Aurora", "Zephyr", "Ember", "Onyx"];
const PRICE_POOL = [0, 0, 3, 9, 3, 20];

function randomProductSet(rng: () => number): MarketplaceProduct[] {
	const count = 2 + Math.floor(rng() * 38);
	return Array.from({ length: count }, (_, i) => {
		const paid = rng() < 0.5;
		return makeProduct({
			id: `p${i}`,
			name: NAME_POOL[Math.floor(rng() * NAME_POOL.length)],
			category: "tts",
			paid,
			price_usd: paid
				? PRICE_POOL[Math.floor(rng() * PRICE_POOL.length)] || 1
				: 0,
		});
	});
}

function randomEntitlements(
	rng: () => number,
	products: MarketplaceProduct[],
): { installed: Set<string>; owned: Set<string> } {
	const installed = new Set<string>();
	const owned = new Set<string>();
	for (const p of products) {
		if (rng() < 0.3) {
			installed.add(p.id);
		}
		if (rng() < 0.3) {
			owned.add(p.id);
		}
	}
	return { installed, owned };
}

/** Shuffle a copy (Fisher-Yates with the seeded rng). */
function shuffled<T>(rng: () => number, items: T[]): T[] {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/** The mode's primary sort key as a comparable tuple (name is the shared
 * tie-break, mirroring the comparator's fall-through). */
function sortKey(
	p: MarketplaceProduct,
	mode: SortMode,
): [number, number, string] | [string] {
	switch (mode) {
		case "price-asc":
			return [p.price_usd, 0, p.name];
		case "price-desc":
			return [-p.price_usd, 0, p.name];
		case "name":
			return [p.name];
		default:
			return [p.paid ? 1 : 0, p.price_usd, p.name];
	}
}

function makeProduct(
	overrides: Partial<MarketplaceProduct> = {},
): MarketplaceProduct {
	return {
		id: "test-product",
		name: "Test Product",
		category: "tts",
		price_usd: 0,
		paid: false,
		...overrides,
	};
}

// Ids deliberately avoid the MODEL_DESCRIPTIONS keys so search tests stay
// deterministic — except one product that uses "kokoro-onnx" to prove search
// reaches the rich-description fallback.
const alpha = makeProduct({
	id: "alpha",
	name: "Alpha",
	category: "tts",
	price_usd: 3,
	paid: true,
});
const bravo = makeProduct({
	id: "bravo",
	name: "Bravo",
	category: "stt",
	price_usd: 10,
	paid: true,
});
const charlie = makeProduct({
	id: "charlie",
	name: "Charlie",
	price_usd: 5,
	paid: true,
	note: "night mode ready",
	use_cases: ["podcast"],
});
const delta = makeProduct({
	id: "sirius",
	name: "Delta",
	price_usd: 0,
	paid: false,
});
const ALL = [alpha, bravo, charlie, delta];

type Args = {
	models?: ModelStatus[];
	category?: CategoryId;
	search?: string;
	showFilter?: "all" | "installed" | "available" | "paid" | "free";
	owned?: Set<string>;
	installed?: Set<string>;
	sort?: SortMode;
	useCase?: string;
	wishlist?: Set<string>;
	wishlistOnly?: boolean;
};

function run(
	a: Args = {},
	products: MarketplaceProduct[] = ALL,
): MarketplaceProduct[] {
	return buildFilteredProducts(
		products,
		a.models,
		a.category ?? "all",
		a.search ?? "",
		a.showFilter ?? "all",
		a.owned ?? new Set(),
		a.installed ?? new Set(),
		a.sort ?? "default",
		a.useCase ?? "all",
		a.wishlist,
		a.wishlistOnly ?? false,
	);
}

const ids = (list: MarketplaceProduct[]) => list.map((p) => p.id);

describe("buildFilteredProducts — sort modes", () => {
	it("default: free before paid, then price ascending, name as final tiebreak", () => {
		// Free: sirius ($0). Paid: alpha ($3) < charlie ($5) < bravo ($10).
		expect(ids(run())).toEqual(["sirius", "alpha", "charlie", "bravo"]);
	});

	it("price-asc: price ascending with name tiebreak for equal prices", () => {
		expect(ids(run({ sort: "price-asc" }))).toEqual([
			"sirius",
			"alpha",
			"charlie",
			"bravo",
		]);
	});

	it("price-desc: price descending with name tiebreak for equal prices", () => {
		expect(ids(run({ sort: "price-desc" }))).toEqual([
			"bravo",
			"charlie",
			"alpha",
			"sirius",
		]);
	});

	it("name: plain alphabetical", () => {
		expect(ids(run({ sort: "name" }))).toEqual([
			"alpha",
			"bravo",
			"charlie",
			"sirius",
		]);
	});
});

describe("buildFilteredProducts — installed/owned ordering contract", () => {
	it("an installed product leads the grid even with the lowest price", () => {
		// charlie is installed; it must still rank first.
		expect(
			ids(run({ sort: "price-asc", installed: new Set(["charlie"]) })),
		).toEqual(["charlie", "sirius", "alpha", "bravo"]);
	});

	it("ownership alone (without install) is enough to lead", () => {
		const viaInstalled = ids(run({ installed: new Set(["charlie"]) }));
		const viaOwned = ids(run({ owned: new Set(["charlie"]) }));
		expect(viaOwned).toEqual(viaInstalled);
		expect(viaOwned[0]).toBe("charlie");
	});

	it("the top group itself is ordered by the active sort mode", () => {
		// bravo (owned) and charlie (installed) both rank 0; default sort
		// orders that group: both paid → price ascending (charlie $5 < bravo $10).
		expect(
			ids(
				run({
					installed: new Set(["charlie"]),
					owned: new Set(["bravo"]),
				}),
			),
		).toEqual(["charlie", "bravo", "sirius", "alpha"]);
	});
});

describe("buildFilteredProducts — filters", () => {
	it("category filters by product category", () => {
		expect(ids(run({ category: "tts" }))).toEqual([
			"sirius",
			"alpha",
			"charlie",
		]);
		expect(ids(run({ category: "stt" }))).toEqual(["bravo"]);
	});

	it("filters the instruments category for soundfont banks", () => {
		const bank = makeProduct({
			id: "sf2-generaluser-gs",
			name: "GeneralUser GS",
			category: "instruments",
		});
		expect(ids(run({ category: "instruments" }, [alpha, bank]))).toEqual([
			"sf2-generaluser-gs",
		]);
	});

	it("showFilter: installed / available / paid / free", () => {
		const installed = new Set(["bravo"]);
		expect(ids(run({ showFilter: "installed", installed }))).toEqual(["bravo"]);
		expect(ids(run({ showFilter: "available", installed }))).toEqual([
			"sirius",
			"alpha",
			"charlie",
		]);
		expect(ids(run({ showFilter: "paid" }))).toEqual([
			"alpha",
			"charlie",
			"bravo",
		]);
		expect(ids(run({ showFilter: "free" }))).toEqual(["sirius"]);
	});

	it("use-case filter matches use_cases and excludes products without any", () => {
		expect(ids(run({ useCase: "podcast" }))).toEqual(["charlie"]);
	});

	it("wishlist-only narrows to wishlisted products, still sorted", () => {
		expect(
			ids(
				run({
					wishlist: new Set(["alpha", "sirius"]),
					wishlistOnly: true,
				}),
			),
		).toEqual(["sirius", "alpha"]);
	});

	it("filters compose", () => {
		expect(ids(run({ category: "tts", showFilter: "paid" }))).toEqual([
			"alpha",
			"charlie",
		]);
	});
});

describe("buildFilteredProducts — search", () => {
	it("matches name case-insensitively", () => {
		expect(ids(run({ search: "ALPH" }))).toEqual(["alpha"]);
	});

	it("matches id", () => {
		expect(ids(run({ search: "sirius" }))).toEqual(["sirius"]);
	});

	it("matches note", () => {
		expect(ids(run({ search: "night mode" }))).toEqual(["charlie"]);
	});

	it("matches the rich description fallback (MODEL_DESCRIPTIONS)", () => {
		const kokoro = makeProduct({
			id: "kokoro-onnx",
			name: "The Default Voice",
		});
		// "hexgrad" appears only in MODEL_DESCRIPTIONS["kokoro-onnx"].
		expect(ids(run({ search: "hexgrad" }, [kokoro]))).toEqual(["kokoro-onnx"]);
	});

	it("matches the model's hf_repo_id from /models/status", () => {
		const models: ModelStatus[] = [
			{
				model_name: "sirius",
				display_name: "Delta",
				downloaded: true,
				downloading: false,
				loaded: false,
				hf_repo_id: "acme/whisper-tiny",
			},
		];
		expect(ids(run({ models, search: "acme/whisper" }))).toEqual(["sirius"]);
	});

	it("whitespace-only search is ignored", () => {
		expect(run({ search: "   " })).toHaveLength(4);
	});
});

describe("getCapabilityChips", () => {
	it("surfaces non-commercial and license metadata", () => {
		const base: ModelStatus = {
			model_name: "fish-speech-s2-pro",
			display_name: "Fish Audio S2 Pro",
			downloaded: false,
			downloading: false,
			loaded: false,
		};
		expect(
			getCapabilityChips({ ...base, commercial_use: false }),
		).toContainEqual({
			label: "Non-commercial",
			tone: "red",
		});
		expect(
			getCapabilityChips({ ...base, license_id: "cc-by-4.0" }),
		).toContainEqual({
			label: "License",
			tone: "zinc",
		});
	});
});

describe("buildFilteredProducts — edges", () => {
	it("empty catalog yields an empty grid", () => {
		expect(run({}, [])).toEqual([]);
	});
});

// ── property tests: the sort contract under randomized inputs ─────────

/**
 * The contract under test (mirrors the comparator in buildFilteredProducts):
 *  P1 — installed/owned (entitled) products always precede the rest, in every
 *       sort mode, for any input ordering and any entitlement set;
 *  P2 — within the same entitlement rank, adjacent pairs satisfy the active
 *       mode's primary key, with name as the shared tie-break (the hand-
 *       written suite can't enumerate every tie shape; randomized duplicate-
 *       heavy pools can);
 *  P3 — the ordered key sequence is invariant under input permutation: same
 *       keys in the same order regardless of how the products were shuffled
 *       in (catches unstable-sort / comparator-inconsistency regressions).
 */
describe("buildFilteredProducts — sort contract properties (randomized)", () => {
	const SEEDS = [7, 1337, 90_210, 424_242];
	const RUNS_PER_SEED = 40;

	for (const mode of ALL_SORT_MODES) {
		it(`P1+P2+P3 hold under [${mode}] across random sets`, () => {
			for (const seed of SEEDS) {
				const rng = makeRng(seed + mode.length);
				for (let run = 0; run < RUNS_PER_SEED; run++) {
					const products = randomProductSet(rng);
					const { installed, owned } = randomEntitlements(rng, products);

					const out = buildFilteredProducts(
						products,
						undefined,
						"all",
						"",
						"all",
						owned,
						installed,
						mode,
					);
					expect(out).toHaveLength(products.length); // nothing dropped

					// P1: no non-entitled product precedes an entitled one.
					let sawNonEntitled = false;
					for (const p of out) {
						if (installed.has(p.id) || owned.has(p.id)) {
							if (sawNonEntitled) {
								throw new Error(
									`P1 violated under [${mode}] seed=${seed} run=${run}: ` +
										`${p.id} (entitled) after a non-entitled product`,
								);
							}
						} else {
							sawNonEntitled = true;
						}
					}

					// P2: adjacent same-rank pairs satisfy the mode's key order —
					// full lexicographic element-wise comparison, mirroring the
					// comparator's fall-through (e.g. default = paid, then price,
					// THEN name; a primary-only check would false-fail price ties).
					const rank = (p: MarketplaceProduct) =>
						installed.has(p.id) || owned.has(p.id) ? 0 : 1;
					for (let i = 1; i < out.length; i++) {
						const prev = out[i - 1];
						const cur = out[i];
						if (rank(prev) !== rank(cur)) {
							continue;
						}
						const kPrev = sortKey(prev, mode);
						const kCur = sortKey(cur, mode);
						for (let k = 0; k < kPrev.length; k++) {
							const a = kPrev[k];
							const b = kCur[k];
							const cmp =
								typeof a === "string" || typeof b === "string"
									? String(a).localeCompare(String(b))
									: (a as number) - (b as number);
							if (cmp !== 0) {
								expect(cmp).toBeLessThanOrEqual(0);
								break;
							}
						}
					}

					// P3: permutation invariance of the ordered key sequence.
					const keysOf = (list: MarketplaceProduct[]) =>
						list.map(
							(p) =>
								[
									installed.has(p.id) || owned.has(p.id) ? 0 : 1,
									...(mode === "name"
										? [p.name]
										: (sortKey(p, mode) as [number, number, string])),
								] as Array<number | string>,
						);
					const keysOriginal = JSON.stringify(keysOf(out));
					for (let perm = 0; perm < 3; perm++) {
						const permuted = shuffled(rng, products);
						const out2 = buildFilteredProducts(
							permuted,
							undefined,
							"all",
							"",
							"all",
							owned,
							installed,
							mode,
						);
						expect(JSON.stringify(keysOf(out2))).toBe(keysOriginal);
					}
				}
			}
		});
	}

	it("P1 holds with everything entitled (whole-set rank-0) and nothing entitled", () => {
		for (const seed of SEEDS) {
			const rng = makeRng(seed * 31 + 17);
			const products = randomProductSet(rng);
			const allInst = new Set(products.map((p) => p.id));
			const none = new Set<string>();
			for (const mode of ALL_SORT_MODES) {
				const outAll = buildFilteredProducts(
					products,
					undefined,
					"all",
					"",
					"all",
					new Set(),
					allInst,
					mode,
				);
				const outNone = buildFilteredProducts(
					products,
					undefined,
					"all",
					"",
					"all",
					none,
					new Set(),
					mode,
				);
				// Degenerate cases must still produce the full set in an order
				// consistent with the mode keys (P2 already checks pairs; here
				// we pin that entitlement degeneracy never drops or duplicates).
				expect(new Set(outAll.map((p) => p.id))).toEqual(
					new Set(products.map((p) => p.id)),
				);
				expect(new Set(outNone.map((p) => p.id))).toEqual(
					new Set(products.map((p) => p.id)),
				);
			}
		}
	});
});

// ── remaining pure helpers: errors, progress, tone, price, size ───────

/** Minimal ActiveDownloadTask factory (only the fields the helpers read). */
function makeTask(
	overrides: Partial<ActiveDownloadTask> = {},
): ActiveDownloadTask {
	return {
		model_name: "m",
		status: "downloading",
		started_at: "2026-01-01T00:00:00Z",
		...overrides,
	};
}

describe("buildErroredDownloads", () => {
	it("collects backend error tasks, excluding dismissed ones", () => {
		const tasks = {
			downloads: [
				makeTask({ model_name: "a", status: "error", error: "disk full" }),
				makeTask({ model_name: "b", status: "error", error: "timeout" }),
				makeTask({ model_name: "c", status: "downloading" }),
			],
		};
		const out = buildErroredDownloads(tasks, new Set(["b"]), new Map());
		expect([...out.keys()]).toEqual(["a"]);
		expect(out.get("a")?.error).toBe("disk full");
	});

	it("adds local-only errors as synthesized error tasks", () => {
		const out = buildErroredDownloads(
			{ downloads: [] },
			new Set(),
			new Map([["local-1", "offline"]]),
		);
		expect([...out.keys()]).toEqual(["local-1"]);
		expect(out.get("local-1")?.status).toBe("error");
		expect(out.get("local-1")?.error).toBe("offline");
		expect(out.get("local-1")?.model_name).toBe("local-1");
	});

	it("local error text overrides the backend task's own message", () => {
		const tasks = {
			downloads: [
				makeTask({ model_name: "a", status: "error", error: "http 500" }),
			],
		};
		const out = buildErroredDownloads(
			tasks,
			new Set(),
			new Map([["a", "network unreachable"]]),
		);
		expect(out.get("a")?.error).toBe("network unreachable");
		// The backend task identity is preserved (spread), not replaced.
		expect(out.get("a")?.started_at).toBe("2026-01-01T00:00:00Z");
	});

	it("dismissed local errors are excluded; undefined payload is tolerated", () => {
		const out = buildErroredDownloads(
			undefined,
			new Set(["gone"]),
			new Map([
				["gone", "offline"],
				["kept", "quota"],
			]),
		);
		expect([...out.keys()]).toEqual(["kept"]);
	});
});

describe("buildDownloadProgressMap", () => {
	it("keeps only downloading tasks, keyed by model name", () => {
		const tasks = {
			downloads: [
				makeTask({ model_name: "live", status: "downloading" }),
				makeTask({ model_name: "done", status: "completed" }),
				makeTask({ model_name: "bad", status: "error" }),
			],
		};
		const out = buildDownloadProgressMap(tasks);
		expect([...out.keys()]).toEqual(["live"]);
	});

	it("undefined payload yields an empty map", () => {
		expect(buildDownloadProgressMap(undefined).size).toBe(0);
	});

	it("duplicate model names: last task wins", () => {
		const tasks = {
			downloads: [
				makeTask({ model_name: "x", current: 1 }),
				makeTask({
					model_name: "x",
					current: 2,
					total: 10,
					progress: 20,
					filename: "w.bin",
				}),
			],
		};
		const out = buildDownloadProgressMap(tasks);
		expect(out.get("x")?.current).toBe(2);
		expect(out.get("x")?.total).toBe(10);
	});
});

describe("priceTone", () => {
	const paid = makeProduct({ id: "paid", paid: true, price_usd: 9 });
	const free = makeProduct({ id: "free", paid: false });

	it("owned or installed → emerald, regardless of paid flag", () => {
		expect(priceTone(paid, true, false)).toBe("emerald");
		expect(priceTone(paid, false, true)).toBe("emerald");
		expect(priceTone(paid, true, true)).toBe("emerald");
	});

	it("unowned + uninstalled: paid → amber, free → emerald", () => {
		expect(priceTone(paid, false, false)).toBe("amber");
		expect(priceTone(free, false, false)).toBe("emerald");
	});

	it("keys off the paid flag, not the price value", () => {
		expect(
			priceTone(makeProduct({ paid: true, price_usd: 0 }), false, false),
		).toBe("amber");
	});
});

describe("formatPrice", () => {
	const paid = makeProduct({ id: "paid", paid: true, price_usd: 9 });
	const free = makeProduct({ id: "free", paid: false });

	it("free products show Free regardless of FX", () => {
		expect(formatPrice(free)).toBe("Free");
		expect(
			formatPrice(free, { currency: "EUR", rate: 0.92, locale: "de-DE" }),
		).toBe("Free");
	});

	it("legacy path: no FX / USD / non-positive rate → plain dollars", () => {
		expect(formatPrice(paid)).toBe("$9");
		expect(
			formatPrice(paid, { currency: "USD", rate: 1, locale: "en-US" }),
		).toBe("$9");
		expect(
			formatPrice(paid, { currency: "EUR", rate: 0, locale: "de-DE" }),
		).toBe("$9");
	});

	it("FX path converts and localizes (9 USD × 0.9 → 8,10 €)", () => {
		const out = formatPrice(paid, {
			currency: "EUR",
			rate: 0.9,
			locale: "de-DE",
		});
		expect(out).not.toBe("$9");
		expect(out).toMatch(/8[.,]10/);
		expect(out).toContain("€");
	});

	it("FX path falls back to dollars when Intl rejects the currency", () => {
		// "???" is not a well-formed currency code → formatMoney's catch fires,
		// rendering the converted amount with the plain-dollar fallback.
		expect(
			formatPrice(paid, { currency: "???", rate: 0.9, locale: "en-US" }),
		).toBe("$8.10");
	});
});

describe("bytesToProgress", () => {
	it("undefined task → null (no progress row)", () => {
		expect(bytesToProgress(undefined)).toBeNull();
	});

	it("with totals: MB-formatted label and raw percentage", () => {
		const out = bytesToProgress(
			makeTask({
				progress: 50,
				current: 5 * 1024 * 1024,
				total: 10 * 1024 * 1024,
			}),
		);
		expect(out?.pct).toBe(50);
		expect(out?.label).toBe("5.0 / 10.0 MB (50%)");
	});

	it("without totals: falls back to filename, then Connecting…", () => {
		expect(bytesToProgress(makeTask({ filename: "w.bin" }))?.label).toBe(
			"w.bin",
		);
		expect(bytesToProgress(makeTask({}))?.label).toBe("Connecting…");
	});

	it("missing progress field defaults to 0", () => {
		expect(bytesToProgress(makeTask({}))?.pct).toBe(0);
	});
});

describe("formatSize", () => {
	it("falsy → empty string (tag hidden)", () => {
		expect(formatSize(undefined)).toBe("");
		expect(formatSize(0)).toBe("");
	});

	it("below 1 GB → MB with one decimal", () => {
		expect(formatSize(80)).toBe("80.0 MB");
		expect(formatSize(1023.9)).toBe("1023.9 MB");
	});

	it("1 GB and above → GB with two decimals", () => {
		expect(formatSize(1024)).toBe("1.00 GB");
		expect(formatSize(1587)).toBe("1.55 GB");
	});
});

describe("CATEGORY_LABELS", () => {
	it("labels every browsable category (badges never show raw codes)", () => {
		for (const c of CATEGORIES) {
			if (c.id === "all") {
				continue;
			}
			expect(CATEGORY_LABELS[c.id], `missing label for ${c.id}`).toMatch(/\S/);
		}
	});
});
