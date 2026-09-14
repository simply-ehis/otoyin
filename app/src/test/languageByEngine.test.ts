import { act } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveEngineLanguage } from "@/features/generate/engines";
import { useUIStore } from "@/stores/uiStore";

beforeEach(() => {
	useUIStore.setState({ languageByEngine: {} });
});

describe("resolveEngineLanguage", () => {
	it("prefers English by default", () => {
		expect(resolveEngineLanguage("kokoro")).toBe("en");
		expect(resolveEngineLanguage(undefined)).toBe("en");
		expect(resolveEngineLanguage("no-such-engine")).toBe("en");
	});

	it("honors a supported explicit choice", () => {
		expect(resolveEngineLanguage("kokoro", "es")).toBe("es");
		expect(resolveEngineLanguage("qwen3_tts", "zh")).toBe("zh");
	});

	it("falls back to English when the choice is unsupported", () => {
		expect(resolveEngineLanguage("parler_tts", "ja")).toBe("en");
		expect(resolveEngineLanguage("kokoro", "xx")).toBe("en");
	});
});

describe("languageByEngine memory", () => {
	it("stores a language per engine independently", () => {
		act(() => {
			useUIStore.getState().setLanguageForEngine("kokoro", "es");
			useUIStore.getState().setLanguageForEngine("qwen3_tts", "zh");
		});
		const { languageByEngine } = useUIStore.getState();
		expect(languageByEngine.kokoro).toBe("es");
		expect(languageByEngine.qwen3_tts).toBe("zh");
	});

	it("later choices overwrite earlier ones", () => {
		act(() => {
			useUIStore.getState().setLanguageForEngine("kokoro", "es");
			useUIStore.getState().setLanguageForEngine("kokoro", "fr");
		});
		expect(useUIStore.getState().languageByEngine.kokoro).toBe("fr");
	});

	it("is included in the persisted slice (survives sessions)", () => {
		const options = useUIStore.persist.getOptions();
		const slice = options.partialize?.({
			languageByEngine: { kokoro: "es" },
		} as never) as Record<string, unknown>;
		expect(slice).toMatchObject({ languageByEngine: { kokoro: "es" } });
	});
});
