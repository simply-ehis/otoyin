import { describe, expect, it } from "vitest";
import type { ModelStatus, ModelStatusListResponse } from "@/lib/api/types";
import {
	downloadedTtsEngines,
	firstDownloadedTtsEngine,
} from "./useFirstDownloadedTtsEngine";

function model(over: Partial<ModelStatus>): ModelStatus {
	return {
		model_name: "m",
		display_name: "M",
		engine: "kokoro",
		downloaded: false,
		downloading: false,
		loaded: false,
		category: "tts",
		...over,
	};
}

function status(models: ModelStatus[]): ModelStatusListResponse {
	return { models } as ModelStatusListResponse;
}

describe("firstDownloadedTtsEngine", () => {
	it("returns the first downloaded tts engine", () => {
		const s = status([
			model({ model_name: "kokoro", engine: "kokoro", downloaded: true }),
			model({ model_name: "xtts", engine: "xtts_v2", downloaded: true }),
		]);
		expect(firstDownloadedTtsEngine(s)).toBe("kokoro");
	});

	it("ignores undownloaded engines and keeps searching", () => {
		const s = status([
			model({ model_name: "kokoro", engine: "kokoro", downloaded: false }),
			model({ model_name: "xtts", engine: "xtts_v2", downloaded: true }),
		]);
		expect(firstDownloadedTtsEngine(s)).toBe("xtts_v2");
	});

	it("ignores downloaded non-tts engines", () => {
		const s = status([
			model({
				model_name: "whisper",
				engine: "whisper",
				downloaded: true,
				category: "stt",
			}),
		]);
		expect(firstDownloadedTtsEngine(s)).toBeUndefined();
	});

	it("returns undefined when nothing is downloaded or input is missing", () => {
		expect(firstDownloadedTtsEngine(status([]))).toBeUndefined();
		expect(firstDownloadedTtsEngine(undefined)).toBeUndefined();
	});
});

describe("downloadedTtsEngines", () => {
	it("returns only downloaded tts engine ids, in order", () => {
		const s = status([
			model({ model_name: "kokoro", engine: "kokoro", downloaded: true }),
			model({ model_name: "xtts", engine: "xtts_v2", downloaded: true }),
			model({
				model_name: "whisper",
				engine: "whisper",
				downloaded: true,
				category: "stt",
			}),
			model({ model_name: "zonos", engine: "zonos", downloaded: false }),
		]);
		expect(downloadedTtsEngines(s)).toEqual(["kokoro", "xtts_v2"]);
	});

	it("returns an empty array when nothing is downloaded or input is missing", () => {
		expect(downloadedTtsEngines(status([]))).toEqual([]);
		expect(downloadedTtsEngines(undefined)).toEqual([]);
	});
});
