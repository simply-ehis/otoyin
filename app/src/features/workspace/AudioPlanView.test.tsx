/**
 * AudioPlanView tests — per-track voice + engine picker calls
 * apiClient.updatePlanTrack with voice_profile_id/engine.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VoiceProfileResponse } from "@/lib/api/types";

const profiles: VoiceProfileResponse[] = [
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
	useProfiles: vi.fn(),
}));
vi.mock("@/lib/api/client", () => ({
	apiClient: {
		generateAutoPlan: vi.fn(),
		updatePlanTrack: vi.fn(),
	},
}));
vi.mock("@/ui/use-toast", () => ({
	useToast: vi.fn(() => ({ toast: vi.fn() })),
}));

import { apiClient } from "@/lib/api/client";
import { useProfiles } from "@/lib/hooks/useProfiles";
import { AudioPlanView, PlanTrackRow } from "./AudioPlanView";

const mockedApi = {
	generateAutoPlan: vi.mocked(apiClient.generateAutoPlan),
	updatePlanTrack: vi.mocked(apiClient.updatePlanTrack),
};
const mockedProfiles = vi.mocked(useProfiles);

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const renderView = (ui: React.ReactElement) =>
	render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);

const track = {
	id: "t1",
	track_type: "dialogue",
	name: "Alice Line",
	character: "Alice",
	start_time_ms: 0,
	end_time_ms: 5000,
	notes: "",
	voice_profile_id: null,
	engine: null,
};

beforeEach(() => {
	vi.resetAllMocks();
	mockedApi.updatePlanTrack.mockResolvedValue({
		plan_json: "{}",
		track_id: "t1",
	});
	mockedProfiles.mockReturnValue({ data: profiles } as any);
});

describe("PlanTrackRow voice picker", () => {
	it("calls onUpdate with voice_profile_id when a voice is chosen", async () => {
		const onUpdate = vi.fn();
		renderView(
			<PlanTrackRow
				track={track}
				profiles={profiles}
				onUpdate={onUpdate}
				isPending={false}
			/>,
		);

		const voiceTrigger = screen.getByRole("combobox", {
			name: /Voice for Alice Line/i,
		});
		fireEvent.keyDown(voiceTrigger, { key: "ArrowDown" });
		const mayaOption = await screen.findByRole("option", { name: "Maya" });
		fireEvent.click(mayaOption);

		expect(onUpdate).toHaveBeenCalledWith("t1", "voice_profile_id", "p1");
	});

	it("disables the voice picker when pending", async () => {
		const onUpdate = vi.fn();
		renderView(
			<PlanTrackRow
				track={track}
				profiles={profiles}
				onUpdate={onUpdate}
				isPending={true}
			/>,
		);

		expect(
			screen.getByRole("combobox", { name: /Voice for Alice Line/i }),
		).toBeDisabled();
	});
});

describe("PlanTrackRow engine picker", () => {
	it("calls onUpdate with engine when an engine is chosen", async () => {
		const onUpdate = vi.fn();
		renderView(
			<PlanTrackRow
				track={track}
				profiles={profiles}
				onUpdate={onUpdate}
				isPending={false}
			/>,
		);

		const engineTrigger = screen.getByRole("combobox", {
			name: /Engine for Alice Line/i,
		});
		fireEvent.keyDown(engineTrigger, { key: "ArrowDown" });
		const xttsOption = await screen.findByRole("option", { name: "xtts" });
		fireEvent.click(xttsOption);

		expect(onUpdate).toHaveBeenCalledWith("t1", "engine", "xtts");
	});
});

describe("PlanTrackRow non-dialogue tracks", () => {
	it("renders SFX/music tracks without voice/engine pickers", () => {
		const sfxTrack = { ...track, track_type: "sfx", character: undefined };
		renderView(
			<PlanTrackRow
				track={sfxTrack}
				profiles={profiles}
				onUpdate={vi.fn()}
				isPending={false}
			/>,
		);
		expect(
			screen.queryByRole("combobox", { name: /Voice for/i }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("combobox", { name: /Engine for/i }),
		).not.toBeInTheDocument();
	});
});

describe("AudioPlanView smoke", () => {
	it("renders the empty state and header", () => {
		renderView(<AudioPlanView />);
		expect(screen.getByText("Audio Plan")).toBeInTheDocument();
		// Empty state shows when no scenes exist.
		expect(screen.getByText("No scenes yet")).toBeInTheDocument();
	});
});
