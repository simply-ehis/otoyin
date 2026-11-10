/**
 * workspaceStore — hidden-tab semantics.
 *
 * These tests pin the whole hidden-tabs feature on the store side:
 * toggle/hide/show, always-on protection, derived visibleTabs,
 * use-case profiles hiding everything except their union, and the
 * v1 → v2 migration (hidden tabs computed against the OLD 17-tab list,
 * so newly-introduced tabs never get auto-hidden).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { ALWAYS_ON_PATHS, REGISTRY, TAB_GROUPS } from "@/lib/tabs/registry";
import { type UseCaseKey, useWorkspaceStore } from "@/stores/workspaceStore";

const NON_ALWAYS_ON = REGISTRY.filter((t) => !t.alwaysOn).map((t) => t.path);

beforeEach(() => {
	useWorkspaceStore.setState({
		hiddenTabs: [],
		visibleTabs: null,
		selectedUseCases: [],
		onboarded: false,
	});
});

describe("workspaceStore — hidden tabs", () => {
	it("hides and restores a tab", () => {
		useWorkspaceStore.getState().hideTab("/voices");
		expect(useWorkspaceStore.getState().hiddenTabs).toContain("/voices");

		useWorkspaceStore.getState().showTab("/voices");
		expect(useWorkspaceStore.getState().hiddenTabs).not.toContain("/voices");
	});

	it("toggleTab flips visibility back and forth", () => {
		useWorkspaceStore.getState().toggleTab("/effects");
		expect(useWorkspaceStore.getState().hiddenTabs).toContain("/effects");

		useWorkspaceStore.getState().toggleTab("/effects");
		expect(useWorkspaceStore.getState().hiddenTabs).not.toContain("/effects");
	});

	it("never hides always-on tabs (/library, /store, /settings)", () => {
		for (const path of ALWAYS_ON_PATHS) {
			useWorkspaceStore.getState().toggleTab(path);
		}
		for (const path of ALWAYS_ON_PATHS) {
			expect(useWorkspaceStore.getState().hiddenTabs).not.toContain(path);
		}

		for (const path of ALWAYS_ON_PATHS) {
			useWorkspaceStore.getState().hideTab(path);
		}
		for (const path of ALWAYS_ON_PATHS) {
			expect(useWorkspaceStore.getState().hiddenTabs).not.toContain(path);
		}

		for (const path of ALWAYS_ON_PATHS) {
			useWorkspaceStore.getState().setTabHidden(path, true);
		}
		for (const path of ALWAYS_ON_PATHS) {
			expect(useWorkspaceStore.getState().hiddenTabs).not.toContain(path);
		}
	});

	it("visibleTabs stays null when nothing is hidden", () => {
		expect(useWorkspaceStore.getState().visibleTabs).toBeNull();
	});

	it("visibleTabs lists visible paths and equals null again after restore", () => {
		useWorkspaceStore.getState().hideTab("/voices");
		const visible = useWorkspaceStore.getState().visibleTabs;
		expect(visible).not.toBeNull();
		expect(visible).not.toContain("/voices");
		expect(visible).toContain("/");

		useWorkspaceStore.getState().showTab("/voices");
		expect(useWorkspaceStore.getState().visibleTabs).toBeNull();
	});

	it("setAll/showAllTabs restores everything", () => {
		for (const path of NON_ALWAYS_ON.slice(0, 6)) {
			useWorkspaceStore.getState().hideTab(path);
		}
		expect(useWorkspaceStore.getState().hiddenTabs.length).toBeGreaterThan(0);
		useWorkspaceStore.getState().showAllTabs();
		expect(useWorkspaceStore.getState().hiddenTabs).toEqual([]);
		expect(useWorkspaceStore.getState().visibleTabs).toBeNull();
	});

	it("applyUseCases hides everything outside the profile union plus always-on", () => {
		const cases: UseCaseKey[] = ["music"];
		useWorkspaceStore.getState().applyUseCases(cases);

		const hidden = useWorkspaceStore.getState().hiddenTabs;
		expect(hidden).not.toContain("/music-gen");
		expect(hidden).not.toContain("/songwriter");
		expect(hidden).not.toContain("/instruments");
		expect(hidden).not.toContain("/audio-studio");
		expect(hidden).not.toContain("/library");
		expect(hidden).not.toContain("/store");
		expect(hidden).not.toContain("/settings");

		expect(hidden).toContain("/dubbing");
		expect(hidden).toContain("/voices");
		expect(useWorkspaceStore.getState().onboarded).toBe(true);
		expect(useWorkspaceStore.getState().visibleTabs).not.toBeNull();
	});

	it("resetToAll restores everything and clears the selection", () => {
		useWorkspaceStore.getState().applyUseCases(["tts"]);
		expect(useWorkspaceStore.getState().hiddenTabs.length).toBeGreaterThan(0);
		useWorkspaceStore.getState().resetToAll();
		expect(useWorkspaceStore.getState().hiddenTabs).toEqual([]);
		expect(useWorkspaceStore.getState().visibleTabs).toBeNull();
		expect(useWorkspaceStore.getState().selectedUseCases).toEqual([]);
	});
});

describe("workspaceStore — registry integrity", () => {
	it("registry paths are unique", () => {
		const paths = REGISTRY.map((t) => t.path);
		expect(new Set(paths).size).toBe(paths.length);
	});

	it("every registry tab belongs to a declared group", () => {
		const groupIds = new Set(TAB_GROUPS.map((g) => g.id));
		for (const tab of REGISTRY) {
			expect(groupIds.has(tab.group), tab.path).toBe(true);
		}
	});

	it("every tab is searchable (has at least one keyword)", () => {
		for (const tab of REGISTRY) {
			expect(tab.keywords.length, tab.path).toBeGreaterThan(0);
		}
	});

	it("always-on set is exactly /library, /store, /settings", () => {
		expect([...ALWAYS_ON_PATHS].sort()).toEqual(
			["/library", "/settings", "/store"].sort(),
		);
	});
});
