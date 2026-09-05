/**
 * Help center + skills browser tests — catalog/search and skill CRUD
 * surfaces against mocked clients.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HelpCenter } from "@/features/help/HelpCenter";
import { SkillsBrowser } from "@/features/help/SkillsBrowser";
import { apiClient } from "@/lib/api/client";

vi.mock("@/lib/api/client", () => ({
	apiClient: {
		getHelpFeatures: vi.fn(),
		searchHelp: vi.fn(),
	},
}));

vi.mock("@/lib/api/clientSkills", () => ({
	listCustomSkills: vi.fn(),
	createCustomSkill: vi.fn(),
	updateCustomSkill: vi.fn(),
	deleteCustomSkill: vi.fn(),
}));

import {
	createCustomSkill,
	deleteCustomSkill,
	listCustomSkills,
	updateCustomSkill,
} from "@/lib/api/clientSkills";

beforeEach(() => {
	vi.clearAllMocks();
});

describe("HelpCenter", () => {
	it("lists catalog features and searches", async () => {
		const user = userEvent.setup();
		vi.mocked(apiClient.getHelpFeatures).mockResolvedValue({
			version: 1,
			features: [
				{
					id: "tts",
					name: "Speech",
					category: "voice",
					summary: "Make voices talk",
					where: "Generate tab",
					tools: [],
					keywords: [],
				},
			],
		});
		vi.mocked(apiClient.searchHelp).mockResolvedValue({
			query: "voice",
			results: [
				{
					id: "tts",
					name: "Speech search hit",
					category: "voice",
					summary: "Found through search",
					where: "Generate tab",
					tools: [],
					score: 1,
				},
			],
		});
		render(<HelpCenter />);
		expect(await screen.findByText("Speech")).toBeInTheDocument();
		await user.type(screen.getByLabelText("Search help"), "voice");
		expect(await screen.findByText("Found through search")).toBeInTheDocument();
		expect(apiClient.searchHelp).toHaveBeenCalledWith("voice");
	});

	it("shows an empty state when the catalog is empty", async () => {
		vi.mocked(apiClient.getHelpFeatures).mockResolvedValue({
			version: 1,
			features: [],
		});
		render(<HelpCenter />);
		expect(await screen.findByText("No help topics")).toBeInTheDocument();
	});
});

describe("SkillsBrowser", () => {
	it("lists skills with state and toggles one off", async () => {
		const user = userEvent.setup();
		vi.mocked(listCustomSkills).mockResolvedValue({
			skills: [
				{
					id: "1",
					skill_id: "intro",
					name: "Intro",
					description: "Opens episodes",
					triggers: ["open"],
					steps: [],
					tools: {},
					pitfalls: [],
					enabled: true,
					created_at: null,
					updated_at: null,
				},
			],
		});
		render(<SkillsBrowser />);
		expect(await screen.findByText("Intro")).toBeInTheDocument();
		expect(screen.getByText("On")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Disable" }));
		expect(updateCustomSkill).toHaveBeenCalledWith("intro", {
			enabled: false,
		});
	});

	it("creates and deletes through the client", async () => {
		const user = userEvent.setup();
		vi.mocked(listCustomSkills)
			.mockResolvedValueOnce({ skills: [] })
			.mockResolvedValueOnce({
				skills: [
					{
						id: "2",
						skill_id: "outro",
						name: "Outro",
						description: "",
						triggers: [],
						steps: [],
						tools: {},
						pitfalls: [],
						enabled: true,
						created_at: null,
						updated_at: null,
					},
				],
			});
		vi.mocked(createCustomSkill).mockResolvedValue({
			id: "2",
			skill_id: "outro",
			name: "Outro",
			description: "",
			triggers: [],
			steps: [],
			tools: {},
			pitfalls: [],
			enabled: true,
			created_at: null,
			updated_at: null,
		});
		render(<SkillsBrowser />);
		expect(await screen.findByText("No custom skills yet")).toBeInTheDocument();
		await user.type(screen.getByLabelText("Skill ID"), "outro");
		await user.type(screen.getByLabelText("Name"), "Outro");
		await user.click(screen.getByRole("button", { name: "New skill" }));
		expect(createCustomSkill).toHaveBeenCalledWith(
			expect.objectContaining({ skill_id: "outro", name: "Outro" }),
		);
		expect(await screen.findByText("Outro")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Delete" }));
		expect(deleteCustomSkill).toHaveBeenCalledWith("outro");
	});
});
