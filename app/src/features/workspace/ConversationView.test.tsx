/**
 * ConversationView tests — per-speaker voice picker propagates
 * engine + profile_id into the generate/duck/level payload.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const profiles = [
	{
		id: "p1",
		name: "Maya",
		language: "en",
		voice_type: "preset",
		default_engine: "kokoro",
		generation_count: 0,
		sample_count: 0,
		created_at: "",
		updated_at: "",
	},
	{
		id: "p2",
		name: "Leo",
		language: "en",
		voice_type: "preset",
		default_engine: "kokoro",
		generation_count: 0,
		sample_count: 0,
		created_at: "",
		updated_at: "",
	},
];

vi.mock("@/lib/hooks/useProfiles", () => ({
	useProfiles: vi.fn(() => ({ data: profiles })),
}));
vi.mock("@/lib/api/client", () => ({
	apiClient: {
		generateConversation: vi.fn(),
		autoDuckSpeakers: vi.fn(),
		autoLevelMatch: vi.fn(),
		listConversationPresets: vi.fn(),
	},
}));
vi.mock("@/ui/use-toast", () => ({
	useToast: vi.fn(() => ({ toast: vi.fn() })),
}));

import { apiClient } from "@/lib/api/client";
import { ConversationView } from "./ConversationView";

const mockedApi = {
	generateConversation: vi.mocked(apiClient.generateConversation),
	autoDuckSpeakers: vi.mocked(apiClient.autoDuckSpeakers),
	autoLevelMatch: vi.mocked(apiClient.autoLevelMatch),
	listConversationPresets: vi.mocked(apiClient.listConversationPresets),
};

type LineShape = {
	engine?: string;
	profile_id?: string;
	text?: string;
};

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const renderView = (ui: React.ReactElement) =>
	render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);

beforeEach(() => {
	vi.resetAllMocks();
	mockedApi.generateConversation.mockResolvedValue(new Blob());
	mockedApi.autoDuckSpeakers.mockResolvedValue({ gains: [] });
	mockedApi.autoLevelMatch.mockResolvedValue({ target_lufs: [] });
	mockedApi.listConversationPresets.mockResolvedValue({});
});

async function selectSpeakerVoice(speakerIndex: number, voiceName: string) {
	const triggers = screen.getAllByRole("combobox", { name: /Speaker voice/i });
	fireEvent.keyDown(triggers[speakerIndex], { key: "ArrowDown" });
	const option = await screen.findByRole("option", { name: voiceName });
	fireEvent.click(option);
}

describe("ConversationView line payload", () => {
	it("includes engine and profile_id when generating", async () => {
		const user = userEvent.setup();
		renderView(<ConversationView />);

		// Select Maya for Speaker A (propagates profile p1 to line 1).
		await selectSpeakerVoice(0, "Maya");

		// Type into the initial line.
		await user.type(
			screen.getByPlaceholderText("What does the speaker say?"),
			"Hello there",
		);

		// Generate
		fireEvent.click(screen.getByRole("button", { name: /Generate/i }));
		await waitFor(() =>
			expect(mockedApi.generateConversation).toHaveBeenCalledTimes(1),
		);

		const line = (
			mockedApi.generateConversation.mock.calls[0] as [LineShape[]]
		)[0][0];
		expect(line.engine).toBe("kokoro");
		expect(line.profile_id).toBe("p1");
		expect(line.text).toBe("Hello there");
	});

	it("includes engine and profile_id in auto-duck payload", async () => {
		const user = userEvent.setup();
		renderView(<ConversationView />);

		await selectSpeakerVoice(0, "Maya");

		await user.type(
			screen.getByPlaceholderText("What does the speaker say?"),
			"Hello",
		);

		fireEvent.click(screen.getByRole("button", { name: /Auto-Duck/i }));
		await waitFor(() =>
			expect(mockedApi.autoDuckSpeakers).toHaveBeenCalledTimes(1),
		);

		const line = (
			mockedApi.autoDuckSpeakers.mock.calls[0] as [LineShape[]]
		)[0][0];
		expect(line.engine).toBe("kokoro");
		expect(line.profile_id).toBe("p1");
		expect(line.text).toBe("Hello");
	});

	it("renders the empty state", () => {
		renderView(<ConversationView />);
		expect(
			screen.getByRole("button", { name: /Add dialogue line/ }),
		).toBeInTheDocument();
	});
});
