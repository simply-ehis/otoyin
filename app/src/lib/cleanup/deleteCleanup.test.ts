import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";
import { usePlayerStore } from "@/stores/playerStore";
import { useUIStore } from "@/stores/uiStore";
import {
	clearAllAppDataState,
	clearDeletedGenerationState,
	clearDeletedProfileState,
} from "./deleteCleanup";

describe("deleteCleanup", () => {
	let qc: QueryClient;

	beforeEach(() => {
		qc = new QueryClient();
		useUIStore.setState({
			selectedProfileId: "p1",
			selectedVoiceId: "p1",
			editingProfileId: "p1",
			selectedEngine: "kokoro",
		});
		usePlayerStore.getState().setAudio("http://x/a.wav", "g1", "p1", "t");
	});

	it("clearDeletedProfileState drops caches, selection, and player", () => {
		qc.setQueryData(["profiles"], [{ id: "p1" }, { id: "p2" }]);
		qc.setQueryData(["profiles", "p1"], { id: "p1" });
		qc.setQueryData(["profiles", "p1", "samples"], []);

		clearDeletedProfileState(qc, "p1");

		expect(qc.getQueryData(["profiles", "p1"])).toBeUndefined();
		expect(qc.getQueryData(["profiles", "p1", "samples"])).toBeUndefined();
		expect(useUIStore.getState().selectedProfileId).toBeNull();
		expect(useUIStore.getState().selectedVoiceId).toBeNull();
		expect(usePlayerStore.getState().audioUrl).toBeNull();
	});

	it("clearDeletedProfileState leaves other profiles alone", () => {
		qc.setQueryData(["profiles", "p2"], { id: "p2" });
		useUIStore.setState({ selectedProfileId: "p2" });

		clearDeletedProfileState(qc, "p1");

		expect(qc.getQueryData(["profiles", "p2"])).toEqual({ id: "p2" });
		expect(useUIStore.getState().selectedProfileId).toBe("p2");
	});

	it("clearDeletedGenerationState resets player only for that generation", () => {
		clearDeletedGenerationState(qc, "g1");
		expect(usePlayerStore.getState().audioUrl).toBeNull();

		usePlayerStore.getState().setAudio("http://x/b.wav", "g2", "p1", "t");
		clearDeletedGenerationState(qc, "g1");
		expect(usePlayerStore.getState().audioUrl).toBe("http://x/b.wav");
	});

	it("clearAllAppDataState wipes every query and selection", () => {
		qc.setQueryData(["profiles"], []);
		qc.setQueryData(["history"], []);
		qc.setQueryData(["modelStatus"], { models: [] });

		clearAllAppDataState(qc);

		expect(qc.getQueryData(["profiles"])).toBeUndefined();
		expect(qc.getQueryData(["history"])).toBeUndefined();
		expect(qc.getQueryData(["modelStatus"])).toBeUndefined();
		expect(useUIStore.getState().selectedProfileId).toBeNull();
		expect(useUIStore.getState().selectedEngine).toBe("");
		expect(usePlayerStore.getState().audioUrl).toBeNull();
	});
});
