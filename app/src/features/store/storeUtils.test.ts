/**
 * storeUtils unit tests — buildFilteredProducts.
 *
 * Covers the pure Store pipeline end to end: category / use-case / wishlist /
 * show filters, search (name, id, note, rich-description fallback, HF repo
 * id), every sort mode, and the installed/owned ordering contract: a product
 * that is installed OR owned ranks ahead of everything else within every sort
 * mode, while the active sort still orders inside that top group.
 */
import { describe, expect, it } from "vitest";
import type { MarketplaceProduct, ModelStatus } from "@/lib/api/types";
import {
	buildFilteredProducts,
	type CategoryId,
	type SortMode,
} from "./storeUtils";

function makeProduct(
	overrides: Partial<MarketplaceProduct> = {},
): MarketplaceProduct {
	return {
		id: "test-product",
		name: "Test Product",
		category: "tts",
		price_usd: 0,
		paid: false,
		quality_score: 5,
		...overrides,
	};
}

// Ids deliberately avoid the MODEL_DESCRIPTIONS keys so search tests stay
// deterministic — except one product that uses "kokoro-onnx" to prove search
// reaches the rich-description fallback.
const alpha = makeProduct({ id: "alpha", name: "Alpha", quality_score: 5 });
const bravo = makeProduct({
	id: "bravo",
	name: "Bravo",
	category: "stt",
	price_usd: 10,
	paid: true,
	quality_score: 9,
});
const charlie = makeProduct({
	id: "charlie",
	name: "Charlie",
	price_usd: 5,
	paid: true,
	quality_score: 7,
	note: "night mode ready",
	use_cases: ["podcast"],
});
const delta = makeProduct({ id: "sirius", name: "Delta", quality_score: 9 });
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
	it("default: free before paid, then quality desc, name as final tiebreak", () => {
		// Free: delta (q9) > alpha (q5); paid: bravo (q9) > charlie (q7).
		expect(ids(run())).toEqual(["sirius", "alpha", "bravo", "charlie"]);
	});

	it("quality: quality desc with name tiebreak", () => {
		// bravo (9) and delta (9) tie -> name orders bravo first.
		expect(ids(run({ sort: "quality" }))).toEqual([
			"bravo",
			"sirius",
			"charlie",
			"alpha",
		]);
	});

	it("price-asc: price ascending with name tiebreak for equal prices", () => {
		expect(ids(run({ sort: "price-asc" }))).toEqual([
			"alpha",
			"sirius",
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
	it("an installed product leads the grid even with the lowest quality", () => {
		// charlie (q7) is installed; in quality mode it must still rank first.
		expect(
			ids(run({ sort: "quality", installed: new Set(["charlie"]) })),
		).toEqual(["charlie", "bravo", "sirius", "alpha"]);
	});

	it("ownership alone (without install) is enough to lead", () => {
		const viaInstalled = ids(run({ installed: new Set(["charlie"]) }));
		const viaOwned = ids(run({ owned: new Set(["charlie"]) }));
		expect(viaOwned).toEqual(viaInstalled);
		expect(viaOwned[0]).toBe("charlie");
	});

	it("the top group itself is ordered by the active sort mode", () => {
		// bravo (owned) and charlie (installed) both rank 0; default sort
		// orders that group: both paid -> quality desc (bravo q9 > charlie q7).
		expect(
			ids(
				run({
					installed: new Set(["charlie"]),
					owned: new Set(["bravo"]),
				}),
			),
		).toEqual(["bravo", "charlie", "sirius", "alpha"]);
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

	it("showFilter: installed / available / paid / free", () => {
		const installed = new Set(["bravo"]);
		expect(ids(run({ showFilter: "installed", installed }))).toEqual(["bravo"]);
		expect(ids(run({ showFilter: "available", installed }))).toEqual([
			"sirius",
			"alpha",
			"charlie",
		]);
		expect(ids(run({ showFilter: "paid" }))).toEqual(["bravo", "charlie"]);
		expect(ids(run({ showFilter: "free" }))).toEqual(["sirius", "alpha"]);
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

describe("buildFilteredProducts — edges", () => {
	it("empty catalog yields an empty grid", () => {
		expect(run({}, [])).toEqual([]);
	});
});
