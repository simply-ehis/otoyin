/**
 * Engine/voice agreement: the prompt bar must never boot into a voice whose
 * engine is not installed, and must never list a model's preset voices before
 * that model is downloaded.
 *
 * Regression: with only kokoro installed, the first profile (a kitten_tts
 * voice) was auto-selected. The engine select went empty ("Get a TTS model")
 * while the picker still listed kitten's 8 presets from the not-downloaded
 * kitten-tts-mini model — so nothing could be generated.
 */
import { describe, expect, it } from "vitest";
import type { VoiceProfileResponse } from "@/lib/api/types";
import {
	type EngineOption,
	preferredProfile,
	selectableEngines,
} from "./engines";

function profile(id: string, engine: string): Partial<VoiceProfileResponse> {
	return {
		id,
		name: id,
		default_engine: engine,
		preset_engine: engine,
		voice_type: "preset",
	};
}

describe("preferredProfile", () => {
	const kitten = profile("kiki", "kitten_tts");
	const atlas = profile("atlas", "kokoro");
	const nova = profile("nova", "kokoro");

	it("skips voices whose engine is not installed", () => {
		const pick = preferredProfile([kitten, atlas, nova], new Set(["kokoro"]));
		expect(pick?.id).toBe("atlas");
	});

	it("keeps the first profile when nothing is installed yet", () => {
		const pick = preferredProfile([kitten, atlas, nova], new Set());
		expect(pick?.id).toBe("kiki");
	});

	it("keeps the first profile when the download set is unknown", () => {
		const pick = preferredProfile([kitten, atlas, nova], undefined);
		expect(pick?.id).toBe("kiki");
	});

	it("returns undefined for an empty profile list", () => {
		expect(preferredProfile([], new Set(["kokoro"]))).toBeUndefined();
		expect(preferredProfile(undefined, new Set(["kokoro"]))).toBeUndefined();
	});

	it("falls back to the first profile when none match the install", () => {
		const pick = preferredProfile([kitten], new Set(["qwen3_tts"]));
		expect(pick?.id).toBe("kiki");
	});

	it("reads the engine from preset_engine when default_engine is absent", () => {
		const p = [{ id: "preset-only", name: "P", preset_engine: "kokoro" }];
		const pick = preferredProfile(p, new Set(["kokoro"]));
		expect(pick?.id).toBe("preset-only");
	});
});

describe("selectableEngines", () => {
	const kokoro: EngineOption = {
		value: "kokoro",
		label: "Kokoro 82M",
		engine: "kokoro",
	};

	it("offers nothing when the voice's engine is not installed", () => {
		const voice = profile("kiki", "kitten_tts") as VoiceProfileResponse;
		expect(selectableEngines(voice, new Set(["kokoro"]))).toEqual([]);
	});

	it("offers the installed engine for a matching voice", () => {
		const voice = profile("atlas", "kokoro") as VoiceProfileResponse;
		const opts = selectableEngines(voice, new Set(["kokoro"]));
		expect(opts).toEqual([kokoro]);
	});
});
