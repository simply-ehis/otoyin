/**
 * assistantCommands tests — executeAssistantCommand routes through the
 * command registry, getAvailableCommands returns function schemas, and
 * dispatchAssistantCommand emits DOM events.
 */
import { describe, expect, it, vi } from "vitest";
import {
	dispatchAssistantCommand,
	executeAssistantCommand,
	getAvailableCommands,
} from "@/lib/assistantCommands";

const mockSetSelectedProfileId = vi.fn();

vi.mock("@/stores/uiStore", () => ({
	useUIStore: {
		getState: vi.fn(() => ({
			setSelectedProfileId: mockSetSelectedProfileId,
		})),
	},
}));

beforeEach(() => {
	vi.clearAllMocks();
	mockSetSelectedProfileId.mockClear();
});

describe("executeAssistantCommand", () => {
	it("executes a registered command and returns ok", async () => {
		const result = await executeAssistantCommand("ui_set_voice_profile", {
			profile_id: "prof-1",
		});
		expect(result.ok).toBe(true);
		expect(mockSetSelectedProfileId).toHaveBeenCalledWith("prof-1");
	});

	it("clears the profile when profile_id is missing", async () => {
		await executeAssistantCommand("ui_set_voice_profile", {});
		expect(mockSetSelectedProfileId).toHaveBeenCalledWith(null);
	});

	it("returns ok:false for unknown commands", async () => {
		const result = await executeAssistantCommand("no.such.command", {});
		expect(result.ok).toBe(false);
		expect(result.error).toBeDefined();
	});

	it("returns ok:false when input validation fails", async () => {
		const result = await executeAssistantCommand("studio_set_master_volume", {
			volume: "not-a-number",
		});
		expect(result.ok).toBe(false);
	});
});

describe("getAvailableCommands", () => {
	it("returns function schemas for all registered commands", () => {
		const schemas = getAvailableCommands();
		expect(schemas.length).toBeGreaterThan(0);
		const names = schemas.map((s) => s.name);
		expect(names).toContain("ui_set_voice_profile");
		expect(names).toContain("studio_add_track");
		expect(names).toContain("voice_changer_enable");
		for (const schema of schemas) {
			expect(schema.name).toBeDefined();
			expect(schema.description).toBeDefined();
			expect(schema.parameters.type).toBe("object");
		}
	});
});

describe("dispatchAssistantCommand", () => {
	it("emits an assistant-command DOM event", () => {
		const seen: string[] = [];
		const onCmd = (e: Event) => {
			seen.push((e as CustomEvent).detail.intent as string);
		};
		window.addEventListener("assistant-command", onCmd);
		try {
			dispatchAssistantCommand("ui_navigate", { view: "/voices" });
			expect(seen).toEqual(["ui_navigate"]);
		} finally {
			window.removeEventListener("assistant-command", onCmd);
		}
	});
});
